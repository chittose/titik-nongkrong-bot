require('dotenv').config();
const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, Events 
} = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- SERVER DATABASE ---
const activeServers = new Map();
let knownTools = new Set(); // Menyimpan daftar tools dari Roblox

// --- WEB SERVER & API UNTUK ROBLOX ---
const app = express();
app.use(express.json());

app.post('/api/heartbeat', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== process.env.BOT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId, players, tools } = req.body;

    activeServers.set(jobId, { players, lastSeen: Date.now() });

    if (tools && Array.isArray(tools)) {
        tools.forEach(t => knownTools.add(t));
    }

    console.log(`[Heartbeat] JobId: ${jobId} | Players: ${players.length} | Tools: ${tools ? tools.length : 0}`);

    res.status(200).send('OK');
});

setInterval(() => {
    const now = Date.now();
    for (const [jobId, data] of activeServers.entries()) {
        if (now - data.lastSeen > 60000) activeServers.delete(jobId);
    }
}, 30000);

app.get('/', (req, res) => res.send('Titik Nongkrong API is Online!'));
app.get('/ping', (req, res) => res.send('pong'));
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`✅ Web API Server ready on port ${port}.`);
});

// --- DISCORD BOT SETUP ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const UNIVERSE_ID = "8992847386"; 
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY; 
const ADMIN_ROLES = ["1506928484314775603", "1506952791015297115", "1506952833549860864"];

client.on(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle('🟢 Bot Online')
            .setDescription('Bot telah restart dan siap digunakan.')
            .setColor('#00FF7F')
            .addFields(
                { name: '🤖 Bot', value: client.user.tag, inline: true },
                { name: '⏰ Waktu', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Auto-ping aktif — bot tidak akan sleep' });
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// 1. COMMAND PANEL UTAMA
client.on(Events.MessageCreate, async (message) => {
    if (message.content === '!ping') {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        
        let hostName = "💻 Local / Unknown";
        if (process.env.RAILWAY_PUBLIC_DOMAIN) hostName = "🚂 Railway";
        else if (process.env.RENDER_EXTERNAL_URL) hostName = "☁️ Render";
        else if (process.env.REPLIT_DOMAINS) hostName = "🌀 Replit";

        let location = "Mencari lokasi...";
        let ipAddress = "Hidden";
        try {
            const locRes = await axios.get('http://ip-api.com/json/', { timeout: 2000 });
            if (locRes.data && locRes.data.country) {
                location = `${locRes.data.city}, ${locRes.data.country} ${locRes.data.countryCode === 'SG' ? '🇸🇬' : '🌍'}`;
                ipAddress = locRes.data.query || "Hidden";
            }
        } catch(e) {
            location = "Lokasi Tidak Diketahui";
        }

        let serverInfo = "❌ Tidak ada server Roblox yang terhubung.";
        if (activeServers.size > 0) {
            const serverList = Array.from(activeServers.entries()).map(([jobId, data], i) => `> **Server ${i+1}:** \`${jobId.substring(0,8)}...\` (${data.players.length} Player)`).join('\n');
            serverInfo = `✅ **${activeServers.size} Server Aktif:**\n${serverList}`;
        }

        await sent.edit(`🏓 **Pong!**\n⏳ Bot Latency: **${latency}ms**\n💓 API Ping: **${client.ws.ping}ms**\n🖥️ Server Host: **${hostName}**\n📍 Lokasi: **${location}**\n🌐 IP Address: **${ipAddress}**\n\n${serverInfo}`);
        
        // Hapus otomatis
        message.delete().catch(()=>{});
        setTimeout(() => sent.delete().catch(()=>{}), 15000); 
        return;
    }

    if (message.content === '!uptime') {
        const totalSeconds = Math.floor(process.uptime());
        const d = Math.floor(totalSeconds / (3600 * 24));
        const h = Math.floor(totalSeconds % (3600 * 24) / 3600);
        const m = Math.floor(totalSeconds % 3600 / 60);
        const s = Math.floor(totalSeconds % 60);
        
        let timeString = '';
        if (d > 0) timeString += `${d} hari, `;
        if (h > 0) timeString += `${h} jam, `;
        if (m > 0) timeString += `${m} menit, `;
        timeString += `${s} detik`;
        
        const sent = await message.reply(`⏱️ **Bot Uptime:** ${timeString}\n📅 **Online Sejak:** <t:${Math.floor((Date.now() - (totalSeconds * 1000)) / 1000)}:R>`);
        
        // Hapus otomatis setelah 10 detik
        message.delete().catch(()=>{});
        setTimeout(() => sent.delete().catch(()=>{}), 10000);
        return;
    }

    if (message.content.startsWith('!clear')) {
        const hasPermission = message.member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
        if (!hasPermission) return message.reply('❌ Kamu tidak punya izin.');
        const args = message.content.split(' ');
        const amount = parseInt(args[1]) || 100;
        if (amount < 1 || amount > 100) return message.reply('⚠️ Jumlah harus antara 1 - 100.');
        try {
            await message.delete().catch(() => {});
            const fetched = await message.channel.messages.fetch({ limit: Math.min(amount, 100) });
            const deleted = await message.channel.bulkDelete(fetched, true);
            const notif = await message.channel.send(`🗑️ **${deleted.size} pesan** berhasil dihapus.`);
            setTimeout(() => notif.delete().catch(() => {}), 3000);
        } catch (e) {
            console.error('Clear error:', e.message);
            message.channel.send(`❌ Gagal hapus pesan. Error: \`${e.message}\``).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
        }
        return;
    }

    if (message.content === '!panel') {
        const hasPermission = message.member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
        if (!hasPermission) return;

        const embed = new EmbedBuilder()
            .setTitle('🌐 TITIK NONGKRONG | COMMAND CENTER')
            .setDescription('Pantau server dan eksekusi perintah dari jarak jauh.')
            .setColor('#00F5FF')
            .addFields(
                { name: '📊 Live Servers', value: `${activeServers.size} Server`, inline: true },
                { name: '👥 Total Players', value: `${Array.from(activeServers.values()).reduce((a, b) => a + b.players.length, 0)} Online`, inline: true },
                { name: '🎒 Tools Tersedia', value: `${knownTools.size} Item Tersinkronisasi`, inline: true }
            );

        const row0 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_view_servers').setLabel('🔍 Lihat Daftar Server & Pemain').setStyle(ButtonStyle.Primary));
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn|kick|GLOBAL').setLabel('🦵 Global Kick').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn|ban|GLOBAL').setLabel('🔨 Global Ban').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn|unban|GLOBAL').setLabel('🕊️ Global Unban').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn|warn|GLOBAL').setLabel('⚠️ Global Warn').setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn|kill|GLOBAL').setLabel('💀 Global Kill').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn|heal|GLOBAL').setLabel('💉 Global Heal').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn|coin|GLOBAL').setLabel('💰 Global Coin').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn|removecoin|GLOBAL').setLabel('💸 Reduce Coin').setStyle(ButtonStyle.Danger)
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn|item|GLOBAL').setLabel('🎁 Global Item').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn|broadcast|GLOBAL').setLabel('📢 Global Broadcast').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row0, row1, row2, row3] });
    }
});

