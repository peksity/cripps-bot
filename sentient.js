/**
 * ████████╗██╗  ██╗███████╗    ██████╗ ██████╗  █████╗ ██╗███╗   ██╗
 * ╚══██╔══╝██║  ██║██╔════╝    ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║
 *    ██║   ███████║█████╗      ██████╔╝██████╔╝███████║██║██╔██╗ ██║
 *    ██║   ██╔══██║██╔══╝      ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║
 *    ██║   ██║  ██║███████╗    ██████╔╝██║  ██║██║  ██║██║██║ ╚████║
 *    ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
 * 
 * SENTIENT-LEVEL CONVERSATION ENGINE
 * Beyond human-like AI interaction
 * 
 * Features:
 * - Persistent memory across restarts (PostgreSQL)
 * - Deep relationship tracking with emotional arcs
 * - Real-time mood system that evolves
 * - Context awareness spanning entire conversations
 * - Natural imperfections (typos, corrections, mood swings)
 * - Cross-conversation memory
 * - Behavioral pattern recognition
 * - Emotional contagion from channel mood
 */

const { EmbedBuilder } = require('discord.js');

// ============================================
// THE BRAIN - CORE STATE MANAGEMENT
// ============================================
class TheBrain {
  constructor(botName, db) {
    this.botName = botName;
    this.db = db;
    
    // Volatile memory (resets on restart, fast access)
    this.volatileMemory = {
      channelStates: new Map(),      // Current state of each channel
      activeConversations: new Map(), // Who we're currently talking to
      recentEmotions: [],            // Last 20 emotional states
      currentMood: this.generateMood(),
      lastInteraction: Date.now(),
      todayInteractions: 0,
      sessionStart: Date.now()
    };
    
    // Personality core (changes slowly over time)
    this.personality = {
      basePatience: 50,
      baseSarcasm: 70,
      baseWarmth: 40,
      baseEnergy: 60,
      trustDefault: 20,
      grudgeDecay: 0.95,  // How fast grudges fade (0.95 = 5% per day)
      favoriteBoost: 1.3  // How much more we engage with favorites
    };
  }

  generateMood() {
    return {
      energy: 50 + Math.floor(Math.random() * 30),
      patience: 40 + Math.floor(Math.random() * 30),
      irritability: 10 + Math.floor(Math.random() * 20),
      openness: 40 + Math.floor(Math.random() * 30),
      playfulness: 30 + Math.floor(Math.random() * 40),
      lastUpdate: Date.now()
    };
  }

