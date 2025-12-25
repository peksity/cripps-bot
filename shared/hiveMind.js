/**
 * ██╗  ██╗██╗██╗   ██╗███████╗    ███╗   ███╗██╗███╗   ██╗██████╗ 
 * ██║  ██║██║██║   ██║██╔════╝    ████╗ ████║██║████╗  ██║██╔══██╗
 * ███████║██║██║   ██║█████╗      ██╔████╔██║██║██╔██╗ ██║██║  ██║
 * ██╔══██║██║╚██╗ ██╔╝██╔══╝      ██║╚██╔╝██║██║██║╚██╗██║██║  ██║
 * ██║  ██║██║ ╚████╔╝ ███████╗    ██║ ╚═╝ ██║██║██║ ╚████║██████╔╝
 * ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝    ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ 
 * 
 * THE HIVE MIND - Central Coordinator for All Bots
 * 
 * This is the BRAIN. One system that:
 * - Sees every message across all bots
 * - Decides which bot (if any) should respond
 * - Prevents multiple bots talking at once
 * - Coordinates natural conversation flow
 * - Manages bot-to-bot interactions
 */

const { Pool } = require('pg');

class HiveMind {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({ connectionString: process.env.DATABASE_URL });
    this.bots = new Map(); // botId -> { client, personality, lastSpoke, mood }
    this.recentMessages = []; // Last 50 messages for context
    this.lastBotResponse = 0; // Timestamp of last bot response
    this.conversationLock = null; // Which bot is currently "talking"
    this.channelActivity = new Map(); // channelId -> activity data
    
    // Timing controls - CRITICAL for natural feel
    this.config = {
      // Base chance any bot responds to a random message (very low)
      baseResponseChance: 0.08, // 8% 
      
      // Minimum time between ANY bot response (prevents spam)
      globalCooldown: 15000, // 15 seconds
      
      // Per-bot cooldown
      botCooldown: 60000, // 1 minute per bot
      
      // Chance to respond when directly mentioned
      mentionResponseChance: 0.95,
      
      // Chance to respond to keyword trigger
      keywordResponseChance: 0.40,
      
      // Chance second bot chimes in (very rare)
      secondBotChance: 0.05,
      
      // Proactive message interval range (ms)
      proactiveMinInterval: 20 * 60 * 1000, // 20 min
      proactiveMaxInterval: 45 * 60 * 1000, // 45 min
      
      // Max messages to keep in context
      contextWindow: 50
    };
    
    // Bot relevance keywords
    this.botKeywords = {
      lester: ['lester', 'heist', 'hack', 'mastermind', 'gta', 'online', 'money', 'glitch', 'setup', 'fingerprint', 'casino'],
      pavel: ['pavel', 'kapitan', 'captain', 'submarine', 'kosatka', 'cayo', 'perico', 'drainage', 'compound', 'el rubio', 'island'],
      cripps: ['cripps', 'wagon', 'trader', 'delivery', 'goods', 'camp', 'moonshine', 'hunting', 'pelts', 'materials', 'rdo', 'red dead'],
      chief: ['chief', 'sheriff', 'bounty', 'hunter', 'wanted', 'legendary', 'etta', 'outlaw', 'criminal', 'law', 'poster'],
      nazar: ['nazar', 'madam', 'fortune', 'collector', 'tarot', 'spirits', 'cards', 'mystical', 'prediction', 'fate', 'destiny', 'collectible']
    };
    
