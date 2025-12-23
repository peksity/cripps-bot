/**
 * ██████╗ ██████╗ ███████╗██╗  ██╗    ████████╗██╗███████╗██████╗ 
 * ██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝    ╚══██╔══╝██║██╔════╝██╔══██╗
 * ███████║██████╔╝█████╗   ╚███╔╝        ██║   ██║█████╗  ██████╔╝
 * ██╔══██║██╔═══╝ ██╔══╝   ██╔██╗        ██║   ██║██╔══╝  ██╔══██╗
 * ██║  ██║██║     ███████╗██╔╝ ██╗       ██║   ██║███████╗██║  ██║
 * ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝       ╚═╝   ╚═╝╚══════╝╚═╝  ╚═╝
 * 
 * APEX TIER AI ENGINE
 * - Extended Thinking (deep reasoning)
 * - Vision (image analysis)
 * - Streaming Responses (real-time typing)
 * - Persistent Memory (PostgreSQL)
 * - Voice Ready (ElevenLabs integration)
 */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const https = require('https');

// ============================================
// APEX BRAIN - PERSISTENT MEMORY
// ============================================
class ApexBrain {
  constructor(botName, db) {
    this.botName = botName;
    this.db = db;
    this.initialized = false;
    
    // Volatile state
    this.mood = {
      energy: 60 + Math.random() * 20,
      patience: 50 + Math.random() * 20,
      irritability: 15 + Math.random() * 15,
      openness: 40 + Math.random() * 25,
      lastUpdate: Date.now()
    };
    
    this.sessionMemory = new Map(); // Fast access for current session
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.db.query(`
        -- Persistent relationships that survive restarts
        CREATE TABLE IF NOT EXISTS apex_relationships (
          id SERIAL PRIMARY KEY,
          bot_name VARCHAR(32) NOT NULL,
          user_id VARCHAR(32) NOT NULL,
          guild_id VARCHAR(32) NOT NULL,
          username VARCHAR(64),
          
          -- Core metrics
          trust_level INT DEFAULT 0,
          respect_level INT DEFAULT 0,
          familiarity INT DEFAULT 0,
          
          -- Interaction tracking
          total_interactions INT DEFAULT 0,
          positive_interactions INT DEFAULT 0,
          negative_interactions INT DEFAULT 0,
          
          -- Specific counts
          insult_count INT DEFAULT 0,
          thanks_count INT DEFAULT 0,
          help_requests INT DEFAULT 0,
          jokes_shared INT DEFAULT 0,
          
          -- Timestamps
          first_interaction TIMESTAMP DEFAULT NOW(),
          last_interaction TIMESTAMP DEFAULT NOW(),
          last_positive TIMESTAMP,
          last_negative TIMESTAMP,
          
          -- Rich data
          remembered_facts JSONB DEFAULT '[]',
          conversation_topics JSONB DEFAULT '[]',
          inside_jokes JSONB DEFAULT '[]',
          flags JSONB DEFAULT '{"isNew": true}',
          
          UNIQUE(bot_name, user_id, guild_id)
        );

        -- Long-term memories
        CREATE TABLE IF NOT EXISTS apex_memories (
          id SERIAL PRIMARY KEY,
          bot_name VARCHAR(32) NOT NULL,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          channel_id VARCHAR(32),
          
          memory_type VARCHAR(32) NOT NULL,
          content TEXT NOT NULL,
          context TEXT,
          importance INT DEFAULT 5,
          
          created_at TIMESTAMP DEFAULT NOW(),
          last_recalled TIMESTAMP,
          recall_count INT DEFAULT 0,
          
          expires_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        );

        -- Conversation history for context
        CREATE TABLE IF NOT EXISTS apex_conversations (
          id SERIAL PRIMARY KEY,
          bot_name VARCHAR(32) NOT NULL,
          user_id VARCHAR(32) NOT NULL,
          guild_id VARCHAR(32) NOT NULL,
          channel_id VARCHAR(32) NOT NULL,
          
          user_message TEXT NOT NULL,
          bot_response TEXT NOT NULL,
          
          sentiment VARCHAR(16),
          topics JSONB DEFAULT '[]',
          
          created_at TIMESTAMP DEFAULT NOW()
        );

        -- Indexes for fast queries
        CREATE INDEX IF NOT EXISTS idx_apex_rel_lookup ON apex_relationships(bot_name, user_id, guild_id);
        CREATE INDEX IF NOT EXISTS idx_apex_mem_lookup ON apex_memories(bot_name, user_id, guild_id);
        CREATE INDEX IF NOT EXISTS idx_apex_conv_recent ON apex_conversations(bot_name, user_id, created_at DESC);
      `);
      
      this.initialized = true;
      console.log(`🧠 ${this.botName} APEX brain initialized`);
    } catch (error) {
      console.error('APEX brain init error:', error);
    }
  }

  // Get or create relationship - PERSISTENT
  async getRelationship(userId, guildId, username) {
    const cacheKey = `${userId}-${guildId}`;
    
    // Check session cache first
    if (this.sessionMemory.has(cacheKey)) {
      return this.sessionMemory.get(cacheKey);
    }
    
    try {
      let result = await this.db.query(
        `SELECT * FROM apex_relationships WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3`,
        [this.botName, userId, guildId]
      );

      let relationship;
      
      if (result.rows.length === 0) {
        // New person!
        result = await this.db.query(
          `INSERT INTO apex_relationships (bot_name, user_id, guild_id, username, flags)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [this.botName, userId, guildId, username, JSON.stringify({ isNew: true, firstMeet: Date.now() })]
        );
        relationship = this.rowToRelationship(result.rows[0]);
        relationship.isFirstMeet = true;
      } else {
        relationship = this.rowToRelationship(result.rows[0]);
        relationship.isFirstMeet = false;
        
        // Update username if changed
        if (relationship.username !== username) {
          await this.db.query(
            `UPDATE apex_relationships SET username = $1 WHERE bot_name = $2 AND user_id = $3 AND guild_id = $4`,
            [username, this.botName, userId, guildId]
          );
        }
      }
      
      // Cache it
      this.sessionMemory.set(cacheKey, relationship);
      return relationship;
      
    } catch (error) {
      console.error('Get relationship error:', error);
      return this.getDefaultRelationship(userId, username);
    }
  }

  rowToRelationship(row) {
    return {
      userId: row.user_id,
      guildId: row.guild_id,
      username: row.username,
      trust: row.trust_level,
      respect: row.respect_level,
      familiarity: row.familiarity,
      totalInteractions: row.total_interactions,
      positiveInteractions: row.positive_interactions,
      negativeInteractions: row.negative_interactions,
      insults: row.insult_count,
      thanks: row.thanks_count,
      helpRequests: row.help_requests,
      jokes: row.jokes_shared,
      firstInteraction: row.first_interaction,
      lastInteraction: row.last_interaction,
      rememberedFacts: row.remembered_facts || [],
      topics: row.conversation_topics || [],
      insideJokes: row.inside_jokes || [],
      flags: row.flags || {}
    };
  }

  getDefaultRelationship(userId, username) {
    return {
      userId: userId,
      username,
      trust: 0, respect: 0, familiarity: 0,
      totalInteractions: 0, positiveInteractions: 0, negativeInteractions: 0,
      insults: 0, thanks: 0, helpRequests: 0, jokes: 0,
      rememberedFacts: [], topics: [], insideJokes: [],
      flags: { isNew: true }, isFirstMeet: true
    };
  }

  // Update relationship in database
  async updateRelationship(userId, guildId, updates) {
    const cacheKey = `${userId}-${guildId}`;
    
    try {
      const setClauses = [];
      const values = [this.botName, userId, guildId];
      let paramIndex = 4;

      const columnMap = {
        trust: 'trust_level',
        respect: 'respect_level',
        familiarity: 'familiarity',
        totalInteractions: 'total_interactions',
        positiveInteractions: 'positive_interactions',
        negativeInteractions: 'negative_interactions',
        insults: 'insult_count',
        thanks: 'thanks_count',
        helpRequests: 'help_requests',
        jokes: 'jokes_shared',
        rememberedFacts: 'remembered_facts',
        topics: 'conversation_topics',
        insideJokes: 'inside_jokes',
        flags: 'flags'
      };

      for (const [key, value] of Object.entries(updates)) {
        const column = columnMap[key];
        if (column) {
          setClauses.push(`${column} = $${paramIndex}`);
          values.push(typeof value === 'object' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('last_interaction = NOW()');
        
        await this.db.query(
          `UPDATE apex_relationships SET ${setClauses.join(', ')} 
           WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3`,
          values
        );
        
        // Update cache
        if (this.sessionMemory.has(cacheKey)) {
          const cached = this.sessionMemory.get(cacheKey);
          Object.assign(cached, updates);
        }
      }
    } catch (error) {
      console.error('Update relationship error:', error);
    }
  }

  // Store a memory
  async storeMemory(userId, guildId, channelId, type, content, importance = 5, context = null) {
    try {
      await this.db.query(
        `INSERT INTO apex_memories (bot_name, user_id, guild_id, channel_id, memory_type, content, context, importance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [this.botName, userId, guildId, channelId, type, content, context, importance]
      );
    } catch (error) {
      console.error('Store memory error:', error);
    }
  }

  // Get relevant memories
  async getMemories(userId, guildId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT * FROM apex_memories 
         WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY importance DESC, created_at DESC
         LIMIT $4`,
        [this.botName, userId, guildId, limit]
      );
      
      // Update recall count
      if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await this.db.query(
          `UPDATE apex_memories SET last_recalled = NOW(), recall_count = recall_count + 1 WHERE id = ANY($1)`,
          [ids]
        );
      }
      
      return result.rows;
    } catch (error) {
      console.error('Get memories error:', error);
      return [];
    }
  }

  // Get conversation history
  async getConversationHistory(userId, guildId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT user_message, bot_response, sentiment, created_at 
         FROM apex_conversations 
         WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [this.botName, userId, guildId, limit]
      );
      return result.rows.reverse(); // Chronological order
    } catch (error) {
      console.error('Get conversation history error:', error);
      return [];
    }
  }

  // Store conversation
  async storeConversation(userId, guildId, channelId, userMessage, botResponse, sentiment, topics) {
    try {
      await this.db.query(
        `INSERT INTO apex_conversations (bot_name, user_id, guild_id, channel_id, user_message, bot_response, sentiment, topics)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [this.botName, userId, guildId, channelId, userMessage.substring(0, 2000), botResponse.substring(0, 2000), sentiment, JSON.stringify(topics)]
      );
      
      // Cleanup old conversations (keep last 100 per user)
      await this.db.query(
        `DELETE FROM apex_conversations WHERE id IN (
          SELECT id FROM apex_conversations 
          WHERE bot_name = $1 AND user_id = $2 AND guild_id = $3
          ORDER BY created_at DESC
          OFFSET 100
        )`,
        [this.botName, userId, guildId]
      );
    } catch (error) {
      console.error('Store conversation error:', error);
    }
  }

  // Update mood
  updateMood(factors = {}) {
    const hoursSince = (Date.now() - this.mood.lastUpdate) / 3600000;
    
    // Natural drift
    this.mood.energy = Math.min(80, this.mood.energy + hoursSince * 3);
    this.mood.patience = Math.min(70, this.mood.patience + hoursSince * 5);
    this.mood.irritability = Math.max(10, this.mood.irritability - hoursSince * 4);
    
    // Apply factors
    if (factors.wasInsulted) {
      this.mood.irritability = Math.min(95, this.mood.irritability + 25);
      this.mood.patience = Math.max(5, this.mood.patience - 20);
      this.mood.openness = Math.max(15, this.mood.openness - 15);
    }
    if (factors.wasThanked) {
      this.mood.irritability = Math.max(5, this.mood.irritability - 10);
      this.mood.openness = Math.min(85, this.mood.openness + 8);
    }
    if (factors.goodConversation) {
      this.mood.energy = Math.min(90, this.mood.energy + 5);
    }
    if (factors.imageAnalyzed) {
      this.mood.energy = Math.max(20, this.mood.energy - 5); // Vision is tiring
    }
    
    // Random fluctuations
    if (Math.random() < 0.15) {
      this.mood.energy += (Math.random() - 0.5) * 12;
      this.mood.patience += (Math.random() - 0.5) * 10;
    }
    
    // Clamp
    for (const key of ['energy', 'patience', 'irritability', 'openness']) {
      this.mood[key] = Math.max(0, Math.min(100, this.mood[key]));
    }
    
    this.mood.lastUpdate = Date.now();
    return this.mood;
  }
}

