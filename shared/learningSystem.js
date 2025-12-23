/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LEARNING & ADAPTATION SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This system allows bots to LEARN and improve over time:
 * 
 * - Track which responses get reactions (good/bad)
 * - Learn what topics users engage with most
 * - Adapt humor style based on reception
 * - Remember what works for specific users
 * - Track conversation patterns that lead to engagement
 * - Optimize response length based on user preferences
 * - Learn peak activity times
 * - Identify popular topics and inside jokes
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- Response effectiveness tracking
CREATE TABLE IF NOT EXISTS response_feedback (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32),
  user_id VARCHAR(32),
  response_type VARCHAR(64),
  topic VARCHAR(128),
  response_length INT,
  timestamp TIMESTAMP DEFAULT NOW(),
  reactions_positive INT DEFAULT 0,
  reactions_negative INT DEFAULT 0,
  got_reply BOOLEAN DEFAULT FALSE,
  reply_sentiment VARCHAR(32),
  conversation_continued BOOLEAN DEFAULT FALSE,
  effectiveness_score FLOAT DEFAULT 0.5
);

-- Topic engagement tracking
CREATE TABLE IF NOT EXISTS topic_engagement (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  topic VARCHAR(128) NOT NULL,
  engagement_count INT DEFAULT 0,
  positive_responses INT DEFAULT 0,
  negative_responses INT DEFAULT 0,
  avg_conversation_length FLOAT DEFAULT 1,
  last_engaged TIMESTAMP DEFAULT NOW(),
  UNIQUE(bot_id, topic)
);

-- User preference learning
CREATE TABLE IF NOT EXISTS user_preferences_learned (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  preferred_response_length VARCHAR(32) DEFAULT 'medium',
  preferred_humor_level FLOAT DEFAULT 0.5,
  preferred_formality FLOAT DEFAULT 0.5,
  prefers_emojis BOOLEAN DEFAULT NULL,
  prefers_questions BOOLEAN DEFAULT NULL,
  active_hours JSONB DEFAULT '[]',
  favorite_topics JSONB DEFAULT '[]',
  avoided_topics JSONB DEFAULT '[]',
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(bot_id, user_id)
);

-- Conversation pattern tracking
CREATE TABLE IF NOT EXISTS conversation_patterns (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  pattern_type VARCHAR(64),
  trigger_context TEXT,
  successful_response TEXT,
  success_count INT DEFAULT 1,
  failure_count INT DEFAULT 0,
  last_used TIMESTAMP DEFAULT NOW()
);