// 2. INTERAKSI TOMBOL & DROPDOWN
client.on(Events.InteractionCreate, async (interaction) => {
    const hasPermission = interaction.member?.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
    if (!hasPermission) return;

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_view_servers') {
            if (activeServers.size === 0) return interaction.reply({ content: '⚠️ Tidak ada server online.', ephemeral: true });

            const options = Array.from(activeServers.entries()).map(([jobId, data], i) => ({
                label: `Server ${i + 1} (${data.players.length} Pemain)`,
                description: `ID: ${jobId.substring(0, 8)}...`,
                value: jobId
            }));

            const selectMenu = new StringSelectMenuBuilder().setCustomId('select_server').setPlaceholder('Pilih Server...').addOptions(options);
            await interaction.reply({ content: 'Pilih server:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            return;
        }

        if (interaction.customId.startsWith('btn|item|')) {
            const selectedJobId = interaction.customId.split('|')[2];
            if (knownTools.size === 0) {
                return interaction.reply({ content: '⚠️ Belum ada data Tools dari server Roblox. Pastikan game sedang dimainkan.', ephemeral: true });
            }
            const toolOptions = Array.from(knownTools).map(tool => ({
                label: tool, value: tool, description: `Kirim item ${tool}`
            })).slice(0, 25);

            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select|tool|${selectedJobId}`).setPlaceholder('Pilih Tool yang akan diberikan...').addOptions(toolOptions);
            await interaction.reply({ content: 'Pilih Tool/Item:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            return;
        }

        const idParts = interaction.customId.split('|');
        if (idParts[0] !== 'btn') return;

        const cmd = idParts[1];
        const selectedJobId = idParts[2];

        const tIn = () => new TextInputBuilder().setCustomId('input_target').setLabel('Username Target').setStyle(TextInputStyle.Short).setRequired(true);
        const rIn = () => new TextInputBuilder().setCustomId('input_reason').setLabel('Alasan').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const dIn = () => new TextInputBuilder().setCustomId('input_duration').setLabel('Durasi (0=Permanen)').setStyle(TextInputStyle.Short).setRequired(true);

        let m = new ModalBuilder().setCustomId(`modal|${cmd}|${selectedJobId}`);

        if (cmd==='kick'||cmd==='warn') { m.setTitle(cmd==='kick'?'Kick':'Warn'); m.addComponents(new ActionRowBuilder().addComponents(tIn()), new ActionRowBuilder().addComponents(rIn())); }
        else if (cmd==='ban') { m.setTitle('Ban'); m.addComponents(new ActionRowBuilder().addComponents(tIn()), new ActionRowBuilder().addComponents(dIn()), new ActionRowBuilder().addComponents(rIn())); }
        else if (cmd==='unban'||cmd==='kill'||cmd==='heal') { m.setTitle('Target Action'); m.addComponents(new ActionRowBuilder().addComponents(tIn())); }
        else if (cmd==='coin' || cmd==='removecoin') { m.setTitle(cmd==='coin' ? 'Give Coin' : 'Reduce Coin'); m.addComponents(new ActionRowBuilder().addComponents(tIn()), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_amount').setLabel('Jumlah (Angka)').setStyle(TextInputStyle.Short).setRequired(true))); }
        else if (cmd==='broadcast') { m.setTitle('Broadcast'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_message').setLabel('Pesan').setStyle(TextInputStyle.Paragraph).setRequired(true))); }

        await interaction.showModal(m);
    }
    else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_server') {
            await interaction.deferUpdate();
            const selectedJobId = interaction.values[0];
            const data = activeServers.get(selectedJobId);
            if (!data) return interaction.editReply({ content: '❌ Server kadaluarsa.', embeds: [], components: [] });

            const list = data.players.length > 0 ? data.players.join('\n') : "Kosong";
            const embed = new EmbedBuilder().setTitle(`Daftar Pemain di Server`).setDescription(`ID: \`${selectedJobId}\`\n\`\`\`\n${list}\n\`\`\``).setColor('#8A2BE2');

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn|kick|${selectedJobId}`).setLabel('🦵 Server Kick').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`btn|ban|${selectedJobId}`).setLabel('🔨 Server Ban').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`btn|warn|${selectedJobId}`).setLabel('⚠️ Server Warn').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`btn|kill|${selectedJobId}`).setLabel('💀 Server Kill').setStyle(ButtonStyle.Danger)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn|heal|${selectedJobId}`).setLabel('💉 Server Heal').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`btn|coin|${selectedJobId}`).setLabel('💰 Server Coin').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`btn|removecoin|${selectedJobId}`).setLabel('💸 Server Reduce Coin').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`btn|item|${selectedJobId}`).setLabel('🎁 Server Item').setStyle(ButtonStyle.Success)
            );
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn|broadcast|${selectedJobId}`).setLabel('📢 Server Broadcast').setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({ content: null, embeds: [embed], components: [row1, row2, row3] });
        }
        else if (interaction.customId.startsWith('select|tool|')) {
            const selectedJobId = interaction.customId.split('|')[2];
            const selectedTool = interaction.values[0];
            const modal = new ModalBuilder().setCustomId(`modalgiveitem|${selectedTool}|${selectedJobId}`).setTitle(`Give: ${selectedTool}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_target').setLabel('Username Target').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_qty').setLabel('Jumlah').setStyle(TextInputStyle.Short).setValue("1").setRequired(true))
            );
            await interaction.showModal(modal);
        }
    }
});

