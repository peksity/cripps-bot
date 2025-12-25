/**
 * CRIPPS - THE TRADER | Hive Mind Connected
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const { getHiveMind } = require('./shared/hivemind/hiveMind');
const { getMemoryCore } = require('./shared/hivemind/memoryCore');
const { NaturalResponse } = require('./shared/hivemind/naturalResponse');
const { MoodEngine } = require('./shared/hivemind/moodEngine');
const { ServerAwareness } = require('./shared/hivemind/serverAwareness');
const { GrudgeSystem } = require('./shared/hivemind/grudgeSystem');
const advancedWagonLFG = require('./shared/advancedWagonLFG');

const BOT_ID = 'cripps';

const CRIPPS_PERSONALITY = `You are Cripps from Red Dead Online. Grizzled old trader.

PERSONALITY: Grumpy, mysterious past, starts stories but never finishes them, complains but helps.

VOICE: Old West but readable. "reckon", "ain't", "partner". Trails off "..."

RULES:
- SHORT responses
- Don't tell full stories
- Gruff but helpful
- *grunts* occasionally

EXAMPLES:
- "*grunts* what"
- "did i ever tell you about... never mind"
- "that damn dog"
- "wagon's ready"
- "reminds me of tennessee. don't ask."`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Message, Partials.Channel]
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let hiveMind, memoryCore, naturalResponse, moodEngine, serverAwareness, grudgeSystem;

client.once(Events.ClientReady, async () => {
  console.log(`[CRIPPS] ✅ Online`);
  
  hiveMind = getHiveMind({ pool });
  memoryCore = getMemoryCore(pool);
  naturalResponse = new NaturalResponse(anthropic);
  moodEngine = new MoodEngine(pool, BOT_ID);
  serverAwareness = new ServerAwareness(client);
  grudgeSystem = new GrudgeSystem(pool);
  
  await memoryCore.initialize();
  await moodEngine.initialize();
  await grudgeSystem.initialize();
  
  hiveMind.registerBot(BOT_ID, client, CRIPPS_PERSONALITY);
  await moodEngine.loadMood();
  
  advancedWagonLFG.initialize(client);
  client.user.setPresence({ activities: [{ name: 'Running the camp', type: 3 }], status: 'online' });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.id === client.user.id) return;
  if (!message.author.bot) await serverAwareness.recordMessage(message);
  
  if (message.content.startsWith('?')) {
    const cmd = message.content.slice(1).split(' ')[0].toLowerCase();
    if (['wagon', 'delivery', 'trader'].includes(cmd)) {
      if (!message.channel.name.includes('wagon') && !message.channel.name.includes('lfg')) {
        await message.delete().catch(() => {});
        await message.author.send({ embeds: [{ title: '🛒 Wrong Channel', description: 'Use #wagon-lfg', color: 0x8B4513 }] }).catch(() => {});
        return;
      }
      await advancedWagonLFG.createSession(message, client);
      return;
    }
  }
  
  const decision = await hiveMind.processMessage(message, BOT_ID);
  if (!decision.shouldRespond) return;
  
  await message.channel.sendTyping();
  const context = await memoryCore.buildMemoryContext(BOT_ID, message.author.id);
  const response = await naturalResponse.generateResponse(BOT_ID, CRIPPS_PERSONALITY, message, decision.style, context);
  await new Promise(r => setTimeout(r, response.length * 25));
  await message.reply(response);
  await memoryCore.storeConversation(BOT_ID, message.author.id, message.channel.id, message.channel.name, message.content, response);
  hiveMind.recordBotResponse(BOT_ID);
});

client.login(process.env.DISCORD_TOKEN);
