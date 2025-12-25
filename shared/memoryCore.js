/**
 * ███╗   ███╗███████╗███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗     ██████╗ ██████╗ ██████╗ ███████╗
 * ████╗ ████║██╔════╝████╗ ████║██╔═══██╗██╔══██╗╚██╗ ██╔╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
 * ██╔████╔██║█████╗  ██╔████╔██║██║   ██║██████╔╝ ╚████╔╝     ██║     ██║   ██║██████╔╝█████╗  
 * ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██║   ██║██╔══██╗  ╚██╔╝      ██║     ██║   ██║██╔══██╗██╔══╝  
 * ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║╚██████╔╝██║  ██║   ██║       ╚██████╗╚██████╔╝██║  ██║███████╗
 * ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝        ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
 * 
 * MEMORY CORE - Deep Persistent Memory System
 * 
 * Every bot shares this memory. They remember:
 * - Every user they've interacted with
 * - Opinions formed about users
 * - Past conversations and context
 * - LFG history, fails, successes
 * - Predictions made, promises given
 * - Running jokes, inside references
 */

const { Pool } = require('pg');

class MemoryCore {
  constructor(pool) {
    this.pool = pool;
    this.userCache = new Map(); // Quick access cache
    this.recentInteractions = new Map(); // userId -> recent interactions
    this.botOpinions = new Map(); // `${botId}_${odIdActual}` -> opinion data
  }

