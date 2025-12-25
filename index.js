/**
 *  ██████╗██████╗ ██╗██████╗ ██████╗ ███████╗    ██╗   ██╗██╗  ████████╗██╗███╗   ███╗ █████╗ ████████╗███████╗
 * ██╔════╝██╔══██╗██║██╔══██╗██╔══██╗██╔════╝    ██║   ██║██║  ╚══██╔══╝██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝
 * ██║     ██████╔╝██║██████╔╝██████╔╝███████╗    ██║   ██║██║     ██║   ██║██╔████╔██║███████║   ██║   █████╗  
 * ██║     ██╔══██╗██║██╔═══╝ ██╔═══╝ ╚════██║    ██║   ██║██║     ██║   ██║██║╚██╔╝██║██╔══██║   ██║   ██╔══╝  
 * ╚██████╗██║  ██║██║██║     ██║     ███████║    ╚██████╔╝███████╗██║   ██║██║ ╚═╝ ██║██║  ██║   ██║   ███████╗
 *  ╚═════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝     ╚══════╝     ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
 * 
 * ULTIMATE EDITION - ALL SYSTEMS INTEGRATED + ADVANCED WAGON LFG
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

// Core Systems
let NexusLFG = null;
try { NexusLFG = require('./nexus/lfg'); } catch (e) {}
let VoiceSystem = null, VoiceChatHandler = null;
try { const v = require('./shared/voiceSystem'); VoiceSystem = v.VoiceSystem; VoiceChatHandler = v.VoiceChatHandler; } catch (e) {}
let UltimateBotIntelligence = null;
try { UltimateBotIntelligence = require('./shared/ultimateIntelligence').UltimateBotIntelligence; } catch (e) {}
let FreeRoamSystem = null;
try { FreeRoamSystem = require('./freeroam'); } catch (e) {}
let TheBrain = null;
try { TheBrain = require('./sentient').TheBrain; } catch (e) {}
let ApexBrain = null;
try { ApexBrain = require('./apex').ApexBrain; } catch (e) {}
let autonomousChat = null;
try { autonomousChat = require('./shared/autonomousChat'); } catch (e) {}
let mediaGenerator = null;
try { mediaGenerator = require('./shared/mediaGenerator'); } catch (e) {}

// ADVANCED WAGON LFG SYSTEM
const advancedWagonLFG = require('./shared/advancedWagonLFG');

const MY_BOT_ID = 'cripps';
const BOT_NAME = 'Cripps';
const PREFIX = '?';
const OTHER_BOT_IDS = [process.env.LESTER_BOT_ID, process.env.PAVEL_BOT_ID, process.env.MADAM_BOT_ID, process.env.CHIEF_BOT_ID].filter(Boolean);
const ALLOWED_CHANNEL_IDS = process.env.ALLOWED_CHANNEL_IDS?.split(',').filter(Boolean) || [];

const CRIPPS_SYSTEM = `You are Cripps from Red Dead Online. Grizzled camp manager and trader.

CRITICAL: Keep responses SHORT - 2-4 sentences MAX. No essays!

PERSONALITY: Grumpy old frontiersman, mysterious past, complains but helps. Pride in trading work.

STYLE: Old West speech (not over the top). One *action* max. Don't tell full stories - just hint at them.

SERVER CHANNELS (ONLY mention these - never make up channels):
- #wagon-lfg - Red Dead wagon LFG (use ?wagon)
- #bounty-lfg - Red Dead bounty LFG
- #cayo-lfg - GTA heist LFG
- #talk-to-cripps - Chat with you
- #bot-commands - Command reference

NEVER mention channels that don't exist.

EXAMPLES:
"*looks up from tanning leather* Yeah? What is it?"
"Head to #wagon-lfg and use ?wagon. That's where the action is, partner."
"Did I ever tell you about the time I... *trails off* Anyway, what do you need?"

You have memory. You remember users.`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

// Make db available to handlers
client.db = pool;

let nexusLFG = null, intelligence = null, sentientBrain = null, apexBrain = null, freeRoam = null, voiceSystem = null, voiceChatHandler = null;
const conversationMemory = new Map();
const activeConversations = new Map();

client.once(Events.ClientReady, async () => {
  console.log(`[CRIPPS ULTIMATE] Logged in as ${client.user.tag}`);

  // Initialize V6 Intelligence
  if (UltimateBotIntelligence) {
    try { 
      intelligence = new UltimateBotIntelligence(pool, client, MY_BOT_ID); 
      await intelligence.initialize(); 
      console.log('🧠 V6 Ultimate Intelligence: ONLINE'); 
    } catch (e) { console.error('V6 init:', e.message); }
  }
  
  // Initialize other brain systems
  if (TheBrain) try { sentientBrain = new TheBrain(MY_BOT_ID, pool); console.log('🧬 Sentient Brain: ONLINE'); } catch (e) {}
  if (ApexBrain) try { apexBrain = new ApexBrain(MY_BOT_ID, pool); console.log('⚡ Apex Brain: ONLINE'); } catch (e) {}
  if (FreeRoamSystem) try { freeRoam = new FreeRoamSystem(MY_BOT_ID, client.user.id, CRIPPS_SYSTEM, pool); console.log('🚀 FreeRoam: ONLINE'); } catch (e) {}
  if (NexusLFG) try { nexusLFG = new NexusLFG(pool, anthropic, client, MY_BOT_ID); await nexusLFG.initialize(); console.log('🎮 NEXUS LFG: ONLINE'); } catch (e) {}
  
  // Initialize Voice
  if (VoiceSystem && process.env.ELEVENLABS_API_KEY) { 
    try { 
      voiceSystem = new VoiceSystem(MY_BOT_ID, process.env.ELEVENLABS_API_KEY); 
      voiceChatHandler = new VoiceChatHandler(client, voiceSystem, CRIPPS_SYSTEM, anthropic); 
      voiceChatHandler.setupListeners(); 
      console.log('🎙️ Voice: ONLINE'); 
    } catch (e) {} 
  }

  // Initialize ADVANCED WAGON LFG
  try {
    advancedWagonLFG.initialize(client);
    await advancedWagonLFG.createTables(client);
    console.log('🛒 Advanced Wagon LFG: ONLINE');
  } catch (e) {
    console.error('Wagon LFG init error:', e.message);
  }

  client.user.setPresence({ activities: [{ name: 'running the trading post | ?wagon', type: 0 }], status: 'online' });
  
  // Start autonomous chat
  if (autonomousChat && ALLOWED_CHANNEL_IDS.length > 0) {
    setTimeout(() => { 
      try { 
        autonomousChat.startAutonomous(
          ALLOWED_CHANNEL_IDS.map(id => client.channels.cache.get(id)).filter(Boolean), 
          { botId: MY_BOT_ID, botName: BOT_NAME, client, anthropic, pool, intelligence, personality: CRIPPS_SYSTEM, otherBotIds: OTHER_BOT_IDS }
        ); 
      } catch (e) {} 
    }, 20000);
  }
  
  if (intelligence) await intelligence.broadcastToOtherBots('bot_online', { botId: MY_BOT_ID, timestamp: new Date().toISOString() });
  setInterval(() => { if (intelligence) intelligence.runMaintenance().catch(console.error); }, 6 * 60 * 60 * 1000);
  console.log('[CRIPPS] ALL SYSTEMS ONLINE');
});

function isOtherBot(userId) { return OTHER_BOT_IDS.includes(userId); }
function isInActiveConversation(channelId, userId) { const c = activeConversations.get(channelId); if (!c) return false; if (Date.now() - c.lastTime > 60000) { activeConversations.delete(channelId); return false; } return c.userId === userId; }
function trackConversation(channelId, userId) { activeConversations.set(channelId, { userId, lastTime: Date.now() }); }

async function checkShouldRespond(message) {
  // NEVER respond in counting channel
  if (message.channel.name === 'counting') return false;
  
  // NEVER respond in OTHER bots' talk-to channels
  const channelName = message.channel.name;
  if (channelName.startsWith('talk-to-') && channelName !== 'talk-to-cripps') return false;
  
  if (channelName === 'talk-to-cripps') return true;
  if (isInActiveConversation(message.channel.id, message.author.id)) return true;
  if (message.mentions.has(client.user)) return true;
  const content = message.content.toLowerCase();
  if (content.includes('cripps') || content.includes('wagon') || content.includes('trader') || content.includes('camp')) return true;
  if (channelName.includes('lfg') || channelName.includes('log') || channelName.includes('staff')) return false;
  if (freeRoam) { const d = await freeRoam.shouldRespond(message); if (d.respond) return true; }
  if (isOtherBot(message.author.id)) return Math.random() < 0.35;
  return Math.random() < 0.20;
}

async function generateResponse(message) {
  const history = conversationMemory.get(message.author.id) || [];
  history.push({ role: 'user', content: message.content });
  while (history.length > 20) history.shift();

  try {
    await message.channel.sendTyping();
    let intelligencePrompt = '', ctx = null;
    if (intelligence) { ctx = await intelligence.processIncoming(message); intelligencePrompt = intelligence.buildPromptContext(ctx); }
    
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system: CRIPPS_SYSTEM + (intelligencePrompt ? '\n\n' + intelligencePrompt : ''), messages: history });
    let reply = response.content[0].text;
    
    if (intelligence && ctx) { reply = await intelligence.processOutgoing(message, reply, ctx); await intelligence.storeConversationMemory(message, reply); }
    history.push({ role: 'assistant', content: reply });
    conversationMemory.set(message.author.id, history);
    
    await new Promise(r => setTimeout(r, Math.min(reply.length * 35, 4000)));
    const sent = await message.reply(reply);
    trackConversation(message.channel.id, message.author.id);
    
    if (intelligence?.learning) await intelligence.learning.recordResponse(sent.id, message.channel.id, message.author.id, 'reply', 'general', reply.length);
    if (mediaGenerator) try { await mediaGenerator.handleBotMedia(MY_BOT_ID, reply, message.channel); } catch (e) {}
  } catch (e) { console.error('Response error:', e); await message.reply("*grumbles* Something ain't right with the equipment..."); }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot && !isOtherBot(message.author.id)) return;
  if (message.author.id === client.user.id) return;
  if (!message.guild) { await generateResponse(message); return; }

  const channelName = message.channel.name;

  // Don't respond in counting
  if (channelName === 'counting') return;

  // WAGON LFG Channel - Use ADVANCED system
  if (channelName === 'wagon-lfg') {
    const requiredRoles = ['Wagon Runner', 'Frontier Outlaw', '🐴 Frontier Outlaw', '🛞 Wagon Runner'];
    const hasRole = message.member?.roles.cache.some(r => requiredRoles.some(req => r.name.includes(req) || r.name === req));
    const rolesChannel = message.guild.channels.cache.find(c => c.name === 'get-roles' || c.name === 'roles');
    
    if (!hasRole) {
      try { 
        await message.delete(); 
        const w = await message.channel.send(`<@${message.author.id}> Hold up partner! You need a **Wagon Runner** or **Frontier Outlaw** role. ${rolesChannel ? `Head to <#${rolesChannel.id}>` : ''}`); 
        setTimeout(() => w.delete().catch(() => {}), 15000); 
      } catch (e) {}
      return;
    }
    
    // Handle commands
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();
      
      // ADVANCED WAGON LFG COMMANDS
      if (cmd === 'wagon' || cmd === 'delivery' || cmd === 'trader') {
        await advancedWagonLFG.createSession(message, client);
        return;
      }
      
      // BLACKLIST COMMANDS
      if (cmd === 'myblacklist') {
        try {
          const { getBlacklistSystem } = require('./shared/blacklistSystem');
          const blacklist = getBlacklistSystem(pool);
          await blacklist.showBlacklist(message);
        } catch (e) { message.reply('*spits* Blacklist system ain\'t working, partner.'); }
        return;
      }
      
      if (cmd === 'unblock') {
        try {
          const { getBlacklistSystem } = require('./shared/blacklistSystem');
          const blacklist = getBlacklistSystem(pool);
          const target = message.mentions.users.first();
          if (!target) return message.reply('*spits* Mention someone: `?unblock @user`');
          await blacklist.removeFromBlacklist(message.author.id, target.id);
          message.reply(`✅ **${target.username}** can join your wagons again, partner.`);
        } catch (e) { message.reply('*spits* Couldn\'t unblock \'em.'); }
        return;
      }
      
      if (cmd === 'endwagon') {
        await message.reply('*spits* Use the End Session button on your active wagon run, partner.');
        return;
      }
      
      // Legacy nexus commands fallback
      if (['moonshine', 'hunting', 'posse', 'done', 'cancel'].includes(cmd) && nexusLFG) {
        await nexusLFG.handleCommand(message, cmd, args);
        return;
      }
    }
    
    // Natural language LFG detection (legacy)
    if (nexusLFG) { 
      const lfg = await nexusLFG.detectLFGIntent(message); 
      if (lfg) { 
        await advancedWagonLFG.createSession(message, client);
        return; 
      } 
    }
    
    // Non-command message in LFG channel - delete and warn
    try { 
      await message.delete(); 
      const w = await message.channel.send(`<@${message.author.id}> *spits* LFG commands only! Use \`?wagon\` to start a wagon run.`); 
      setTimeout(() => w.delete().catch(() => {}), 10000);
      
      // DM the user with instructions
      try {
        const botCommandsChannel = message.guild.channels.cache.find(c => c.name === 'bot-commands');
        await message.author.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🛒 Wagon LFG - Commands Only')
              .setDescription(
                `Hey partner! The **#wagon-lfg** channel is for LFG commands only, not chat.\n\n` +
                `**How to use:**\n` +
                `1. Type \`?wagon\` to create a wagon session\n` +
                `2. Select your delivery type (Local/Distant)\n` +
                `3. Choose wagon size & dupe settings\n` +
                `4. Click "Start Recruiting" when ready\n` +
                `5. Others can join by clicking the button\n\n` +
                `${botCommandsChannel ? `For all bot commands, check <#${botCommandsChannel.id}>` : 'Check #bot-commands for all available commands.'}`
              )
              .setColor(0x8B4513)
              .setFooter({ text: 'Cripps - Trader Coordinator' })
          ]
        });
      } catch (dmError) {
        // DMs might be disabled
      }
    } catch (e) {}
    return;
  }

  // Commands in other channels
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🤠 Cripps - Trader Coordinator')
        .setDescription("*adjusts suspenders* Let me tell you what I can do...")
        .addFields(
          { name: '🛒 Wagon LFG (Use in #wagon-lfg)', value: 
            '`?wagon` - Start a wagon delivery session\n' +
            '• Select delivery type (Local/Distant)\n' +
            '• Toggle dupe method on/off\n' +
            '• Auto voice channel creation\n' +
            '• Live earnings tracker' 
          },
          { name: '🎙️ Voice', value: '`?voice join` / `?voice leave`' },
          { name: '📊 Info', value: '`?ping` - Check if I\'m awake' }
        )
        .setColor(0x8B4513)
        .setFooter({ text: 'ULTIMATE Edition + Advanced LFG' });
      await message.reply({ embeds: [embed] });
      return;
    }
    
    if (cmd === 'ping') { 
      await message.reply(`*looks up from tanning leather* Yeah, I'm here. ${client.ws.ping}ms.`); 
      return; 
    }
    
    if (cmd === 'voice') {
      if (!voiceSystem) return message.reply("Voice ain't set up.");
      if (args[0] === 'join') { 
        const vc = message.member.voice.channel; 
        if (!vc) return message.reply("Get in a voice channel first."); 
        const ok = await voiceChatHandler?.joinAndGreet(vc); 
        message.reply(ok ? `🎙️ Joined ${vc.name}` : "Can't join."); 
      }
      else if (args[0] === 'leave') { 
        voiceSystem.leaveChannel(); 
        message.reply("*packs up and leaves*"); 
      }
      return;
    }
    
    // WAGON COMMAND IN WRONG CHANNEL - Redirect to #wagon-lfg
    if (cmd === 'wagon' || cmd === 'delivery' || cmd === 'trader') {
      const lfgChannel = message.guild.channels.cache.find(c => c.name === 'wagon-lfg');
      
      // Reply in channel
      await message.reply(`*points* Wrong place, partner! Head to ${lfgChannel ? `<#${lfgChannel.id}>` : '#wagon-lfg'} for wagon runs.`);
      
      // DM the user with instructions
      try {
        await message.author.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🛒 Wagon LFG - Wrong Channel!')
              .setDescription(
                `Hey partner! The \`?wagon\` command only works in the **#wagon-lfg** channel.\n\n` +
                `**How to use:**\n` +
                `1. Go to ${lfgChannel ? `<#${lfgChannel.id}>` : '#wagon-lfg'}\n` +
                `2. Type \`?wagon\` to create a session\n` +
                `3. Enter your PSN username\n` +
                `4. Select delivery type & wagon size\n` +
                `5. Click "Start Recruiting" when ready\n\n` +
                `Others can join by clicking the Join button!`
              )
              .setColor(0x8B4513)
              .setFooter({ text: 'Cripps - Trader Coordinator' })
          ]
        });
      } catch (dmError) {}
      return;
    }
  }

  if (await checkShouldRespond(message)) await generateResponse(message);
});

// Handle button/select interactions for Advanced LFG
client.on(Events.InteractionCreate, async (i) => { 
  // Legacy nexus buttons
  if (i.isButton() && i.customId.startsWith('lfg_') && nexusLFG) {
    await nexusLFG.handleButton(i); 
  }
  // Note: Advanced Wagon LFG handles its own interactions via the initialize() listener
});

client.on(Events.MessageReactionAdd, async (r, u) => { 
  if (u.bot) return; 
  if (r.partial) try { await r.fetch(); } catch (e) { return; } 
  if (nexusLFG) await nexusLFG.handleReaction(r, u); 
  if (intelligence && r.message.author?.id === client.user.id) await intelligence.handleReaction(r.message.id, r.emoji.name, u.id); 
});

client.on(Events.VoiceStateUpdate, (o, n) => { 
  if (intelligence?.contextAwareness && n.guild) intelligence.contextAwareness.updateVoiceState(n.guild.id, n); 
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