// 3. MODAL SUBMIT (Kirim ke Roblox)
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    await interaction.deferReply({ ephemeral: true });

    const getVal = (id) => { try { return interaction.fields.getTextInputValue(id); } catch(e) { return null; } };
    let p = { AdminDiscord: interaction.user.tag, Target: getVal('input_target') };

    if (interaction.customId.startsWith('modalgiveitem|')) {
        const parts = interaction.customId.split('|');
        p.Command = 'GiveItem';
        p.ItemId = parts[1];
        if (parts[2] && parts[2] !== 'GLOBAL') p.TargetJobId = parts[2];
        p.Quantity = parseInt(getVal('input_qty')) || 1;
    } 
    else if (interaction.customId.startsWith('modal|')) {
        const parts = interaction.customId.split('|');
        p.Command = parts[1];
        if (parts[2] && parts[2] !== 'GLOBAL') p.TargetJobId = parts[2];

        if (p.Command==='kick'||p.Command==='warn') { p.Reason = getVal('input_reason'); }
        else if (p.Command==='ban') { p.Reason = getVal('input_reason'); p.Duration = parseInt(getVal('input_duration'))||0; }
        else if (p.Command==='coin' || p.Command==='removecoin') { 
            let amt = parseInt(getVal('input_amount'))||0;
            p.Amount = p.Command === 'removecoin' ? -Math.abs(amt) : Math.abs(amt);
            p.Command = 'GiveCoin'; 
        }
        else if (p.Command==='broadcast') { p.Message = getVal('input_message'); }

        p.Command = p.Command.charAt(0).toUpperCase() + p.Command.slice(1);
    }

    try {
        await axios.post(`https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/DiscordAdminCommands`, 
        { message: JSON.stringify(p) }, { headers: { 'x-api-key': ROBLOX_API_KEY, 'Content-Type': 'application/json' }});

        let targetLabel = p.TargetJobId ? "Server Tertentu" : "Semua Server";
        await interaction.editReply(`✅ Berhasil mengirim perintah **${p.Command}** ke Roblox (${targetLabel})!`);
    } catch (e) {
        await interaction.editReply('❌ Gagal mengirim perintah ke server Roblox.');
    }
});

client.login(process.env.DISCORD_TOKEN);