// ============================================
// VISION SYSTEM - IMAGE ANALYSIS
// ============================================
class VisionSystem {
  constructor(client) {
    this.client = client;
  }

  async analyzeImage(imageUrl, context, systemPrompt) {
    try {
      // Fetch image as base64
      const imageData = await this.fetchImageAsBase64(imageUrl);
      if (!imageData) return null;

      const response = await this.client.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt + '\n\nYou are looking at an image the user shared. Describe what you see and react to it IN CHARACTER. Be natural.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mediaType,
                data: imageData.data
              }
            },
            {
              type: 'text',
              text: context || 'What do you see in this image?'
            }
          ]
        }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Vision error:', error);
      return null;
    }
  }

  async fetchImageAsBase64(url) {
    return new Promise((resolve) => {
      try {
        const protocol = url.startsWith('https') ? https : require('http');
        
        protocol.get(url, (response) => {
          if (response.statusCode !== 200) {
            resolve(null);
            return;
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = response.headers['content-type'] || 'image/png';
            resolve({
              data: buffer.toString('base64'),
              mediaType: contentType.split(';')[0]
            });
          });
          response.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
        
      } catch (error) {
        resolve(null);
      }
    });
  }

  // Check if message has analyzable images
  getImageAttachments(message) {
    const images = [];
    
    // Check attachments
    for (const [, attachment] of message.attachments) {
      if (attachment.contentType?.startsWith('image/')) {
        images.push(attachment.url);
      }
    }
    
    // Check embeds
    for (const embed of message.embeds) {
      if (embed.image?.url) images.push(embed.image.url);
      if (embed.thumbnail?.url) images.push(embed.thumbnail.url);
    }
    
    return images;
  }
}