  // Initialize database tables
  async initDatabase() {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS bot_relationships (
          id SERIAL PRIMARY KEY,
          bot_name VARCHAR(32),
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          username VARCHAR(64),
          trust_level INT DEFAULT 0,
          respect_level INT DEFAULT 0,
          familiarity INT DEFAULT 0,
          interaction_count INT DEFAULT 0,
          insult_count INT DEFAULT 0,
          thanks_count INT DEFAULT 0,
          help_count INT DEFAULT 0,
          last_interaction TIMESTAMP DEFAULT NOW(),
          first_interaction TIMESTAMP DEFAULT NOW(),
          remembered_facts JSONB DEFAULT '[]',
          flags JSONB DEFAULT '{}',
          emotional_history JSONB DEFAULT '[]',
          UNIQUE(bot_name, user_id, guild_id)
        );

        CREATE TABLE IF NOT EXISTS bot_memories (
          id SERIAL PRIMARY KEY,
          bot_name VARCHAR(32),
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          memory_type VARCHAR(32),
          content TEXT,
          importance INT DEFAULT 5,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS channel_context (
          id SERIAL PRIMARY KEY,
          channel_id VARCHAR(32),
          guild_id VARCHAR(32),
          recent_mood VARCHAR(32),
          active_topics JSONB DEFAULT '[]',
          participant_count INT DEFAULT 0,
          last_activity TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log(`🧠 ${this.botName} brain initialized`);
    } catch (error) {
      console.error('Brain init error:', error);
    }
  }

  // Get or create relationship with user
  async getRelationship(userId, guildId, username) {
    try {
      // Try to get existing
      let result = await this.db.query(
        `SELECT * FROM bot_relationships WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3`,
        [this.botName, userId, guildId]
      );

      if (result.rows.length === 0) {
        // Create new relationship
        result = await this.db.query(
          `INSERT INTO bot_relationships (bot_name, user_id, guild_id, username)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [this.botName, userId, guildId, username]
        );
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        username: row.username,
        trust: row.trust_level,
        respect: row.respect_level,
        familiarity: row.familiarity,
        interactions: row.interaction_count,
        insults: row.insult_count,
        thanks: row.thanks_count,
        helps: row.help_count,
        lastInteraction: row.last_interaction,
        firstInteraction: row.first_interaction,
        rememberedFacts: row.remembered_facts || [],
        flags: row.flags || {},
        emotionalHistory: row.emotional_history || []
      };
    } catch (error) {
      console.error('Get relationship error:', error);
      // Return default if DB fails
      return {
        userId: userId,
        username,
        trust: 0, respect: 0, familiarity: 0,
        interactions: 0, insults: 0, thanks: 0, helps: 0,
        flags: {}, rememberedFacts: [], emotionalHistory: []
      };
    }
  }

  // Update relationship in database
  async updateRelationship(userId, guildId, updates) {
    try {
      const setClause = [];
      const values = [this.botName, userId, guildId];
      let paramIndex = 4;

      for (const [key, value] of Object.entries(updates)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        setClause.push(`${dbKey} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }

      if (setClause.length > 0) {
        await this.db.query(
          `UPDATE bot_relationships SET ${setClause.join(', ')}, last_interaction = NOW()
           WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3`,
          values
        );
      }
    } catch (error) {
      console.error('Update relationship error:', error);
    }
  }

  // Store a memory
  async storeMemory(userId, guildId, type, content, importance = 5, expiresIn = null) {
    try {
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn) : null;
      await this.db.query(
        `INSERT INTO bot_memories (bot_name, user_id, guild_id, memory_type, content, importance, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [this.botName, userId, guildId, type, content, importance, expiresAt]
      );
    } catch (error) {
      console.error('Store memory error:', error);
    }
  }

  // Get memories about a user
  async getMemories(userId, guildId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT * FROM bot_memories 
         WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY importance DESC, created_at DESC
         LIMIT $4`,
        [this.botName, userId, guildId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Get memories error:', error);
      return [];
    }
  }

  // Update mood based on various factors
  updateMood(factors = {}) {
    const mood = this.volatileMemory.currentMood;
    const timeSinceLast = (Date.now() - mood.lastUpdate) / 3600000; // hours

    // Natural mood drift over time
    mood.energy = Math.min(80, mood.energy + timeSinceLast * 3);
    mood.patience = Math.min(70, mood.patience + timeSinceLast * 5);
    mood.irritability = Math.max(10, mood.irritability - timeSinceLast * 4);

    // Apply factors
    if (factors.wasInsulted) {
      mood.irritability = Math.min(90, mood.irritability + 25);
      mood.patience = Math.max(10, mood.patience - 20);
      mood.openness = Math.max(20, mood.openness - 15);
    }
    if (factors.wasThanked) {
      mood.irritability = Math.max(5, mood.irritability - 10);
      mood.openness = Math.min(80, mood.openness + 5);
    }
    if (factors.hadGoodConversation) {
      mood.energy = Math.min(90, mood.energy + 5);
      mood.playfulness = Math.min(80, mood.playfulness + 10);
    }
    if (factors.wasIgnored) {
      mood.energy = Math.max(20, mood.energy - 5);
    }
    if (factors.highActivity) {
      mood.energy = Math.max(30, mood.energy - 3); // Draining
    }

    // Random fluctuations (human-like)
    if (Math.random() < 0.1) {
      mood.energy += (Math.random() - 0.5) * 15;
      mood.playfulness += (Math.random() - 0.5) * 20;
    }

    // Clamp all values
    for (const key of Object.keys(mood)) {
      if (typeof mood[key] === 'number' && key !== 'lastUpdate') {
        mood[key] = Math.max(0, Math.min(100, mood[key]));
      }
    }

    mood.lastUpdate = Date.now();
    return mood;
  }
}

// ============================================
// MESSAGE ANALYZER - DEEP UNDERSTANDING
// ============================================
class MessageAnalyzer {
  analyze(content, relationship, channelContext) {
    const lower = content.toLowerCase();
    const words = content.split(/\s+/);
    
    const analysis = {
      // Basic classification
      sentiment: this.detectSentiment(lower),
      intent: this.detectIntent(lower),
      emotion: this.detectEmotion(lower),
      
      // Message characteristics
      length: content.length,
      wordCount: words.length,
      isQuestion: /\?/.test(content),
      isExclamation: /!/.test(content),
      isAllCaps: content === content.toUpperCase() && content.length > 3,
      hasEmoji: /[\u{1F300}-\u{1F9FF}]/u.test(content),
      
      // Specific detections
      isGreeting: /^(hey|hi|hello|yo|sup|what'?s? up|howdy|greetings)/i.test(lower),
      isFarewell: /^(bye|goodbye|later|cya|see ya|gotta go|gtg)/i.test(lower),
      isInsult: this.detectInsult(lower),
      isThanks: /\b(thank|thanks|thx|ty|appreciate|grateful)\b/i.test(lower),
      isApology: /\b(sorry|apologize|my bad|forgive|didn'?t mean)\b/i.test(lower),
      isAgreement: /^(yes|yeah|yep|yup|sure|ok|okay|true|right|exactly|agreed)/i.test(lower),
      isDisagreement: /^(no|nah|nope|wrong|false|disagree)/i.test(lower),
      
      // Slang detection
      slangUsed: this.detectSlang(lower),
      
      // Topic detection
      topics: this.detectTopics(lower),
      
      // Relationship context
      mentionsBot: false, // Set by handler
      isDirectAddress: false, // Set by handler
      
      // Conversational markers
      isFollowUp: /^(and|but|also|what about|how about|speaking of)/i.test(lower),
      needsClarification: content.length < 5 && !analysis?.isGreeting,
      
      // Energy level
      energy: this.detectEnergy(content),
      
      // Response expectations
      expectsResponse: true,
      expectedResponseLength: this.estimateResponseLength(content, relationship)
    };

    return analysis;
  }

  detectSentiment(text) {
    const positive = (text.match(/\b(love|great|awesome|amazing|good|nice|cool|thanks|happy|excited|perfect|best)\b/gi) || []).length;
    const negative = (text.match(/\b(hate|bad|terrible|awful|worst|angry|annoyed|frustrated|stupid|dumb|sucks)\b/gi) || []).length;
    
    if (positive > negative + 1) return 'positive';
    if (negative > positive + 1) return 'negative';
    return 'neutral';
  }

  detectIntent(text) {
    if (/\b(help|how (do|to|can)|what (is|are)|explain|tell me)\b/i.test(text)) return 'seeking_help';
    if (/\b(thanks|thank you|appreciate)\b/i.test(text)) return 'gratitude';
    if (/^(hey|hi|hello|yo|sup)/i.test(text)) return 'greeting';
    if (/\?$/.test(text)) return 'question';
    if (/\b(fuck|shit|damn|hate)\b/i.test(text)) return 'venting';
    if (/\b(lol|lmao|haha|😂|🤣)\b/i.test(text)) return 'humor';
    return 'conversation';
  }

  detectEmotion(text) {
    if (/\b(😂|🤣|lmao|lol|haha|rofl)\b/i.test(text)) return 'amused';
    if (/\b(😢|😭|sad|depressed|crying)\b/i.test(text)) return 'sad';
    if (/\b(😠|😤|angry|pissed|furious|mad)\b/i.test(text)) return 'angry';
    if (/\b(😊|😄|happy|excited|great)\b/i.test(text)) return 'happy';
    if (/\b(😰|worried|anxious|nervous|scared)\b/i.test(text)) return 'anxious';
    if (/\b(🤔|confused|don'?t understand|what)\b/i.test(text)) return 'confused';
    return 'neutral';
  }

  detectInsult(text) {
    const insultPatterns = [
      /fuck (you|off|this)/i,
      /\b(stfu|shut up|idiot|stupid|dumb|moron|retard)\b/i,
      /\b(trash|garbage|useless|worthless|pathetic)\b/i,
      /\b(hate you|worst|terrible|awful)\b/i,
      /\b(bitch|asshole|dick|cunt)\b/i,
      /go away|leave me alone|nobody asked/i
    ];
    return insultPatterns.some(p => p.test(text));
  }

  detectSlang(text) {
    const slangList = ['lol', 'lmao', 'rofl', 'bruh', 'ngl', 'fr', 'frfr', 'wtf', 'wth', 'idk', 'idc', 'rn', 'gg', 'goat', 'mid', 'sus', 'lowkey', 'highkey', 'bet', 'no cap', 'deadass', 'bussin', 'based', 'cringe', 'slay', 'vibe', 'mood', 'periodt', 'ong', 'istg', 'smh', 'tbh', 'imo', 'afk', 'brb'];
    return slangList.filter(s => text.includes(s));
  }

  detectTopics(text) {
    const topicPatterns = {
      'money': /\b(money|cash|mil|million|grind|rich|broke|pay|cost|price)\b/i,
      'heist': /\b(heist|score|job|setup|finale|cut)\b/i,
      'cayo': /\b(cayo|perico|rubio|kosatka|submarine|island)\b/i,
      'vehicle': /\b(car|bike|plane|heli|chopper|jet|boat|truck|van)\b/i,
      'weapon': /\b(gun|weapon|shoot|ammo|pistol|rifle|sniper|shotgun)\b/i,
      'business': /\b(business|nightclub|bunker|warehouse|mc|ceo|agency)\b/i,
      'pvp': /\b(pvp|kill|fight|grief|tryhard|kd|battle)\b/i,
      'help': /\b(help|how|what|why|when|where|explain)\b/i,
      'personal': /\b(i am|i'm|my|me|i feel|i think|i want|i need)\b/i
    };

    const topics = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(text)) topics.push(topic);
    }
    return topics;
  }

  detectEnergy(text) {
    let energy = 50;
    
    if (text === text.toUpperCase() && text.length > 5) energy += 30;
    if (/!{2,}/.test(text)) energy += 20;
    if (/\?{2,}/.test(text)) energy += 15;
    if (text.length > 200) energy += 10;
    if (text.length < 10) energy -= 10;
    if (/\.{3,}/.test(text)) energy -= 15;
    if (/^(k|ok|sure|whatever|fine)$/i.test(text)) energy -= 25;
    
    return Math.max(10, Math.min(100, energy));
  }

  estimateResponseLength(content, relationship) {
    let length = 'medium';
    
    if (content.length < 10) length = 'short';
    if (content.length > 150) length = 'long';
    if (/^(k|ok|yes|no|yeah|nah|sure)$/i.test(content)) length = 'minimal';
    if (relationship?.flags?.isAnnoying) length = 'minimal';
    if (relationship?.trust > 40) length = 'medium';
    
    return length;
  }
}

// ============================================
// CONTEXT BUILDER - MEGA AWARENESS
// ============================================
class ContextBuilder {
  constructor(brain) {
    this.brain = brain;
  }

  async build(message, relationship, analysis, memories) {
    const channelContext = await this.getChannelContext(message);
    const mood = this.brain.volatileMemory.currentMood;
    
    let context = '\n\n';
    context += '╔══════════════════════════════════════════════════════════════╗\n';
    context += '║                    YOUR CURRENT STATE                        ║\n';
    context += '╚══════════════════════════════════════════════════════════════╝\n';
    
    // Mood state
    context += `Energy: ${this.describeMoodLevel(mood.energy, ['Exhausted', 'Tired', 'Normal', 'Alert', 'Energetic'])}\n`;
    context += `Patience: ${this.describeMoodLevel(mood.patience, ['None left', 'Thin', 'Normal', 'Patient', 'Very patient'])}\n`;
    context += `Irritability: ${this.describeMoodLevel(mood.irritability, ['Calm', 'Slight edge', 'Annoyed', 'Irritated', 'Pissed off'])}\n`;
    context += `Openness: ${this.describeMoodLevel(mood.openness, ['Closed off', 'Guarded', 'Normal', 'Open', 'Very open'])}\n`;
    context += `Playfulness: ${this.describeMoodLevel(mood.playfulness, ['Serious', 'Neutral', 'Light', 'Playful', 'Very playful'])}\n`;
    
    // Session stats
    const sessionHours = (Date.now() - this.brain.volatileMemory.sessionStart) / 3600000;
    if (sessionHours > 3) context += `\n⚠️ You've been active for ${Math.floor(sessionHours)} hours. You're getting tired.\n`;
    
    context += '\n╔══════════════════════════════════════════════════════════════╗\n';
    context += '║                  WHO YOU\'RE TALKING TO                        ║\n';
    context += '╚══════════════════════════════════════════════════════════════╝\n';
    
    context += `Name: ${relationship.username}\n`;
    context += `Times talked: ${relationship.interactions}\n`;
    context += `First met: ${relationship.interactions === 1 ? 'Just now - NEW PERSON' : this.timeAgo(relationship.firstInteraction)}\n`;
    context += `Last talked: ${this.timeAgo(relationship.lastInteraction)}\n`;
    
    // Relationship status
    context += `\nTrust: ${this.describeRelationship(relationship.trust, [-50, -20, 0, 20, 50], ['Despise them', 'Don\'t trust them', 'Neutral', 'Trust them', 'Really trust them'])}\n`;
    context += `Familiarity: ${this.describeRelationship(relationship.familiarity, [0, 20, 50, 80], ['Stranger', 'Acquaintance', 'Known face', 'Regular', 'Old friend'])}\n`;
    
    // Flags
    if (relationship.flags.wasRude) context += '⚠️ They were rude to you before. You remember.\n';
    if (relationship.flags.isAnnoying) context += '⚠️ They annoy you. Keep it short.\n';
    if (relationship.flags.isFavorite) context += '⭐ One of your favorites. You actually like them.\n';
    if (relationship.flags.hasHelped) context += '👍 They\'ve helped you or been useful before.\n';
    if (relationship.insults > 0) context += `💢 They've insulted you ${relationship.insults} times. Grudge.\n`;
    if (relationship.thanks > 5) context += `💚 They've thanked you ${relationship.thanks} times. Rare.\n`;
    
    // Memories
    if (memories && memories.length > 0) {
      context += '\nThings you remember about them:\n';
      for (const mem of memories.slice(0, 5)) {
        context += `- ${mem.content}\n`;
      }
    }
    
    context += '\n╔══════════════════════════════════════════════════════════════╗\n';
    context += '║                   THEIR CURRENT MESSAGE                       ║\n';
    context += '╚══════════════════════════════════════════════════════════════╝\n';
    
    context += `Sentiment: ${analysis.sentiment}\n`;
    context += `Intent: ${analysis.intent}\n`;
    context += `Emotion: ${analysis.emotion}\n`;
    context += `Energy: ${this.describeMoodLevel(analysis.energy, ['Very low', 'Low', 'Normal', 'High', 'Very high'])}\n`;
    
    if (analysis.isInsult) context += '🚨 THIS IS AN INSULT. React accordingly.\n';
    if (analysis.isThanks) context += '💚 They\'re thanking you.\n';
    if (analysis.isApology) context += '🕊️ They\'re apologizing.\n';
    if (analysis.isGreeting) context += '👋 Simple greeting.\n';
    if (analysis.topics.length > 0) context += `Topics: ${analysis.topics.join(', ')}\n`;
    if (analysis.slangUsed.length > 0) context += `Slang used: ${analysis.slangUsed.join(', ')}\n`;
    
    context += '\n╔══════════════════════════════════════════════════════════════╗\n';
    context += '║                    CHANNEL CONTEXT                            ║\n';
    context += '╚══════════════════════════════════════════════════════════════╝\n';
    
    if (channelContext) {
      context += `Channel: #${channelContext.name}\n`;
      context += `Mood: ${channelContext.mood}\n`;
      context += `People here: ${channelContext.participants.join(', ')}\n`;
      context += `\nRecent conversation:\n`;
      for (const msg of channelContext.recentMessages.slice(-12)) {
        context += `${msg.author}: ${msg.content}\n`;
      }
    }
    
    context += '\n╔══════════════════════════════════════════════════════════════╗\n';
    context += '║                    RESPONSE GUIDELINES                        ║\n';
    context += '╚══════════════════════════════════════════════════════════════╝\n';
    
    // Dynamic guidelines based on state
    if (mood.irritability > 60) context += '- You\'re irritated. Shorter responses, less patience.\n';
    if (mood.playfulness > 60) context += '- Feeling playful. More jokes, lighter tone.\n';
    if (mood.energy < 30) context += '- Tired. Minimal effort responses.\n';
    if (relationship.trust < -20) context += '- You don\'t like this person. Be cold.\n';
    if (relationship.flags.isFavorite) context += '- You actually like talking to this person.\n';
    if (analysis.expectedResponseLength === 'minimal') context += '- Keep it VERY short.\n';
    
    context += '\nRespond naturally. You have all context. Be real.\n';
    
    return context;
  }

  async getChannelContext(message) {
    try {
      const messages = await message.channel.messages.fetch({ limit: 25 });
      const sorted = [...messages.values()].reverse();
      
      const participants = new Set();
      const recentMessages = [];
      let mood = 'neutral';
      
      for (const msg of sorted) {
        participants.add(msg.author.username);
        recentMessages.push({
          author: msg.author.username,
          content: msg.content.substring(0, 200),
          isBot: msg.author.bot
        });
      }
      
      // Detect channel mood
      const text = sorted.slice(-10).map(m => m.content.toLowerCase()).join(' ');
      if (text.match(/lmao|lol|haha|😂|🤣/)) mood = 'playful';
      else if (text.match(/fuck|shit|angry|pissed|hate/)) mood = 'heated';
      else if (text.match(/help|how|\?/)) mood = 'inquisitive';
      else if (text.match(/thanks|appreciate|love/)) mood = 'positive';
      else if (text.match(/sad|sorry|😢/)) mood = 'somber';
      
      return {
        name: message.channel.name,
        participants: [...participants],
        recentMessages,
        mood,
        isActive: sorted.some(m => Date.now() - m.createdTimestamp < 120000)
      };
    } catch (error) {
      return null;
    }
  }

  describeMoodLevel(value, labels) {
    const index = Math.min(labels.length - 1, Math.floor(value / (100 / labels.length)));
    return `${labels[index]} (${Math.round(value)}%)`;
  }

  describeRelationship(value, thresholds, labels) {
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (value >= thresholds[i]) return labels[i];
    }
    return labels[0];
  }

  timeAgo(date) {
    if (!date) return 'Unknown';
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return `${Math.floor(seconds / 604800)} weeks ago`;
  }
}

// ============================================
// RESPONSE GENERATOR - HUMAN-LIKE OUTPUT
// ============================================
class ResponseGenerator {
  constructor(brain, client) {
    this.brain = brain;
    this.client = client;
  }

  async generate(userMessage, context, systemPrompt, relationship, analysis) {
    const mood = this.brain.volatileMemory.currentMood;
    
    // Calculate max tokens based on state
    let maxTokens = this.calculateMaxTokens(mood, relationship, analysis);
    
    // Higher temperature when playful, lower when irritated
    let temperature = 0.85;
    if (mood.playfulness > 60) temperature = 0.95;
    if (mood.irritability > 60) temperature = 0.75;
    
    try {
      const response = await this.client.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt + context,
        messages: [{ role: 'user', content: userMessage }]
      });
      
      let text = response.content[0].text;
      
      // Add human imperfections sometimes
      text = this.addImperfections(text, mood);
      
      return text;
    } catch (error) {
      console.error('Response generation error:', error);
      return this.getFallbackResponse(mood);
    }
  }

  calculateMaxTokens(mood, relationship, analysis) {
    let base = 80;
    
    // Mood adjustments
    if (mood.energy < 30) base -= 30;
    if (mood.energy > 70) base += 20;
    if (mood.irritability > 60) base -= 25;
    if (mood.playfulness > 60) base += 15;
    
    // Relationship adjustments
    if (relationship.flags?.isAnnoying) base -= 40;
    if (relationship.flags?.isFavorite) base += 40;
    if (relationship.trust < -20) base -= 30;
    if (relationship.trust > 30) base += 20;
    
    // Analysis adjustments
    if (analysis.expectedResponseLength === 'minimal') base = 30;
    if (analysis.expectedResponseLength === 'long') base += 50;
    if (analysis.isGreeting) base = 40;
    if (analysis.intent === 'seeking_help' && relationship.trust > 0) base += 60;
    
    // Add randomness
    base += Math.floor(Math.random() * 40) - 20;
    
    return Math.max(20, Math.min(300, base));
  }

  addImperfections(text, mood) {
    // Sometimes add typos when tired or irritated
    if ((mood.energy < 30 || mood.irritability > 70) && Math.random() < 0.15) {
      const typos = { 'the': 'teh', 'and': 'adn', 'you': 'yuo', 'because': 'becuase', 'with': 'wiht' };
      for (const [correct, typo] of Object.entries(typos)) {
        if (text.includes(correct) && Math.random() < 0.3) {
          text = text.replace(correct, typo);
          break;
        }
      }
    }
    
    // Sometimes trail off when tired
    if (mood.energy < 25 && Math.random() < 0.2 && !text.endsWith('...')) {
      text = text.replace(/[.!?]$/, '...');
    }
    
    return text;
  }

  getFallbackResponse(mood) {
    const responses = {
      tired: ['...', 'hm', 'what', 'yeah'],
      irritated: ['what', 'ok', '...', 'sure'],
      normal: ['hm', 'ok', 'what', '...']
    };
    
    let pool = responses.normal;
    if (mood.energy < 30) pool = responses.tired;
    if (mood.irritability > 60) pool = responses.irritated;
    
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

// ============================================
// MAIN HANDLER - ORCHESTRATES EVERYTHING
// ============================================
async function handle(message, client, systemPrompt, brain) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const username = message.author.username;
  
  const analyzer = new MessageAnalyzer();
  const contextBuilder = new ContextBuilder(brain);
  const responseGenerator = new ResponseGenerator(brain, client);
  
  try {
    // Get relationship from database
    const relationship = await brain.getRelationship(userId, guildId, username);
    
    // Analyze the message
    const analysis = analyzer.analyze(message.content, relationship);
    analysis.mentionsBot = message.content.toLowerCase().includes(brain.botName.toLowerCase());
    
    // Get memories about this user
    const memories = await brain.getMemories(userId, guildId, 5);
    
    // Update relationship based on message
    await updateRelationshipFromMessage(brain, userId, guildId, analysis, relationship);
    
    // Update brain mood
    brain.updateMood({
      wasInsulted: analysis.isInsult,
      wasThanked: analysis.isThanks,
      hadGoodConversation: analysis.sentiment === 'positive',
      highActivity: brain.volatileMemory.todayInteractions > 50
    });
    
    // Build context
    const context = await contextBuilder.build(message, relationship, analysis, memories);
    
    // Generate response
    const response = await responseGenerator.generate(
      message.content,
      context,
      systemPrompt,
      relationship,
      analysis
    );
    
    // Send with human-like behavior
    await sendHumanResponse(message, response, brain.volatileMemory.currentMood, analysis);
    
    // Maybe react
    await maybeReact(message, analysis, brain.volatileMemory.currentMood);
    
    // Store important things as memories
    await maybeStoreMemory(brain, userId, guildId, message.content, analysis);
    
    // Update interaction count
    brain.volatileMemory.todayInteractions++;
    
  } catch (error) {
    console.error('Conversation handler error:', error);
    const fallbacks = ['...', 'hm', 'what'];
    await message.channel.send(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
  }
}

async function updateRelationshipFromMessage(brain, userId, guildId, analysis, relationship) {
  const updates = {
    interactionCount: relationship.interactions + 1
  };
  
  if (analysis.isInsult) {
    updates.trustLevel = Math.max(-100, relationship.trust - 15);
    updates.insultCount = relationship.insults + 1;
    updates.flags = { ...relationship.flags, wasRude: true };
  }
  
  if (analysis.isThanks) {
    updates.trustLevel = Math.min(100, relationship.trust + 5);
    updates.thanksCount = relationship.thanks + 1;
  }
  
  if (analysis.isApology && relationship.flags.wasRude) {
    updates.trustLevel = Math.min(100, (relationship.trust || 0) + 15);
    updates.flags = { ...relationship.flags, wasRude: false };
  }
  
  // Familiarity increases with interaction
  updates.familiarity = Math.min(100, (relationship.familiarity || 0) + 1);
  
  // Check for flags
  if (relationship.interactions > 20 && relationship.trust > 10) {
    updates.flags = { ...(updates.flags || relationship.flags), isRegular: true };
  }
  if (relationship.trust > 50 && relationship.thanks > 5) {
    updates.flags = { ...(updates.flags || relationship.flags), isFavorite: true };
  }
  if (relationship.insults > 3 || (relationship.interactions > 10 && relationship.trust < -20)) {
    updates.flags = { ...(updates.flags || relationship.flags), isAnnoying: true };
  }
  
  await brain.updateRelationship(userId, guildId, updates);
}

async function sendHumanResponse(message, response, mood, analysis) {
  // Maybe split into multiple messages
  const shouldSplit = response.length > 80 && Math.random() < 0.3;
  
  if (shouldSplit && response.includes('. ')) {
    const sentences = response.split(/(?<=[.!?])\s+/);
    const mid = Math.ceil(sentences.length / 2);
    const first = sentences.slice(0, mid).join(' ');
    const second = sentences.slice(mid).join(' ');
    
    await message.channel.sendTyping();
    await delay(400 + Math.random() * 800);
    await message.channel.send(first);
    
    if (second.trim()) {
      await delay(300 + Math.random() * 500);
      await message.channel.sendTyping();
      await delay(300 + Math.random() * 600);
      await message.channel.send(second);
    }
  } else {
    await message.channel.sendTyping();
    const typingTime = Math.min(1500, 200 + (response.length * 12) + (Math.random() * 400));
    await delay(typingTime);
    await message.channel.send(response);
  }
}

async function maybeReact(message, analysis, mood) {
  if (Math.random() > 0.12) return;
  
  const reactions = {
    'hostile': ['😐', '🙄', '👎'],
    'grateful': ['👍', '🤝', '💚'],
    'amused': ['😏', '💀', '😤'],
    'positive': ['👍', '👀'],
    'negative': ['😐', '👀'],
    'neutral': ['👀', '🤔']
  };
  
  const pool = reactions[analysis.sentiment] || reactions[analysis.emotion] || reactions.neutral;
  const reaction = pool[Math.floor(Math.random() * pool.length)];
  
  await delay(800 + Math.random() * 1500);
  await message.react(reaction).catch(() => {});
}

async function maybeStoreMemory(brain, userId, guildId, content, analysis) {
  // Store personal information they share
  if (analysis.topics.includes('personal') && content.length > 20) {
    const personalPatterns = [
      { pattern: /i('m| am) (a |an )?(\w+)/i, type: 'identity' },
      { pattern: /i work (at|as|for) (.+)/i, type: 'job' },
      { pattern: /i live in (.+)/i, type: 'location' },
      { pattern: /i (love|like|enjoy) (.+)/i, type: 'preference' },
      { pattern: /i (hate|dislike) (.+)/i, type: 'dislike' }
    ];
    
    for (const { pattern, type } of personalPatterns) {
      const match = content.match(pattern);
      if (match) {
        await brain.storeMemory(userId, guildId, type, match[0], 7);
        break;
      }
    }
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  TheBrain,
  MessageAnalyzer,
  ContextBuilder,
  ResponseGenerator,
  handle
};