  /**
   * Initialize database tables
   */
  async initialize() {
    try {
      // User profiles - everything we know about a user
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id VARCHAR(50) PRIMARY KEY,
          username VARCHAR(100),
          display_name VARCHAR(100),
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          message_count INT DEFAULT 0,
          
          -- Behavioral data
          typical_active_hours TEXT DEFAULT '[]',
          avg_message_length INT DEFAULT 0,
          uses_caps_often BOOLEAN DEFAULT FALSE,
          uses_emojis_often BOOLEAN DEFAULT FALSE,
          conversation_style VARCHAR(50) DEFAULT 'normal',
          
          -- Interests/topics
          mentioned_topics TEXT DEFAULT '[]',
          favorite_games TEXT DEFAULT '[]',
          
          -- LFG data
          lfg_hosted INT DEFAULT 0,
          lfg_joined INT DEFAULT 0,
          lfg_completed INT DEFAULT 0,
          lfg_abandoned INT DEFAULT 0,
          lfg_kicked INT DEFAULT 0,
          preferred_lfg_type VARCHAR(50),
          
          -- Reliability score (0-100)
          reliability_score INT DEFAULT 50,
          
          -- Notes (freeform)
          notes TEXT DEFAULT '[]',
          
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Bot opinions about users
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bot_opinions (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          
          -- Opinion metrics (-100 to 100)
          fondness INT DEFAULT 0,
          respect INT DEFAULT 0,
          trust INT DEFAULT 0,
          annoyance INT DEFAULT 0,
          interest INT DEFAULT 0,
          
          -- Specific flags
          is_favorite BOOLEAN DEFAULT FALSE,
          is_annoying BOOLEAN DEFAULT FALSE,
          is_suspicious BOOLEAN DEFAULT FALSE,
          has_grudge BOOLEAN DEFAULT FALSE,
          
          -- Memory snippets
          memorable_moments TEXT DEFAULT '[]',
          inside_jokes TEXT DEFAULT '[]',
          
          -- Interaction count
          interaction_count INT DEFAULT 0,
          last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE(bot_id, user_id)
        )
      `);

      // Conversation history (searchable)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS conversation_memory (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          channel_id VARCHAR(50),
          channel_name VARCHAR(100),
          
          user_message TEXT,
          bot_response TEXT,
          
          -- Context
          topic VARCHAR(100),
          sentiment VARCHAR(20),
          was_helpful BOOLEAN,
          
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Predictions and promises
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS predictions (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          prediction_text TEXT,
          made_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fulfillment_status VARCHAR(20) DEFAULT 'pending',
          fulfilled_at TIMESTAMP,
          notes TEXT
        )
      `);

      // Server events memory
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS server_events (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(50),
          user_id VARCHAR(50),
          details TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[MEMORY CORE] ✅ Database initialized');
    } catch (e) {
      console.error('[MEMORY CORE] Init error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER PROFILE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get or create user profile
   */
  async getUser(userId, username = null) {
    // Check cache first
    if (this.userCache.has(odIdActual)) {
      return this.userCache.get(odIdActual);
    }

    try {
      let result = await this.pool.query(
        'SELECT * FROM user_profiles WHERE user_id = $1',
        [odIdActual]
      );

      if (result.rows.length === 0 && username) {
        // Create new user
        await this.pool.query(`
          INSERT INTO user_profiles (user_id, username) VALUES ($1, $2)
        `, [odIdActual, username]);
        
        result = await this.pool.query(
          'SELECT * FROM user_profiles WHERE user_id = $1',
          [odIdActual]
        );
      }

      if (result.rows.length > 0) {
        const user = result.rows[0];
        this.userCache.set(odIdActual, user);
        return user;
      }
    } catch (e) {
      console.error('[MEMORY] getUser error:', e.message);
    }
    
    return null;
  }

  /**
   * Update user profile field
   */
  async updateUser(userId, field, value) {
    try {
      await this.pool.query(`
        UPDATE user_profiles SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2
      `, [value, odIdActual]);
      
      // Invalidate cache
      this.userCache.delete(odIdActual);
    } catch (e) {
      console.error('[MEMORY] updateUser error:', e.message);
    }
  }

  /**
   * Record user activity (call on every message)
   */
  async recordActivity(userId, username, message) {
    try {
      const content = message.content || '';
      const hasEmojis = /[\u{1F600}-\u{1F64F}]/u.test(content);
      const hasCaps = content.length > 5 && content === content.toUpperCase();
      
      await this.pool.query(`
        INSERT INTO user_profiles (user_id, username, message_count, last_seen)
        VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          username = $2,
          message_count = user_profiles.message_count + 1,
          last_seen = CURRENT_TIMESTAMP,
          uses_emojis_often = CASE WHEN $3 THEN TRUE ELSE user_profiles.uses_emojis_often END,
          uses_caps_often = CASE WHEN $4 THEN TRUE ELSE user_profiles.uses_caps_often END
      `, [odIdActual, username, hasEmojis, hasCaps]);
      
      this.userCache.delete(odIdActual);
    } catch (e) {
      console.error('[MEMORY] recordActivity error:', e.message);
    }
  }

  /**
   * Get user's LFG reliability score
   */
  async getReliability(userId) {
    const user = await this.getUser(odIdActual);
    return user?.reliability_score || 50;
  }

  /**
   * Update reliability based on LFG behavior
   */
  async updateReliability(userId, action) {
    const deltas = {
      'completed': 5,
      'hosted': 3,
      'joined': 1,
      'abandoned': -15,
      'kicked': -10,
      'no_show': -20
    };
    
    const delta = deltas[action] || 0;
    
    try {
      await this.pool.query(`
        UPDATE user_profiles SET 
          reliability_score = GREATEST(0, LEAST(100, reliability_score + $1)),
          lfg_${action === 'completed' ? 'completed' : action === 'abandoned' ? 'abandoned' : action === 'kicked' ? 'kicked' : action === 'hosted' ? 'hosted' : 'joined'} = 
            lfg_${action === 'completed' ? 'completed' : action === 'abandoned' ? 'abandoned' : action === 'kicked' ? 'kicked' : action === 'hosted' ? 'hosted' : 'joined'} + 1
        WHERE user_id = $2
      `, [delta, odIdActual]);
      
      this.userCache.delete(odIdActual);
    } catch (e) {
      console.error('[MEMORY] updateReliability error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOT OPINION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get bot's opinion of a user
   */
  async getBotOpinion(botId, userId) {
    const key = `${botId}_${odIdActual}`;
    
    if (this.botOpinions.has(key)) {
      return this.botOpinions.get(key);
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM bot_opinions WHERE bot_id = $1 AND user_id = $2',
        [botId, odIdActual]
      );

      if (result.rows.length > 0) {
        this.botOpinions.set(key, result.rows[0]);
        return result.rows[0];
      }
    } catch (e) {
      console.error('[MEMORY] getBotOpinion error:', e.message);
    }
    
    return null;
  }

  /**
   * Update bot's opinion of user
   */
  async updateBotOpinion(botId, userId, field, delta) {
    const key = `${botId}_${odIdActual}`;
    
    try {
      await this.pool.query(`
        INSERT INTO bot_opinions (bot_id, user_id, ${field}, interaction_count)
        VALUES ($1, $2, $3, 1)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET
          ${field} = GREATEST(-100, LEAST(100, bot_opinions.${field} + $3)),
          interaction_count = bot_opinions.interaction_count + 1,
          last_interaction = CURRENT_TIMESTAMP
      `, [botId, odIdActual, delta]);
      
      this.botOpinions.delete(key);
    } catch (e) {
      console.error('[MEMORY] updateBotOpinion error:', e.message);
    }
  }

  /**
   * Record a memorable moment
   */
  async addMemorableMoment(botId, userId, moment) {
    try {
      const result = await this.pool.query(
        'SELECT memorable_moments FROM bot_opinions WHERE bot_id = $1 AND user_id = $2',
        [botId, odIdActual]
      );
      
      let moments = [];
      if (result.rows.length > 0) {
        moments = JSON.parse(result.rows[0].memorable_moments || '[]');
      }
      
      moments.push({
        text: moment,
        timestamp: Date.now()
      });
      
      // Keep last 20 moments
      moments = moments.slice(-20);
      
      await this.pool.query(`
        INSERT INTO bot_opinions (bot_id, user_id, memorable_moments)
        VALUES ($1, $2, $3)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET
          memorable_moments = $3
      `, [botId, odIdActual, JSON.stringify(moments)]);
    } catch (e) {
      console.error('[MEMORY] addMemorableMoment error:', e.message);
    }
  }

  /**
   * Get random memorable moment about user
   */
  async getRandomMemory(botId, userId) {
    try {
      const result = await this.pool.query(
        'SELECT memorable_moments FROM bot_opinions WHERE bot_id = $1 AND user_id = $2',
        [botId, odIdActual]
      );
      
      if (result.rows.length > 0) {
        const moments = JSON.parse(result.rows[0].memorable_moments || '[]');
        if (moments.length > 0) {
          return moments[Math.floor(Math.random() * moments.length)];
        }
      }
    } catch (e) {
      console.error('[MEMORY] getRandomMemory error:', e.message);
    }
    
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION MEMORY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store conversation exchange
   */
  async storeConversation(botId, userId, channelId, channelName, userMessage, botResponse, topic = null) {
    try {
      await this.pool.query(`
        INSERT INTO conversation_memory 
        (bot_id, user_id, channel_id, channel_name, user_message, bot_response, topic)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [botId, odIdActual, channelId, channelName, userMessage, botResponse, topic]);
    } catch (e) {
      console.error('[MEMORY] storeConversation error:', e.message);
    }
  }

  /**
   * Search past conversations
   */
  async searchConversations(botId, userId, searchTerm, limit = 5) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM conversation_memory 
        WHERE bot_id = $1 AND user_id = $2 
        AND (user_message ILIKE $3 OR bot_response ILIKE $3)
        ORDER BY timestamp DESC
        LIMIT $4
      `, [botId, odIdActual, `%${searchTerm}%`, limit]);
      
      return result.rows;
    } catch (e) {
      console.error('[MEMORY] searchConversations error:', e.message);
      return [];
    }
  }

  /**
   * Get recent conversations with user
   */
  async getRecentConversations(botId, userId, limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM conversation_memory 
        WHERE bot_id = $1 AND user_id = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `, [botId, odIdActual, limit]);
      
      return result.rows;
    } catch (e) {
      console.error('[MEMORY] getRecentConversations error:', e.message);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREDICTION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store a prediction
   */
  async storePrediction(botId, userId, predictionText) {
    try {
      await this.pool.query(`
        INSERT INTO predictions (bot_id, user_id, prediction_text)
        VALUES ($1, $2, $3)
      `, [botId, odIdActual, predictionText]);
    } catch (e) {
      console.error('[MEMORY] storePrediction error:', e.message);
    }
  }

  /**
   * Get unfulfilled predictions for user
   */
  async getPendingPredictions(botId, userId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM predictions 
        WHERE bot_id = $1 AND user_id = $2 AND fulfillment_status = 'pending'
        ORDER BY made_at DESC
      `, [botId, odIdActual]);
      
      return result.rows;
    } catch (e) {
      console.error('[MEMORY] getPendingPredictions error:', e.message);
      return [];
    }
  }

  /**
   * Mark prediction as fulfilled
   */
  async fulfillPrediction(predictionId, notes = null) {
    try {
      await this.pool.query(`
        UPDATE predictions SET 
          fulfillment_status = 'fulfilled',
          fulfilled_at = CURRENT_TIMESTAMP,
          notes = $2
        WHERE id = $1
      `, [predictionId, notes]);
    } catch (e) {
      console.error('[MEMORY] fulfillPrediction error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXT BUILDING FOR PROMPTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build memory context string for AI prompt
   */
  async buildMemoryContext(botId, userId) {
    const user = await this.getUser(odIdActual);
    const opinion = await this.getBotOpinion(botId, odIdActual);
    const recentConvos = await this.getRecentConversations(botId, odIdActual, 3);
    const predictions = await this.getPendingPredictions(botId, odIdActual);
    const randomMemory = await this.getRandomMemory(botId, odIdActual);
    
    let context = '';
    
    if (user) {
      context += `\n[USER PROFILE: ${user.username}]`;
      context += `\n- First seen: ${user.first_seen}`;
      context += `\n- Messages: ${user.message_count}`;
      context += `\n- LFG stats: ${user.lfg_completed} completed, ${user.lfg_abandoned} abandoned`;
      context += `\n- Reliability: ${user.reliability_score}/100`;
    }
    
    if (opinion) {
      context += `\n[YOUR OPINION OF THEM]`;
      context += `\n- Fondness: ${opinion.fondness}/100`;
      context += `\n- Annoyance: ${opinion.annoyance}/100`;
      if (opinion.is_favorite) context += `\n- This is one of your FAVORITES`;
      if (opinion.is_annoying) context += `\n- You find them ANNOYING`;
      if (opinion.has_grudge) context += `\n- You have a GRUDGE against them`;
    }
    
    if (randomMemory) {
      context += `\n[RANDOM MEMORY] "${randomMemory.text}"`;
    }
    
    if (predictions.length > 0) {
      context += `\n[UNFULFILLED PREDICTION] You once told them: "${predictions[0].prediction_text}"`;
    }
    
    return context;
  }
}

// Singleton
let instance = null;

function getMemoryCore(pool) {
  if (!instance) {
    instance = new MemoryCore(pool);
  }
  return instance;
}

module.exports = { MemoryCore, getMemoryCore };