// ============================================
// EXTENDED THINKING - DEEP REASONING
// ============================================
class ThinkingSystem {
  constructor(client) {
    this.client = client;
  }

  async generateWithThinking(userMessage, context, systemPrompt, thinkingBudget = 8000) {
    try {
      const response = await this.client.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget
        },
        temperature: 1, // Required for extended thinking
        system: systemPrompt + context,
        messages: [{ role: 'user', content: userMessage }]
      });

      // Extract the text response (not the thinking)
      let textResponse = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          textResponse += block.text;
        }
      }

      return textResponse;
    } catch (error) {
      console.error('Thinking system error:', error);
      return null;
    }
  }
}

// ============================================
// STREAMING SYSTEM - REAL-TIME TYPING
// ============================================
class StreamingSystem {
  constructor(client) {
    this.client = client;
  }

  async streamResponse(message, systemPrompt, context, userMessage) {
    try {
      let fullResponse = '';
      let lastUpdate = '';
      let sentMessage = null;
      
      // Start typing
      await message.channel.sendTyping();

      const stream = this.client.anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        temperature: 0.9,
        system: systemPrompt + context,
        messages: [{ role: 'user', content: userMessage }]
      });

      // Process stream
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullResponse += event.delta.text;
          
          // Update message every ~50 chars or at sentence breaks
          if (fullResponse.length - lastUpdate.length > 50 || 
              (fullResponse.match(/[.!?]\s*$/) && fullResponse.length > lastUpdate.length + 20)) {
            
            if (!sentMessage) {
              sentMessage = await message.channel.send(fullResponse + '▌');
            } else {
              await sentMessage.edit(fullResponse + '▌').catch(() => {});
            }
            lastUpdate = fullResponse;
          }
        }
      }

      // Final update without cursor
      if (sentMessage) {
        await sentMessage.edit(fullResponse).catch(() => {});
      } else if (fullResponse) {
        await message.channel.send(fullResponse);
      }

      return fullResponse;
    } catch (error) {
      console.error('Streaming error:', error);
      return null;
    }
  }
}

