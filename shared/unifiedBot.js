/**
 * ██╗   ██╗███╗   ██╗██╗███████╗██╗███████╗██████╗     ██████╗  ██████╗ ████████╗
 * ██║   ██║████╗  ██║██║██╔════╝██║██╔════╝██╔══██╗    ██╔══██╗██╔═══██╗╚══██╔══╝
 * ██║   ██║██╔██╗ ██║██║█████╗  ██║█████╗  ██║  ██║    ██████╔╝██║   ██║   ██║   
 * ██║   ██║██║╚██╗██║██║██╔══╝  ██║██╔══╝  ██║  ██║    ██╔══██╗██║   ██║   ██║   
 * ╚██████╔╝██║ ╚████║██║██║     ██║███████╗██████╔╝    ██████╔╝╚██████╔╝   ██║   
 *  ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚══════╝╚═════╝     ╚═════╝  ╚═════╝    ╚═╝   
 * 
 * UNIFIED BOT CORE
 * 
 * Every bot uses this. Connects to the Hive Mind.
 * The bot itself becomes thin - just personality + connection to shared brain.
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

// Hive Mind Systems
const { getHiveMind } = require('./hivemind/hiveMind');
const { getMemoryCore } = require('./hivemind/memoryCore');
const { NaturalResponse } = require('./hivemind/naturalResponse');
const { ProactiveSystem } = require('./hivemind/proactiveSystem');

class UnifiedBot {
  constructor(config) {
    this.botId = config.botId;
    this.botName = config.botName;
    this.personality = config.personality;
    this.keywords = config.keywords || [];
    
    // Discord client
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });
    
    // APIs
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Shared systems
    this.hiveMind = getHiveMind({ pool: this.pool });
    this.memoryCore = getMemoryCore(this.pool);
    this.naturalResponse = new NaturalResponse(this.anthropic);
    
    // Custom handlers (LFG, etc)
    this.customHandlers = config.customHandlers || {};
  }

  /**
   * Start the bot
   */
  async start() {
    // Initialize database
    await this.memoryCore.initialize();
    await this.hiveMind.initDatabase();
    
    // Register with hive mind
    this.hiveMind.registerBot(this.botId, this.client, this.personality);
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Login
    await this.client.login(process.env.DISCORD_TOKEN);
    
    console.log(`[${this.botName.toUpperCase()}] Starting...`);
  }

  /**
   * Setup Discord event handlers
   */
  setupEventHandlers() {
    // Ready
    this.client.once(Events.ClientReady, async () => {
      console.log(`[${this.botName}] ✅ Online as ${this.client.user.tag}`);
      
      // Load saved state
      await this.hiveMind.loadState(this.botId);
      
      // Set status
      this.client.user.setPresence({
        activities: [{ name: this.getStatusMessage(), type: 3 }],
        status: 'online'
      });
    });

    // Message handler
    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });

    // Reaction handler (for bot reactions)
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      // Could track reactions for memory
    });

    // Interaction handler (buttons, modals, etc)
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await this.handleInteraction(interaction);
    });
  }

  /**
   * Main message handler
   */
  async handleMessage(message) {
    // Ignore own messages
    if (message.author.id === this.client.user.id) return;
    
    // Record user activity in memory
    if (!message.author.bot) {
      await this.memoryCore.recordActivity(
        message.author.id,
        message.author.username,
        message
      );
    }

    // Check for custom command handlers first
    if (message.content.startsWith('?')) {
      const handled = await this.handleCommand(message);
      if (handled) return;
    }

    // Ask the Hive Mind if we should respond
    const decision = await this.hiveMind.processMessage(message, this.botId);
    
    if (!decision.shouldRespond) {
      // Maybe just react with emoji?
      if (!message.author.bot && Math.random() < 0.02) {
        const emoji = this.naturalResponse.getReactionEmoji(message.content);
        try {
          await message.react(emoji);
        } catch (e) {}
      }
      return;
    }

    // We're responding!
    await this.respond(message, decision);
  }

  /**
   * Generate and send response
   */
  async respond(message, decision) {
    // Show typing
    await message.channel.sendTyping();
    
    // Get memory context
    const memoryContext = await this.memoryCore.buildMemoryContext(
      this.botId,
      message.author.id
    );
    
    // Generate response
    const response = await this.naturalResponse.generateResponse(
      this.botId,
      this.personality,
      message,
      decision.style,
      memoryContext
    );
    
    // Typing delay based on response length
    const typingDelay = Math.min(response.length * 30, 3000);
    await new Promise(r => setTimeout(r, typingDelay));
    
    // Send
    try {
      await message.reply(response);
      
      // Record in memory
      await this.memoryCore.storeConversation(
        this.botId,
        message.author.id,
        message.channel.id,
        message.channel.name,
        message.content,
        response
      );
      
      // Update bot opinion based on interaction
      const sentiment = this.naturalResponse.detectSentiment(message.content);
      if (sentiment === 'positive') {
        await this.memoryCore.updateBotOpinion(this.botId, message.author.id, 'fondness', 1);
      } else if (sentiment === 'negative') {
        await this.memoryCore.updateBotOpinion(this.botId, message.author.id, 'annoyance', 1);
      }
      
      // Record that we spoke
      this.hiveMind.recordBotResponse(this.botId);
      
    } catch (e) {
      console.error(`[${this.botName}] Send error:`, e.message);
    }
  }

  /**
   * Handle custom commands
   */
  async handleCommand(message) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Check custom handlers
    if (this.customHandlers[command]) {
      await this.customHandlers[command](message, args, this);
      return true;
    }
    
    // Common commands
    if (command === 'ping') {
      await message.reply(`${this.client.ws.ping}ms`);
      return true;
    }
    
    if (command === 'help') {
      await message.reply(this.getHelpMessage());
      return true;
    }
    
    return false;
  }

  /**
   * Handle interactions (buttons, modals, selects)
   */
  async handleInteraction(interaction) {
    // Pass to custom handlers
    for (const handler of Object.values(this.customHandlers)) {
      if (handler.handleInteraction) {
        const handled = await handler.handleInteraction(interaction, this);
        if (handled) return;
      }
    }
  }

  /**
   * Get status message
   */
  getStatusMessage() {
    const statuses = {
      lester: 'Monitoring everything',
      pavel: 'Preparing the Kosatka',
      cripps: 'Running the camp',
      chief: 'Keeping the peace',
      nazar: 'Reading the cards'
    };
    return statuses[this.botId] || 'Online';
  }

  /**
   * Get help message
   */
  getHelpMessage() {
    return `I'm ${this.botName}. Just talk to me naturally.`;
  }
}

module.exports = { UnifiedBot };
