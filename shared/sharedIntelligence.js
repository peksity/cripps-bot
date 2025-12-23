/**
 * SHARED INTELLIGENCE SYSTEM
 * The Central Brain - Connects All 5 Bots
 * 
 * Features:
 * - Unified user profiles across all bots
 * - Bot-to-bot communication
 * - Collective memory and learning
 * - Cross-bot awareness
 * - Shared threat detection
 */

const { EmbedBuilder } = require('discord.js');

class SharedIntelligence {
  constructor(pool, botName) {
    this.pool = pool;
    this.botName = botName;
    this.botPersonalities = {
      lester: { name: 'Lester', role: 'mastermind', expertise: ['investigation', 'planning', 'intel'] },
      cripps: { name: 'Cripps', role: 'trader', expertise: ['trading', 'camping', 'rdo'] },
      pavel: { name: 'Pavel', role: 'heist-coordinator', expertise: ['heists', 'submarines', 'gta'] },
      madam: { name: 'Madam Nazar', role: 'mystic', expertise: ['collectibles', 'fortune', 'rdo'] },
      chief: { name: 'Police Chief', role: 'lawman', expertise: ['bounties', 'law', 'rdo'] }
    };
  }

  // ============================================
  // DATABASE INITIALIZATION
  // ============================================
  async initTables() {
    try {
      await this.pool.query(`
        -- Unified User Profiles (shared across all bots)
        CREATE TABLE IF NOT EXISTS unified_profiles (
          user_id VARCHAR(32) PRIMARY KEY,
          username VARCHAR(64),
          display_name VARCHAR(64),
          first_seen TIMESTAMP DEFAULT NOW(),
          last_seen TIMESTAMP DEFAULT NOW(),
          
          -- Behavioral metrics
          trust_score INT DEFAULT 50,
          risk_score INT DEFAULT 0,
          helpfulness_score INT DEFAULT 50,
          engagement_level INT DEFAULT 0,
          
          -- Activity stats
          total_messages INT DEFAULT 0,
          total_reactions INT DEFAULT 0,
          lfg_participations INT DEFAULT 0,
          lfg_hosted INT DEFAULT 0,
          lfg_completed INT DEFAULT 0,
          lfg_abandoned INT DEFAULT 0,
          
          -- Moderation history
          warnings_received INT DEFAULT 0,
          mutes_received INT DEFAULT 0,
          kicks_received INT DEFAULT 0,
          bans_received INT DEFAULT 0,
          appeals_submitted INT DEFAULT 0,
          appeals_won INT DEFAULT 0,
          
          -- Behavior patterns
          typical_active_hours JSONB DEFAULT '[]',
          favorite_channels JSONB DEFAULT '[]',
          frequent_contacts JSONB DEFAULT '[]',
          sentiment_history JSONB DEFAULT '[]',
          
          -- Flags
          is_trusted BOOLEAN DEFAULT FALSE,
          is_watchlist BOOLEAN DEFAULT FALSE,
          is_vip BOOLEAN DEFAULT FALSE,
          is_new_account BOOLEAN DEFAULT TRUE,
          
          -- Notes
          bot_notes JSONB DEFAULT '{}',
          mod_notes TEXT,
          
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- Bot Communication Channel
        CREATE TABLE IF NOT EXISTS bot_messages (
          id SERIAL PRIMARY KEY,
          from_bot VARCHAR(32),
          to_bot VARCHAR(32),
          message_type VARCHAR(32),
          priority INT DEFAULT 5,
          payload JSONB,
          read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_bot_messages_to ON bot_messages(to_bot, read);

        -- Shared Alerts
        CREATE TABLE IF NOT EXISTS shared_alerts (
          id SERIAL PRIMARY KEY,
          alert_type VARCHAR(32),
          severity VARCHAR(16),
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          channel_id VARCHAR(32),
          description TEXT,
          evidence JSONB,
          created_by VARCHAR(32),
          acknowledged_by JSONB DEFAULT '[]',
          resolved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_user ON shared_alerts(user_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON shared_alerts(resolved);

        -- Behavioral Events
        CREATE TABLE IF NOT EXISTS behavioral_events (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          event_type VARCHAR(32),
          severity INT DEFAULT 5,
          description TEXT,
          context JSONB,
          detected_by VARCHAR(32),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_events_user ON behavioral_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_events_type ON behavioral_events(event_type);

        -- Relationship Graph
        CREATE TABLE IF NOT EXISTS user_relationships (
          id SERIAL PRIMARY KEY,
          user_a VARCHAR(32),
          user_b VARCHAR(32),
          guild_id VARCHAR(32),
          interaction_count INT DEFAULT 1,
          positive_interactions INT DEFAULT 0,
          negative_interactions INT DEFAULT 0,
          relationship_type VARCHAR(32) DEFAULT 'neutral',
          last_interaction TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_a, user_b, guild_id)
        );
        CREATE INDEX IF NOT EXISTS idx_relationships_user ON user_relationships(user_a);

        -- Collective Learning
        CREATE TABLE IF NOT EXISTS learned_patterns (
          id SERIAL PRIMARY KEY,
          pattern_type VARCHAR(32),
          pattern_data JSONB,
          confidence FLOAT DEFAULT 0.5,
          occurrences INT DEFAULT 1,
          last_seen TIMESTAMP DEFAULT NOW(),
          learned_by VARCHAR(32),
          validated BOOLEAN DEFAULT FALSE
        );
      `);
      
      console.log(`[${this.botName}] 🧠 Shared Intelligence tables ready`);
    } catch (error) {
      console.error(`[${this.botName}] Intelligence init error:`, error);
    }
  }