// ============================================
// VOICE SYSTEM - ELEVENLABS TTS
// ============================================
class VoiceSystem {
  constructor(voiceId, apiKey) {
    this.voiceId = voiceId;
    this.apiKey = apiKey;
    this.enabled = !!apiKey;
  }

  async synthesize(text) {
    if (!this.enabled) return null;
    
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text.substring(0, 1000), // Limit for cost
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) return null;
      
      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error('Voice synthesis error:', error);
      return null;
    }
  }
}

// ============================================
// MESSAGE ANALYZER - DEEP UNDERSTANDING
// ============================================
class MessageAnalyzer {
  analyze(content, relationship) {
    const lower = content.toLowerCase();
    
    return {
      sentiment: this.detectSentiment(lower),
      intent: this.detectIntent(lower),
      emotion: this.detectEmotion(lower),
      energy: this.detectEnergy(content),
      
      isQuestion: /\?/.test(content),
      isGreeting: /^(hey|hi|hello|yo|sup|what'?s? up)/i.test(lower),
      isInsult: this.detectInsult(lower),
      isThanks: /\b(thank|thanks|thx|ty|appreciate)\b/i.test(lower),
      isApology: /\b(sorry|apologize|my bad)\b/i.test(lower),
      
      topics: this.detectTopics(lower),
      slang: this.detectSlang(lower),
      
      mentionsImage: /\b(look|see|picture|image|screenshot|pic|photo)\b/i.test(lower),
      isComplex: content.length > 100 || content.split(' ').length > 20,
      
      expectedLength: this.estimateResponseLength(content, relationship)
    };
  }

  detectSentiment(text) {
    const pos = (text.match(/\b(love|great|awesome|amazing|good|nice|thanks|happy|perfect|best)\b/gi) || []).length;
    const neg = (text.match(/\b(hate|bad|terrible|awful|worst|angry|stupid|dumb|sucks)\b/gi) || []).length;
    if (pos > neg + 1) return 'positive';
    if (neg > pos + 1) return 'negative';
    return 'neutral';
  }

  detectIntent(text) {
    if (/\b(help|how (do|to|can)|what (is|are)|explain)\b/i.test(text)) return 'seeking_help';
    if (/\b(thanks|thank you)\b/i.test(text)) return 'gratitude';
    if (/^(hey|hi|hello)/i.test(text)) return 'greeting';
    if (/\?$/.test(text)) return 'question';
    if (/\b(lol|lmao|haha)\b/i.test(text)) return 'humor';
    return 'conversation';
  }

  detectEmotion(text) {
    if (/😂|🤣|lmao|lol|haha/i.test(text)) return 'amused';
    if (/😢|😭|sad/i.test(text)) return 'sad';
    if (/😠|😤|angry|pissed/i.test(text)) return 'angry';
    if (/😊|happy|excited/i.test(text)) return 'happy';
    return 'neutral';
  }

  detectEnergy(text) {
    let e = 50;
    if (text === text.toUpperCase() && text.length > 5) e += 30;
    if (/!{2,}/.test(text)) e += 20;
    if (text.length < 10) e -= 15;
    return Math.max(10, Math.min(100, e));
  }

  detectInsult(text) {
    return /fuck (you|off)|stfu|shut up|idiot|stupid|dumb|trash|garbage|useless|pathetic|bitch|asshole/i.test(text);
  }

  detectTopics(text) {
    const patterns = {
      money: /\b(money|cash|mil|million|grind)\b/i,
      heist: /\b(heist|score|job|setup)\b/i,
      cayo: /\b(cayo|perico|rubio|kosatka)\b/i,
      vehicle: /\b(car|bike|plane|heli)\b/i,
      help: /\b(help|how|what|why)\b/i
    };
    return Object.entries(patterns).filter(([, p]) => p.test(text)).map(([t]) => t);
  }

  detectSlang(text) {
    const slang = ['lol', 'lmao', 'bruh', 'ngl', 'fr', 'wtf', 'idk', 'rn', 'gg', 'goat', 'mid', 'sus', 'bet', 'no cap'];
    return slang.filter(s => text.includes(s));
  }

  estimateResponseLength(content, relationship) {
    if (content.length < 10) return 'short';
    if (relationship?.flags?.isAnnoying) return 'minimal';
    if (content.length > 150) return 'long';
    return 'medium';
  }
}

// ============================================
// CONTEXT BUILDER
// ============================================
class ContextBuilder {
  constructor(brain) {
    this.brain = brain;
  }