    // Bot relationship dynamics (affects interactions)
    this.relationships = {
      lester: { pavel: 0.7, cripps: -0.3, chief: -0.8, nazar: 0.2 },
      pavel: { lester: 0.7, cripps: 0.6, chief: 0.1, nazar: 0.5 },
      cripps: { lester: -0.2, pavel: 0.6, chief: -0.4, nazar: 0.8 },
      chief: { lester: -0.8, pavel: 0.0, cripps: -0.3, nazar: 0.1 },
      nazar: { lester: 0.3, pavel: 0.5, cripps: 0.7, chief: 0.2 }
    };
  }

  /**
   * Register a bot with the hive mind
   */
  registerBot(botId, client, personality) {
    this.bots.set(botId, {
      client,
      personality,
      lastSpoke: 0,
      mood: 0.5, // 0 = bad mood, 1 = good mood
      energy: 0.5, // 0 = tired/quiet, 1 = energetic
      recentTopics: [],
      isTyping: false
    });
    console.log(`[HIVEMIND] Registered bot: ${botId}`);
  }

  /**
   * MAIN ENTRY POINT - Called when ANY message is received by ANY bot
   * Returns: { shouldRespond: boolean, botId: string|null, style: object }
   */
  async processMessage(message, receivingBotId) {
    // Never respond to bots
    if (message.author.bot) {
      // But track bot messages for context
      this.addToContext(message, receivingBotId);
      return { shouldRespond: false };
    }

    // Add to context
    this.addToContext(message, null);

    // Check channel restrictions
    const channelName = message.channel.name || '';
    
    // Never respond in these
    if (channelName === 'counting' || channelName.includes('log') || channelName.includes('staff')) {
      return { shouldRespond: false };
    }

    // Handle talk-to channels (only specific bot responds)
    if (channelName.startsWith('talk-to-')) {
      const targetBot = this.getBotFromTalkChannel(channelName);
      if (targetBot && targetBot === receivingBotId) {
        return { 
          shouldRespond: true, 
          botId: targetBot,
          style: this.determineResponseStyle(message, targetBot, 'direct')
        };
      }
      return { shouldRespond: false };
    }

    // Check if this bot was specifically mentioned
    const bot = this.bots.get(receivingBotId);
    if (bot && message.mentions.has(bot.client.user)) {
      if (Math.random() < this.config.mentionResponseChance) {
        return {
          shouldRespond: true,
          botId: receivingBotId,
          style: this.determineResponseStyle(message, receivingBotId, 'mention')
        };
      }
    }

    // Only let ONE bot process general messages (first one to check wins)
    // This prevents all 5 bots from responding
    if (receivingBotId !== 'lester') {
      // Let lester be the "coordinator" - other bots defer
      return { shouldRespond: false };
    }

    // From here, only lester's instance makes decisions for everyone
    return this.decideWhoResponds(message);
  }

  /**
   * Central decision: Should anyone respond? Who?
   */
  async decideWhoResponds(message) {
    const now = Date.now();
    const content = message.content.toLowerCase();
    
    // Global cooldown check
    if (now - this.lastBotResponse < this.config.globalCooldown) {
      return { shouldRespond: false };
    }

    // Analyze message for bot relevance
    const relevanceScores = this.calculateRelevance(content);
    const mostRelevantBot = this.getMostRelevantBot(relevanceScores);
    
    // Determine base chance
    let responseChance = this.config.baseResponseChance;
    
    // Boost if keywords match
    if (mostRelevantBot && relevanceScores[mostRelevantBot] > 0) {
      responseChance = this.config.keywordResponseChance;
    }
    
    // Boost for questions
    if (content.includes('?')) {
      responseChance *= 1.5;
    }
    
    // Boost for longer messages (someone put effort in)
    if (content.length > 100) {
      responseChance *= 1.3;
    }
    
    // Reduce if lots of recent bot activity
    const recentBotMessages = this.recentMessages.filter(m => m.isBot && now - m.timestamp < 120000).length;
    if (recentBotMessages > 3) {
      responseChance *= 0.3;
    }

    // ROLL THE DICE
    if (Math.random() > responseChance) {
      return { shouldRespond: false };
    }

    // Pick the bot
    let chosenBot = mostRelevantBot;
    if (!chosenBot) {
      // Random selection weighted by energy levels
      chosenBot = this.pickRandomBot();
    }

    // Check bot's personal cooldown
    const botData = this.bots.get(chosenBot);
    if (botData && now - botData.lastSpoke < this.config.botCooldown) {
      // This bot spoke too recently, try another
      chosenBot = this.pickRandomBot([chosenBot]);
      if (!chosenBot) {
        return { shouldRespond: false };
      }
    }

    // WE HAVE A WINNER
    this.lastBotResponse = now;
    if (this.bots.has(chosenBot)) {
      this.bots.get(chosenBot).lastSpoke = now;
    }

    return {
      shouldRespond: true,
      botId: chosenBot,
      style: this.determineResponseStyle(message, chosenBot, 'organic')
    };
  }

  /**
   * Calculate how relevant each bot is to the message
   */
  calculateRelevance(content) {
    const scores = {};
    
    for (const [botId, keywords] of Object.entries(this.botKeywords)) {
      scores[botId] = 0;
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          scores[botId] += keyword.length > 4 ? 2 : 1; // Longer keywords = more specific
        }
      }
    }
    
    return scores;
  }

  /**
   * Get the most relevant bot (if any clear winner)
   */
  getMostRelevantBot(scores) {
    let maxScore = 0;
    let winner = null;
    
    for (const [botId, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        winner = botId;
      }
    }
    
    // Only return if there's a clear relevance
    return maxScore >= 2 ? winner : null;
  }

  /**
   * Pick a random bot (with optional exclusions)
   */
  pickRandomBot(exclude = []) {
    const available = Array.from(this.bots.keys()).filter(id => !exclude.includes(id));
    if (available.length === 0) return null;
    
    // Weight by energy levels
    const weights = available.map(id => {
      const bot = this.bots.get(id);
      return bot ? bot.energy : 0.5;
    });
    
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < available.length; i++) {
      random -= weights[i];
      if (random <= 0) return available[i];
    }
    
    return available[0];
  }

  /**
   * Determine HOW the bot should respond (length, tone, style)
   */
  determineResponseStyle(message, botId, context) {
    const content = message.content.toLowerCase();
    const bot = this.bots.get(botId);
    const mood = bot?.mood || 0.5;
    
    // Response length distribution
    // This is CRITICAL for natural feel
    const roll = Math.random();
    let lengthType;
    
    if (context === 'direct' || content.includes('?')) {
      // Direct conversations get more substance
      if (roll < 0.20) lengthType = 'micro';      // "yeah", "nah", "lol"
      else if (roll < 0.50) lengthType = 'short'; // One sentence
      else if (roll < 0.85) lengthType = 'medium'; // 2-3 sentences
      else lengthType = 'full';                    // Actual paragraph
    } else {
      // Organic responses are usually short
      if (roll < 0.40) lengthType = 'micro';
      else if (roll < 0.75) lengthType = 'short';
      else if (roll < 0.95) lengthType = 'medium';
      else lengthType = 'full';
    }
    
    // Max tokens based on length type
    const maxTokens = {
      micro: 15,
      short: 40,
      medium: 100,
      full: 200
    };
    
    // Determine tone based on mood
    let tone = 'neutral';
    if (mood < 0.3) tone = 'irritated';
    else if (mood > 0.7) tone = 'friendly';
    
    // Action probability (like *sighs*, *looks up*)
    const actionChance = lengthType === 'micro' ? 0.1 : lengthType === 'short' ? 0.3 : 0.5;
    const includeAction = Math.random() < actionChance;
    
    return {
      lengthType,
      maxTokens: maxTokens[lengthType],
      tone,
      includeAction,
      context, // 'direct', 'mention', 'organic'
      mood
    };
  }

  /**
   * Get bot from talk-to channel name
   */
  getBotFromTalkChannel(channelName) {
    if (channelName.includes('lester')) return 'lester';
    if (channelName.includes('pavel')) return 'pavel';
    if (channelName.includes('cripps')) return 'cripps';
    if (channelName.includes('chief') || channelName.includes('police')) return 'chief';
    if (channelName.includes('nazar') || channelName.includes('madam')) return 'nazar';
    return null;
  }

  /**
   * Add message to context window
   */
  addToContext(message, botId) {
    this.recentMessages.push({
      content: message.content,
      authorId: message.author.id,
      authorName: message.author.username,
      channelId: message.channel.id,
      channelName: message.channel.name,
      timestamp: Date.now(),
      isBot: message.author.bot,
      botId: botId
    });
    
    // Trim to context window
    while (this.recentMessages.length > this.config.contextWindow) {
      this.recentMessages.shift();
    }
  }

  /**
   * Record that a bot spoke (for cooldown tracking)
   */
  recordBotResponse(botId) {
    const now = Date.now();
    this.lastBotResponse = now;
    
    const bot = this.bots.get(botId);
    if (bot) {
      bot.lastSpoke = now;
    }
  }

  /**
   * Get conversation context for AI prompt
   */
  getContextForPrompt(limit = 10) {
    const recent = this.recentMessages.slice(-limit);
    return recent.map(m => `${m.authorName}: ${m.content}`).join('\n');
  }

  /**
   * Adjust bot mood based on interactions
   */
  adjustMood(botId, delta) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.mood = Math.max(0, Math.min(1, bot.mood + delta));
    }
  }

  /**
   * Adjust bot energy based on activity
   */
  adjustEnergy(botId, delta) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.energy = Math.max(0.1, Math.min(1, bot.energy + delta));
    }
  }

  /**
   * Check if bot-to-bot interaction should happen
   */
  shouldBotsInteract() {
    const now = Date.now();
    
    // Need at least 2 bots
    if (this.bots.size < 2) return null;
    
    // Check if enough time has passed
    if (now - this.lastBotResponse < this.config.proactiveMinInterval) {
      return null;
    }
    
    // Random chance
    if (Math.random() > 0.15) return null;
    
    // Pick two bots with positive relationship
    const botIds = Array.from(this.bots.keys());
    const bot1 = botIds[Math.floor(Math.random() * botIds.length)];
    const remainingBots = botIds.filter(id => id !== bot1);
    
    // Weight by relationship
    const relationships = this.relationships[bot1] || {};
    let bot2 = null;
    let bestScore = -999;
    
    for (const id of remainingBots) {
      const score = (relationships[id] || 0) + Math.random() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bot2 = id;
      }
    }
    
    if (!bot2) return null;
    
    return { initiator: bot1, target: bot2, relationship: relationships[bot2] || 0 };
  }

  /**
   * Get time-based mood modifier
   */
  getTimeMoodModifier() {
    const hour = new Date().getHours();
    
    // Late night (12am - 5am): lower energy, moodier
    if (hour >= 0 && hour < 5) return { energy: -0.2, mood: -0.1 };
    
    // Early morning (5am - 9am): waking up
    if (hour >= 5 && hour < 9) return { energy: -0.1, mood: 0 };
    
    // Peak hours (9am - 11pm): normal
    if (hour >= 9 && hour < 23) return { energy: 0, mood: 0 };
    
    // Late night (11pm - 12am): winding down
    return { energy: -0.1, mood: 0 };
  }

  /**
   * Initialize database tables for persistent memory
   */
  async initDatabase() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS hivemind_state (
          bot_id VARCHAR(50) PRIMARY KEY,
          mood REAL DEFAULT 0.5,
          energy REAL DEFAULT 0.5,
          last_spoke BIGINT DEFAULT 0,
          recent_topics TEXT DEFAULT '[]',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bot_conversations (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          channel_id VARCHAR(50),
          message TEXT,
          response TEXT,
          response_style VARCHAR(20),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('[HIVEMIND] Database tables ready');
    } catch (e) {
      console.error('[HIVEMIND] Database init error:', e.message);
    }
  }

  /**
   * Save bot state to database
   */
  async saveState(botId) {
    const bot = this.bots.get(botId);
    if (!bot) return;
    
    try {
      await this.pool.query(`
        INSERT INTO hivemind_state (bot_id, mood, energy, last_spoke, recent_topics)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (bot_id) DO UPDATE SET
          mood = $2, energy = $3, last_spoke = $4, recent_topics = $5, updated_at = CURRENT_TIMESTAMP
      `, [botId, bot.mood, bot.energy, bot.lastSpoke, JSON.stringify(bot.recentTopics)]);
    } catch (e) {
      console.error('[HIVEMIND] Save state error:', e.message);
    }
  }

  /**
   * Load bot state from database
   */
  async loadState(botId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM hivemind_state WHERE bot_id = $1',
        [botId]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const bot = this.bots.get(botId);
        if (bot) {
          bot.mood = row.mood;
          bot.energy = row.energy;
          bot.lastSpoke = parseInt(row.last_spoke) || 0;
          bot.recentTopics = JSON.parse(row.recent_topics || '[]');
        }
      }
    } catch (e) {
      console.error('[HIVEMIND] Load state error:', e.message);
    }
  }
}

// Singleton instance
let instance = null;

function getHiveMind(config) {
  if (!instance) {
    instance = new HiveMind(config);
  }
  return instance;
}

module.exports = { HiveMind, getHiveMind };