-- Activity patterns
CREATE TABLE IF NOT EXISTS activity_patterns (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  hour_of_day INT,
  day_of_week INT,
  avg_messages FLOAT DEFAULT 0,
  avg_engagement FLOAT DEFAULT 0,
  sample_count INT DEFAULT 0,
  UNIQUE(bot_id, channel_id, hour_of_day, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_feedback_bot ON response_feedback(bot_id);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON response_feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_topic ON topic_engagement(topic);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LEARNING THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

const LEARNING_CONFIG = {
  // Minimum data points before making adaptations
  minSampleSize: 10,
  
  // How much to weight recent interactions vs older ones
  recencyWeight: 0.7,
  
  // Effectiveness score thresholds
  effectivenessThresholds: {
    excellent: 0.8,
    good: 0.6,
    neutral: 0.4,
    poor: 0.2
  },
  
  // Response length categories
  responseLengths: {
    short: { min: 0, max: 50 },
    medium: { min: 51, max: 150 },
    long: { min: 151, max: 300 },
    very_long: { min: 301, max: Infinity }
  },
  
  // Humor levels (0-1)
  humorLevels: {
    serious: 0.1,
    mild: 0.3,
    moderate: 0.5,
    high: 0.7,
    maximum: 0.9
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEARNING SYSTEM CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class LearningSystem {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.initialized = false;
    this.cache = {
      topicEngagement: new Map(),
      userPreferences: new Map(),
      patterns: []
    };
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.pool.query(SCHEMA);
      this.initialized = true;
      console.log(`[LEARNING] ${this.botId} learning system initialized`);
      await this.loadCache();
    } catch (error) {
      console.error('[LEARNING] Init error:', error);
    }
  }

  async loadCache() {
    try {
      // Load top topics
      const topics = await this.pool.query(
        `SELECT * FROM topic_engagement WHERE bot_id = $1 ORDER BY engagement_count DESC LIMIT 50`,
        [this.botId]
      );
      for (const topic of topics.rows) {
        this.cache.topicEngagement.set(topic.topic, topic);
      }

      // Load successful patterns
      const patterns = await this.pool.query(
        `SELECT * FROM conversation_patterns WHERE bot_id = $1 
         AND success_count > failure_count ORDER BY success_count DESC LIMIT 100`,
        [this.botId]
      );
      this.cache.patterns = patterns.rows;
    } catch (error) {
      console.error('[LEARNING] Cache load error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESPONSE TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a response for later feedback tracking
   */
  async recordResponse(messageId, channelId, userId, responseType, topic, responseLength) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO response_feedback 
         (bot_id, message_id, channel_id, user_id, response_type, topic, response_length)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [this.botId, messageId, channelId, userId, responseType, topic, responseLength]
      );
    } catch (error) {
      console.error('[LEARNING] recordResponse error:', error);
    }
  }

  /**
   * Record positive feedback (reaction, reply, etc)
   */
  async recordPositiveFeedback(messageId, feedbackType = 'reaction') {
    try {
      const updates = feedbackType === 'reaction' 
        ? 'reactions_positive = reactions_positive + 1'
        : 'got_reply = TRUE, conversation_continued = TRUE';

      await this.pool.query(
        `UPDATE response_feedback SET ${updates},
         effectiveness_score = LEAST(effectiveness_score + 0.1, 1.0)
         WHERE message_id = $1 AND bot_id = $2`,
        [messageId, this.botId]
      );

      // Update topic engagement
      const response = await this.pool.query(
        'SELECT topic FROM response_feedback WHERE message_id = $1',
        [messageId]
      );
      if (response.rows[0]?.topic) {
        await this.updateTopicEngagement(response.rows[0].topic, true);
      }
    } catch (error) {
      console.error('[LEARNING] recordPositiveFeedback error:', error);
    }
  }

  /**
   * Record negative feedback
   */
  async recordNegativeFeedback(messageId) {
    try {
      await this.pool.query(
        `UPDATE response_feedback SET 
         reactions_negative = reactions_negative + 1,
         effectiveness_score = GREATEST(effectiveness_score - 0.15, 0)
         WHERE message_id = $1 AND bot_id = $2`,
        [messageId, this.botId]
      );

      const response = await this.pool.query(
        'SELECT topic FROM response_feedback WHERE message_id = $1',
        [messageId]
      );
      if (response.rows[0]?.topic) {
        await this.updateTopicEngagement(response.rows[0].topic, false);
      }
    } catch (error) {
      console.error('[LEARNING] recordNegativeFeedback error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOPIC LEARNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update topic engagement metrics
   */
  async updateTopicEngagement(topic, positive) {
    try {
      const positiveInc = positive ? 1 : 0;
      const negativeInc = positive ? 0 : 1;

      await this.pool.query(
        `INSERT INTO topic_engagement (bot_id, topic, engagement_count, positive_responses, negative_responses)
         VALUES ($1, $2, 1, $3, $4)
         ON CONFLICT (bot_id, topic) DO UPDATE SET
           engagement_count = topic_engagement.engagement_count + 1,
           positive_responses = topic_engagement.positive_responses + $3,
           negative_responses = topic_engagement.negative_responses + $4,
           last_engaged = NOW()`,
        [this.botId, topic, positiveInc, negativeInc]
      );

      // Update cache
      this.cache.topicEngagement.set(topic, {
        topic,
        engagement_count: (this.cache.topicEngagement.get(topic)?.engagement_count || 0) + 1,
        positive: positive
      });
    } catch (error) {
      console.error('[LEARNING] updateTopicEngagement error:', error);
    }
  }

  /**
   * Get best topics for engagement
   */
  async getBestTopics(limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT topic, engagement_count, positive_responses, negative_responses,
         (positive_responses::float / GREATEST(engagement_count, 1)) as success_rate
         FROM topic_engagement 
         WHERE bot_id = $1 AND engagement_count >= $2
         ORDER BY success_rate DESC, engagement_count DESC
         LIMIT $3`,
        [this.botId, LEARNING_CONFIG.minSampleSize, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[LEARNING] getBestTopics error:', error);
      return [];
    }
  }

  /**
   * Get topics to avoid
   */
  async getWorstTopics(limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT topic, engagement_count, positive_responses, negative_responses,
         (negative_responses::float / GREATEST(engagement_count, 1)) as failure_rate
         FROM topic_engagement 
         WHERE bot_id = $1 AND engagement_count >= $2
         ORDER BY failure_rate DESC
         LIMIT $3`,
        [this.botId, LEARNING_CONFIG.minSampleSize, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[LEARNING] getWorstTopics error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER PREFERENCE LEARNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Learn user preferences from interactions
   */
  async learnUserPreference(userId, preferenceType, value) {
    await this.initialize();
    
    const validPreferences = [
      'preferred_response_length', 'preferred_humor_level', 'preferred_formality',
      'prefers_emojis', 'prefers_questions'
    ];
    
    if (!validPreferences.includes(preferenceType)) return;

    try {
      await this.pool.query(
        `INSERT INTO user_preferences_learned (bot_id, user_id, ${preferenceType})
         VALUES ($1, $2, $3)
         ON CONFLICT (bot_id, user_id) DO UPDATE SET
           ${preferenceType} = $3,
           last_updated = NOW()`,
        [this.botId, userId, value]
      );

      // Update cache
      const cached = this.cache.userPreferences.get(userId) || {};
      cached[preferenceType] = value;
      this.cache.userPreferences.set(userId, cached);
    } catch (error) {
      console.error('[LEARNING] learnUserPreference error:', error);
    }
  }

  /**
   * Get learned user preferences
   */
  async getUserPreferences(userId) {
    // Check cache first
    if (this.cache.userPreferences.has(userId)) {
      return this.cache.userPreferences.get(userId);
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM user_preferences_learned WHERE bot_id = $1 AND user_id = $2',
        [this.botId, userId]
      );

      if (result.rows.length > 0) {
        this.cache.userPreferences.set(userId, result.rows[0]);
        return result.rows[0];
      }

      return null;
    } catch (error) {
      console.error('[LEARNING] getUserPreferences error:', error);
      return null;
    }
  }

  /**
   * Add topic to user's favorites or avoided list
   */
  async updateUserTopicPreference(userId, topic, favorite = true) {
    try {
      const column = favorite ? 'favorite_topics' : 'avoided_topics';
      await this.pool.query(
        `INSERT INTO user_preferences_learned (bot_id, user_id, ${column})
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (bot_id, user_id) DO UPDATE SET
           ${column} = user_preferences_learned.${column} || $3::jsonb`,
        [this.botId, userId, JSON.stringify([topic])]
      );
    } catch (error) {
      console.error('[LEARNING] updateUserTopicPreference error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATTERN LEARNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a successful conversation pattern
   */
  async recordSuccessfulPattern(triggerContext, successfulResponse, patternType = 'general') {
    try {
      await this.pool.query(
        `INSERT INTO conversation_patterns (bot_id, pattern_type, trigger_context, successful_response)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [this.botId, patternType, triggerContext, successfulResponse]
      );

      // Update success count if pattern exists
      await this.pool.query(
        `UPDATE conversation_patterns SET 
         success_count = success_count + 1,
         last_used = NOW()
         WHERE bot_id = $1 AND trigger_context = $2`,
        [this.botId, triggerContext]
      );
    } catch (error) {
      console.error('[LEARNING] recordSuccessfulPattern error:', error);
    }
  }

  /**
   * Record a failed pattern
   */
  async recordFailedPattern(triggerContext) {
    try {
      await this.pool.query(
        `UPDATE conversation_patterns SET failure_count = failure_count + 1
         WHERE bot_id = $1 AND trigger_context = $2`,
        [this.botId, triggerContext]
      );
    } catch (error) {
      console.error('[LEARNING] recordFailedPattern error:', error);
    }
  }

  /**
   * Get similar successful patterns for a context
   */
  async getSimilarPatterns(context, limit = 5) {
    // Simple keyword matching (could be enhanced with embeddings)
    const keywords = context.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    try {
      const patterns = [];
      for (const keyword of keywords.slice(0, 3)) {
        const result = await this.pool.query(
          `SELECT * FROM conversation_patterns 
           WHERE bot_id = $1 AND trigger_context ILIKE $2
           AND success_count > failure_count
           ORDER BY success_count DESC
           LIMIT $3`,
          [this.botId, `%${keyword}%`, limit]
        );
        patterns.push(...result.rows);
      }

      // Deduplicate and sort by success
      const unique = [...new Map(patterns.map(p => [p.id, p])).values()];
      return unique.sort((a, b) => b.success_count - a.success_count).slice(0, limit);
    } catch (error) {
      console.error('[LEARNING] getSimilarPatterns error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY PATTERN LEARNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record activity for time-based learning
   */
  async recordActivity(channelId, engagement = 0.5) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    try {
      await this.pool.query(
        `INSERT INTO activity_patterns (bot_id, channel_id, hour_of_day, day_of_week, avg_messages, avg_engagement, sample_count)
         VALUES ($1, $2, $3, $4, 1, $5, 1)
         ON CONFLICT (bot_id, channel_id, hour_of_day, day_of_week) DO UPDATE SET
           avg_messages = (activity_patterns.avg_messages * activity_patterns.sample_count + 1) / (activity_patterns.sample_count + 1),
           avg_engagement = (activity_patterns.avg_engagement * activity_patterns.sample_count + $5) / (activity_patterns.sample_count + 1),
           sample_count = activity_patterns.sample_count + 1`,
        [this.botId, channelId, hour, day, engagement]
      );
    } catch (error) {
      console.error('[LEARNING] recordActivity error:', error);
    }
  }

  /**
   * Get best times for activity
   */
  async getBestActivityTimes(channelId) {
    try {
      const result = await this.pool.query(
        `SELECT hour_of_day, day_of_week, avg_engagement, sample_count
         FROM activity_patterns 
         WHERE bot_id = $1 AND channel_id = $2 AND sample_count >= 5
         ORDER BY avg_engagement DESC
         LIMIT 10`,
        [this.botId, channelId]
      );
      return result.rows;
    } catch (error) {
      console.error('[LEARNING] getBestActivityTimes error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTATION RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get recommendations for how to respond to a user
   */
  async getResponseRecommendations(userId, topic = null) {
    const recommendations = {
      responseLength: 'medium',
      humorLevel: 0.5,
      formality: 0.5,
      useEmojis: false,
      askQuestions: true,
      suggestedTopics: [],
      avoidTopics: []
    };

    // Get user preferences
    const prefs = await this.getUserPreferences(userId);
    if (prefs) {
      if (prefs.preferred_response_length) recommendations.responseLength = prefs.preferred_response_length;
      if (prefs.preferred_humor_level) recommendations.humorLevel = prefs.preferred_humor_level;
      if (prefs.preferred_formality) recommendations.formality = prefs.preferred_formality;
      if (prefs.prefers_emojis !== null) recommendations.useEmojis = prefs.prefers_emojis;
      if (prefs.prefers_questions !== null) recommendations.askQuestions = prefs.prefers_questions;
      if (prefs.favorite_topics) recommendations.suggestedTopics = prefs.favorite_topics;
      if (prefs.avoided_topics) recommendations.avoidTopics = prefs.avoided_topics;
    }

    // Get best topics overall
    const bestTopics = await this.getBestTopics(5);
    recommendations.suggestedTopics = [
      ...recommendations.suggestedTopics,
      ...bestTopics.map(t => t.topic)
    ];

    // Get worst topics to avoid
    const worstTopics = await this.getWorstTopics(5);
    recommendations.avoidTopics = [
      ...recommendations.avoidTopics,
      ...worstTopics.map(t => t.topic)
    ];

    return recommendations;
  }

  /**
   * Build learning context for AI prompt
   */
  async buildLearningContext(userId, topic = null) {
    let context = '\n[LEARNING INSIGHTS]\n';

    const recommendations = await this.getResponseRecommendations(userId, topic);
    
    context += `Preferred response length: ${recommendations.responseLength}\n`;
    context += `Humor level: ${recommendations.humorLevel < 0.3 ? 'low' : recommendations.humorLevel > 0.7 ? 'high' : 'moderate'}\n`;
    context += `Use emojis: ${recommendations.useEmojis ? 'yes' : 'sparingly'}\n`;

    if (recommendations.suggestedTopics.length > 0) {
      context += `Topics that work well: ${recommendations.suggestedTopics.slice(0, 3).join(', ')}\n`;
    }

    if (recommendations.avoidTopics.length > 0) {
      context += `Topics to avoid: ${recommendations.avoidTopics.slice(0, 3).join(', ')}\n`;
    }

    // Add similar successful patterns
    if (topic) {
      const patterns = await this.getSimilarPatterns(topic, 2);
      if (patterns.length > 0) {
        context += '\nSuccessful approaches for similar topics:\n';
        for (const pattern of patterns) {
          context += `- ${pattern.successful_response.substring(0, 100)}...\n`;
        }
      }
    }

    context += '[END LEARNING INSIGHTS]\n';
    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  LearningSystem,
  LEARNING_CONFIG
};