  async build(message, relationship, analysis, memories, conversationHistory) {
    const mood = this.brain.mood;
    const channelContext = await this.getChannelContext(message);
    
    let ctx = '\n\n';
    ctx += '╔═══════════════════════════════════════════════════════════╗\n';
    ctx += '║                    YOUR CURRENT STATE                     ║\n';
    ctx += '╚═══════════════════════════════════════════════════════════╝\n';
    ctx += `Energy: ${mood.energy < 30 ? 'Tired' : mood.energy < 60 ? 'Normal' : 'Alert'} (${Math.round(mood.energy)}%)\n`;
    ctx += `Patience: ${mood.patience < 30 ? 'Thin' : mood.patience < 60 ? 'Normal' : 'Patient'} (${Math.round(mood.patience)}%)\n`;
    ctx += `Irritability: ${mood.irritability > 60 ? 'High' : mood.irritability > 30 ? 'Moderate' : 'Calm'} (${Math.round(mood.irritability)}%)\n`;
    
    ctx += '\n╔═══════════════════════════════════════════════════════════╗\n';
    ctx += '║                  WHO YOU\'RE TALKING TO                    ║\n';
    ctx += '╚═══════════════════════════════════════════════════════════╝\n';
    ctx += `Name: ${relationship.username}\n`;
    ctx += `Total conversations: ${relationship.totalInteractions}\n`;
    
    if (relationship.isFirstMeet) {
      ctx += '⭐ FIRST TIME MEETING - They\'re new to you\n';
    } else {
      ctx += `Trust: ${relationship.trust > 30 ? 'High' : relationship.trust < -10 ? 'Low' : 'Neutral'} (${relationship.trust})\n`;
      ctx += `Familiarity: ${relationship.familiarity > 50 ? 'Well known' : relationship.familiarity > 20 ? 'Familiar' : 'New'}\n`;
    }
    
    if (relationship.flags?.wasRude) ctx += '⚠️ They were rude to you before\n';
    if (relationship.flags?.isFavorite) ctx += '⭐ One of your favorites\n';
    if (relationship.insults > 0) ctx += `💢 Insulted you ${relationship.insults} times\n`;
    if (relationship.thanks > 3) ctx += `💚 Thanked you ${relationship.thanks} times\n`;
    
    // Memories
    if (memories && memories.length > 0) {
      ctx += '\nThings you remember about them:\n';
      for (const mem of memories.slice(0, 5)) {
        ctx += `- ${mem.content}\n`;
      }
    }
    
    // Previous conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      ctx += '\nRecent conversation history:\n';
      for (const conv of conversationHistory.slice(-5)) {
        ctx += `Them: "${conv.user_message.substring(0, 100)}"\n`;
        ctx += `You: "${conv.bot_response.substring(0, 100)}"\n`;
      }
    }
    