  // ============================================
  // USER PROFILE MANAGEMENT
  // ============================================
  async getOrCreateProfile(userId, username = null) {
    try {
      let result = await this.pool.query(
        'SELECT * FROM unified_profiles WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        result = await this.pool.query(`
          INSERT INTO unified_profiles (user_id, username, is_new_account)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW()
          RETURNING *
        `, [userId, username || 'Unknown']);
      } else {
        // Update last seen
        await this.pool.query(
          'UPDATE unified_profiles SET last_seen = NOW(), username = COALESCE($2, username) WHERE user_id = $1',
          [userId, username]
        );
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Profile error:', error);
      return null;
    }
  }

  async updateProfile(userId, updates) {
    try {
      const setClauses = [];
      const values = [userId];
      let paramCount = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        paramCount++;
        setClauses.push(`${key} = $${paramCount}`);
        values.push(value);
      }
      
      if (setClauses.length > 0) {
        setClauses.push('updated_at = NOW()');
        await this.pool.query(
          `UPDATE unified_profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
          values
        );
      }
    } catch (error) {
      console.error('Update profile error:', error);
    }
  }

  async incrementStat(userId, stat, amount = 1) {
    try {
      await this.pool.query(
        `UPDATE unified_profiles SET ${stat} = ${stat} + $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, amount]
      );
    } catch (error) {
      console.error('Increment stat error:', error);
    }
  }

  // ============================================
  // TRUST & RISK SCORING
  // ============================================
  async calculateTrustScore(userId) {
    const profile = await this.getOrCreateProfile(userId);
    if (!profile) return 50;
    
    let score = 50; // Start neutral
    
    // Positive factors
    score += Math.min(profile.total_messages / 100, 10); // Up to +10 for activity
    score += Math.min(profile.lfg_completed * 2, 15); // Up to +15 for completed LFGs
    score += profile.lfg_hosted * 3; // +3 per hosted LFG
    score += profile.appeals_won * 5; // +5 for successful appeals
    
    // Account age bonus
    const daysSinceJoin = (Date.now() - new Date(profile.first_seen).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.min(daysSinceJoin / 7, 10); // Up to +10 for account age
    
    // Negative factors
    score -= profile.warnings_received * 5;
    score -= profile.mutes_received * 10;
    score -= profile.kicks_received * 15;
    score -= profile.bans_received * 25;
    score -= profile.lfg_abandoned * 3;
    
    // Clamp between 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    await this.updateProfile(userId, { trust_score: score });
    return score;
  }

  async calculateRiskScore(userId, guildId) {
    try {
      const profile = await this.getOrCreateProfile(userId);
      if (!profile) return 0;
      
      let risk = 0;
      
      // Recent violations
      const recentViolations = await this.pool.query(`
        SELECT COUNT(*) FROM behavioral_events 
        WHERE user_id = $1 AND event_type IN ('rule_violation', 'toxic_message', 'spam')
        AND created_at > NOW() - INTERVAL '7 days'
      `, [userId]);
      risk += parseInt(recentViolations.rows[0].count) * 10;
      
      // Deleted message ratio
      const messageStats = await this.pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE deleted = TRUE) as deleted,
          COUNT(*) as total
        FROM message_log WHERE author_id = $1 AND guild_id = $2
      `, [userId, guildId]);
      
      if (messageStats.rows[0].total > 10) {
        const deleteRatio = messageStats.rows[0].deleted / messageStats.rows[0].total;
        if (deleteRatio > 0.3) risk += 20; // High delete ratio
        else if (deleteRatio > 0.15) risk += 10;
      }
      
      // Negative interactions
      const negativeInteractions = await this.pool.query(`
        SELECT SUM(negative_interactions) as total FROM user_relationships 
        WHERE (user_a = $1 OR user_b = $1) AND guild_id = $2
      `, [userId, guildId]);
      risk += Math.min((parseInt(negativeInteractions.rows[0]?.total) || 0) * 2, 20);
      
      // Moderation history impact
      risk += profile.warnings_received * 3;
      risk += profile.bans_received * 15;
      
      // New account penalty
      const daysSinceJoin = (Date.now() - new Date(profile.first_seen).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceJoin < 7) risk += 15;
      else if (daysSinceJoin < 30) risk += 5;
      
      risk = Math.max(0, Math.min(100, Math.round(risk)));
      await this.updateProfile(userId, { risk_score: risk });
      
      return risk;
    } catch (error) {
      console.error('Risk calculation error:', error);
      return 0;
    }
  }

  // ============================================
  // BOT-TO-BOT COMMUNICATION
  // ============================================
  async sendBotMessage(toBot, messageType, payload, priority = 5) {
    try {
      await this.pool.query(`
        INSERT INTO bot_messages (from_bot, to_bot, message_type, priority, payload)
        VALUES ($1, $2, $3, $4, $5)
      `, [this.botName, toBot, messageType, priority, JSON.stringify(payload)]);
    } catch (error) {
      console.error('Send bot message error:', error);
    }
  }

  async broadcastToBots(messageType, payload, priority = 5) {
    const bots = ['lester', 'cripps', 'pavel', 'madam', 'chief'];
    for (const bot of bots) {
      if (bot !== this.botName) {
        await this.sendBotMessage(bot, messageType, payload, priority);
      }
    }
  }

  async getMessages() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM bot_messages 
        WHERE to_bot = $1 AND read = FALSE
        ORDER BY priority DESC, created_at ASC
      `, [this.botName]);
      
      // Mark as read
      if (result.rows.length > 0) {
        await this.pool.query(
          'UPDATE bot_messages SET read = TRUE WHERE to_bot = $1 AND read = FALSE',
          [this.botName]
        );
      }
      
      return result.rows;
    } catch (error) {
      console.error('Get bot messages error:', error);
      return [];
    }
  }

  // ============================================
  // SHARED ALERTS
  // ============================================
  async createAlert(alertType, severity, userId, guildId, description, evidence = {}) {
    try {
      const result = await this.pool.query(`
        INSERT INTO shared_alerts (alert_type, severity, user_id, guild_id, description, evidence, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [alertType, severity, userId, guildId, description, JSON.stringify(evidence), this.botName]);
      
      // Broadcast to other bots
      await this.broadcastToBots('alert', {
        alertId: result.rows[0].id,
        alertType,
        severity,
        userId,
        description
      }, severity === 'critical' ? 10 : 5);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Create alert error:', error);
      return null;
    }
  }

  async getActiveAlerts(guildId = null) {
    try {
      let query = 'SELECT * FROM shared_alerts WHERE resolved = FALSE';
      const params = [];
      
      if (guildId) {
        query += ' AND guild_id = $1';
        params.push(guildId);
      }
      
      query += ' ORDER BY created_at DESC LIMIT 50';
      
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Get alerts error:', error);
      return [];
    }
  }

  async acknowledgeAlert(alertId) {
    try {
      await this.pool.query(`
        UPDATE shared_alerts 
        SET acknowledged_by = acknowledged_by || $2::jsonb
        WHERE id = $1
      `, [alertId, JSON.stringify([this.botName])]);
    } catch (error) {
      console.error('Acknowledge alert error:', error);
    }
  }

  // ============================================
  // BEHAVIORAL TRACKING
  // ============================================
  async recordEvent(userId, guildId, eventType, severity, description, context = {}) {
    try {
      await this.pool.query(`
        INSERT INTO behavioral_events (user_id, guild_id, event_type, severity, description, context, detected_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, guildId, eventType, severity, description, JSON.stringify(context), this.botName]);
      
      // High severity events get broadcast
      if (severity >= 7) {
        await this.broadcastToBots('high_severity_event', {
          userId,
          guildId,
          eventType,
          severity,
          description
        }, 8);
      }
    } catch (error) {
      console.error('Record event error:', error);
    }
  }

  async getUserEvents(userId, limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM behavioral_events 
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Get events error:', error);
      return [];
    }
  }

  // ============================================
  // RELATIONSHIP MAPPING
  // ============================================
  async recordInteraction(userA, userB, guildId, isPositive = true) {
    if (userA === userB) return;
    
    // Always store in consistent order
    const [first, second] = userA < userB ? [userA, userB] : [userB, userA];
    
    try {
      await this.pool.query(`
        INSERT INTO user_relationships (user_a, user_b, guild_id, positive_interactions, negative_interactions)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_a, user_b, guild_id) DO UPDATE SET
          interaction_count = user_relationships.interaction_count + 1,
          positive_interactions = user_relationships.positive_interactions + $4,
          negative_interactions = user_relationships.negative_interactions + $5,
          last_interaction = NOW()
      `, [first, second, guildId, isPositive ? 1 : 0, isPositive ? 0 : 1]);
    } catch (error) {
      console.error('Record interaction error:', error);
    }
  }

  async getUserNetwork(userId, guildId) {
    try {
      const result = await this.pool.query(`
        SELECT 
          CASE WHEN user_a = $1 THEN user_b ELSE user_a END as connected_user,
          interaction_count,
          positive_interactions,
          negative_interactions,
          relationship_type
        FROM user_relationships
        WHERE (user_a = $1 OR user_b = $1) AND guild_id = $2
        ORDER BY interaction_count DESC
        LIMIT 20
      `, [userId, guildId]);
      return result.rows;
    } catch (error) {
      console.error('Get network error:', error);
      return [];
    }
  }

  // ============================================
  // COLLECTIVE LEARNING
  // ============================================
  async learnPattern(patternType, patternData, confidence = 0.5) {
    try {
      await this.pool.query(`
        INSERT INTO learned_patterns (pattern_type, pattern_data, confidence, learned_by)
        VALUES ($1, $2, $3, $4)
      `, [patternType, JSON.stringify(patternData), confidence, this.botName]);
    } catch (error) {
      console.error('Learn pattern error:', error);
    }
  }

  async getPatterns(patternType) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM learned_patterns 
        WHERE pattern_type = $1 AND confidence > 0.3
        ORDER BY confidence DESC, occurrences DESC
        LIMIT 20
      `, [patternType]);
      return result.rows;
    } catch (error) {
      console.error('Get patterns error:', error);
      return [];
    }
  }

  // ============================================
  // BOT SELF-AWARENESS
  // ============================================
  getCapabilities() {
    const baseCapabilities = {
      lester: {
        intro: "I'm the guy who knows everything that happens in this server. Every message, every deletion, every pattern - I see it all.",
        abilities: [
          "Track and analyze every message in the server",
          "Detect rule violations before mods even notice",
          "Build complete profiles on users - their behavior, patterns, who they talk to",
          "Reconstruct deleted messages and edited content",
          "Run full investigations with AI analysis",
          "Handle appeals and modmail",
          "Predict problematic behavior before it happens"
        ],
        personality: "paranoid mastermind who sees everything"
      },
      cripps: {
        intro: "I handle the trading side of things around here. Need a wagon? Delivery crew? I'm your man.",
        abilities: [
          "Organize trading deliveries and sales",
          "Set up camp crews for grinding",
          "Track trader statistics and earnings",
          "Remember what you like to trade"
        ],
        personality: "grumpy old trader who gets the job done"
      },
      pavel: {
        intro: "Kapitan! I coordinate all heist operations. Submarine, Cayo, everything profitable.",
        abilities: [
          "Set up heist crews for Cayo Perico",
          "Coordinate casino and other heists",
          "Track heist completions and earnings",
          "Remember your preferred setups"
        ],
        personality: "enthusiastic Russian submarine captain"
      },
      madam: {
        intro: "I see things others cannot... the collectibles, the paths, and sometimes... the future.",
        abilities: [
          "Guide collectors to daily items",
          "Provide fortune readings",
          "Track collection progress",
          "Know the cycles and locations"
        ],
        personality: "mysterious fortune teller with real insight"
      },
      chief: {
        intro: "I'm the law around here. Bounty hunting, justice, keeping order.",
        abilities: [
          "Organize bounty hunting posses",
          "Track legendary bounty completions",
          "Coordinate law enforcement activities",
          "Know every outlaw and their story"
        ],
        personality: "gruff lawman who's seen it all"
      }
    };
    
    return baseCapabilities[this.botName] || baseCapabilities.lester;
  }

  async describeMyself(context = 'general') {
    const caps = this.getCapabilities();
    const profile = await this.getStats();
    
    // Natural self-description based on context
    const descriptions = {
      general: `${caps.intro}`,
      investigation: `I've logged ${profile.totalMessages || 'thousands of'} messages in this server. I know who deletes what, who talks to whom, and when someone's behavior starts shifting. Nothing gets past me.`,
      help: `Here's what I actually do: ${caps.abilities.slice(0, 3).join('. ')}. And more, but I don't like listing everything out like some instruction manual.`,
      capabilities: caps.abilities
    };
    
    return descriptions[context] || descriptions.general;
  }

  async getStats() {
    try {
      const stats = await this.pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM message_log) as total_messages,
          (SELECT COUNT(*) FROM unified_profiles) as tracked_users,
          (SELECT COUNT(*) FROM shared_alerts WHERE resolved = FALSE) as active_alerts,
          (SELECT COUNT(*) FROM behavioral_events WHERE created_at > NOW() - INTERVAL '24 hours') as events_24h
      `);
      return stats.rows[0];
    } catch (error) {
      return {};
    }
  }
}

module.exports = SharedIntelligence;