    ctx += '\n╔═══════════════════════════════════════════════════════════╗\n';
    ctx += '║                   CURRENT MESSAGE                         ║\n';
    ctx += '╚═══════════════════════════════════════════════════════════╝\n';
    ctx += `Sentiment: ${analysis.sentiment}\n`;
    ctx += `Intent: ${analysis.intent}\n`;
    if (analysis.isInsult) ctx += '🚨 THIS IS AN INSULT\n';
    if (analysis.isThanks) ctx += '💚 Thanking you\n';
    if (analysis.topics.length > 0) ctx += `Topics: ${analysis.topics.join(', ')}\n`;
    
    // Channel context
    if (channelContext) {
      ctx += `\nChannel: #${channelContext.name}\n`;
      ctx += `People here: ${channelContext.participants.join(', ')}\n`;
      ctx += '\nRecent messages:\n';
      for (const msg of channelContext.messages.slice(-8)) {
        ctx += `${msg.author}: ${msg.content}\n`;
      }
    }
    
    ctx += '\n═══════════════════════════════════════════════════════════\n';
    
    return ctx;
  }

  async getChannelContext(message) {
    try {
      const messages = await message.channel.messages.fetch({ limit: 20 });
      const sorted = [...messages.values()].reverse();
      
      return {
        name: message.channel.name,
        participants: [...new Set(sorted.map(m => m.author.username))],
        messages: sorted.map(m => ({
          author: m.author.username,
          content: m.content.substring(0, 150),
          isBot: m.author.bot
        }))
      };
    } catch (error) {
      return null;
    }
  }
}

// ============================================
// MAIN APEX HANDLER
// ============================================
async function handleApex(message, client, systemPrompt, brain, options = {}) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const username = message.author.username;

  // Initialize systems
  const analyzer = new MessageAnalyzer();
  const contextBuilder = new ContextBuilder(brain);
  const vision = new VisionSystem(client);
  const thinking = new ThinkingSystem(client);
  const streaming = new StreamingSystem(client);

  try {
    // Ensure brain is initialized
    await brain.initialize();
    
    // Get relationship from DB
    const relationship = await brain.getRelationship(userId, guildId, username);
    
    // Analyze message
    const analysis = analyzer.analyze(message.content, relationship);
    
    // Get memories and history
    const memories = await brain.getMemories(userId, guildId, 5);
    const history = await brain.getConversationHistory(userId, guildId, 5);
    
    // Check for images
    const images = vision.getImageAttachments(message);
    let imageResponse = null;
    
    if (images.length > 0) {
      await message.channel.sendTyping();
      imageResponse = await vision.analyzeImage(images[0], message.content, systemPrompt);
      brain.updateMood({ imageAnalyzed: true });
    }
    
    // Build context
    const context = await contextBuilder.build(message, relationship, analysis, memories, history);
    
    // Update relationship based on message
    const updates = {
      totalInteractions: relationship.totalInteractions + 1,
      familiarity: Math.min(100, relationship.familiarity + 1)
    };
    
    if (analysis.isInsult) {
      updates.trust = Math.max(-100, relationship.trust - 15);
      updates.insults = relationship.insults + 1;
      updates.negativeInteractions = relationship.negativeInteractions + 1;
      updates.flags = { ...relationship.flags, wasRude: true };
      brain.updateMood({ wasInsulted: true });
    }
    
    if (analysis.isThanks) {
      updates.trust = Math.min(100, relationship.trust + 5);
      updates.thanks = relationship.thanks + 1;
      updates.positiveInteractions = relationship.positiveInteractions + 1;
      brain.updateMood({ wasThanked: true });
    }
    
    await brain.updateRelationship(userId, guildId, updates);
    
    // Generate response
    let response;
    
    if (imageResponse) {
      response = imageResponse;
    } else if (analysis.isComplex && options.useThinking) {
      // Use extended thinking for complex questions
      response = await thinking.generateWithThinking(message.content, context, systemPrompt);
    } else if (options.useStreaming) {
      // Use streaming for real-time feel
      response = await streaming.streamResponse(message, systemPrompt, context, message.content);
    } else {
      // Standard response
      response = await generateStandardResponse(client, message.content, context, systemPrompt, brain.mood, relationship, analysis);
    }
    
    if (!response) {
      response = ['...', 'hm', 'what'][Math.floor(Math.random() * 3)];
    }
    
    // Send if not already sent by streaming
    if (!options.useStreaming || !response) {
      await sendHumanLike(message, response, brain.mood, analysis);
    }
    
    // Store conversation
    await brain.storeConversation(userId, guildId, channelId, message.content, response, analysis.sentiment, analysis.topics);
    
    // Extract and store any personal info shared
    await extractAndStoreMemories(brain, userId, guildId, channelId, message.content, analysis);
    
    // Maybe react
    if (Math.random() < 0.1) {
      const reacts = analysis.sentiment === 'positive' ? ['👍', '💚'] : analysis.sentiment === 'negative' ? ['😐', '👀'] : ['👀', '🤔'];
      await message.react(reacts[Math.floor(Math.random() * reacts.length)]).catch(() => {});
    }
    
    brain.updateMood({ goodConversation: analysis.sentiment === 'positive' });
    
  } catch (error) {
    console.error('APEX handler error:', error);
    await message.channel.send(['...', 'hm', 'hold on'][Math.floor(Math.random() * 3)]);
  }
}

async function generateStandardResponse(client, userMessage, context, systemPrompt, mood, relationship, analysis) {
  let maxTokens = 80;
  
  if (mood.energy < 30) maxTokens -= 30;
  if (mood.irritability > 60) maxTokens -= 20;
  if (relationship?.flags?.isFavorite) maxTokens += 40;
  if (relationship?.flags?.isAnnoying) maxTokens = 30;
  if (analysis.expectedLength === 'long') maxTokens += 50;
  if (analysis.expectedLength === 'minimal') maxTokens = 25;
  
  maxTokens = Math.max(20, Math.min(300, maxTokens + Math.floor(Math.random() * 40) - 20));
  
  const response = await client.anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    temperature: 0.9,
    system: systemPrompt + context,
    messages: [{ role: 'user', content: userMessage }]
  });
  
  return response.content[0].text;
}

async function sendHumanLike(message, response, mood, analysis) {
  // Maybe split message
  if (response.length > 80 && Math.random() < 0.3 && response.includes('. ')) {
    const parts = response.split(/(?<=[.!?])\s+/);
    const mid = Math.ceil(parts.length / 2);
    
    await message.channel.sendTyping();
    await delay(300 + Math.random() * 700);
    await message.channel.send(parts.slice(0, mid).join(' '));
    
    if (parts.slice(mid).join(' ').trim()) {
      await delay(200 + Math.random() * 500);
      await message.channel.send(parts.slice(mid).join(' '));
    }
  } else {
    await message.channel.sendTyping();
    await delay(200 + Math.min(1200, response.length * 12));
    await message.channel.send(response);
  }
}

async function extractAndStoreMemories(brain, userId, guildId, channelId, content, analysis) {
  if (content.length < 15) return;
  
  const patterns = [
    { pattern: /(?:i'?m|i am) (?:a |an )?(\w+ ?\w*)/i, type: 'identity' },
    { pattern: /i (?:work|working) (?:at|as|for) (.+?)(?:\.|,|$)/i, type: 'job' },
    { pattern: /i live in (.+?)(?:\.|,|$)/i, type: 'location' },
    { pattern: /my (?:name is|name's) (\w+)/i, type: 'name' },
    { pattern: /i (?:really )?(?:love|like|enjoy) (.+?)(?:\.|,|$)/i, type: 'preference' }
  ];
  
  for (const { pattern, type } of patterns) {
    const match = content.match(pattern);
    if (match) {
      await brain.storeMemory(userId, guildId, channelId, type, match[0], 7, analysis.topics.join(','));
      break;
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
  ApexBrain,
  VisionSystem,
  ThinkingSystem,
  StreamingSystem,
  VoiceSystem,
  MessageAnalyzer,
  ContextBuilder,
  handleApex
};
