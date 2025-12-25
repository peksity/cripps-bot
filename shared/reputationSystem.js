/**
 * ██████╗ ███████╗██████╗ ██╗   ██╗████████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗
 * ██╔══██╗██╔════╝██╔══██╗██║   ██║╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
 * ██████╔╝█████╗  ██████╔╝██║   ██║   ██║   ███████║   ██║   ██║██║   ██║██╔██╗ ██║
 * ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║   ██║   ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║
 * ██║  ██║███████╗██║     ╚██████╔╝   ██║   ██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║
 * ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝    ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
 * 
 * REPUTATION SYSTEM
 * 
 * Tracks every user's reputation across the server
 * - LFG reliability (shows up? completes? abandons?)
 * - Social standing (helpful? toxic? quiet?)
 * - Bot interactions (respectful? annoying? funny?)
 * - Affects how bots treat them
 */

class ReputationSystem {
  constructor(pool) {
    this.pool = pool;
    this.cache = new Map();
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_reputation (
          user_id VARCHAR(50) PRIMARY KEY,
          username VARCHAR(100),
          
          -- Core score (0-100, starts at 50)
          score INT DEFAULT 50,
          
          -- Component scores
          reliability INT DEFAULT 50,
          helpfulness INT DEFAULT 50,
          toxicity INT DEFAULT 0,
          humor INT DEFAULT 50,
          activity INT DEFAULT 50,
          
          -- LFG specific
          lfg_hosted INT DEFAULT 0,
          lfg_completed INT DEFAULT 0,
          lfg_abandoned INT DEFAULT 0,
          lfg_no_shows INT DEFAULT 0,
          lfg_kicked_others INT DEFAULT 0,
          lfg_got_kicked INT DEFAULT 0,
          
          -- Social
          helped_others INT DEFAULT 0,
          got_helped INT DEFAULT 0,
          warnings_received INT DEFAULT 0,
          timeouts_received INT DEFAULT 0,
          
          -- Flags
          is_favorite BOOLEAN DEFAULT FALSE,
          is_blacklisted BOOLEAN DEFAULT FALSE,
          is_vip BOOLEAN DEFAULT FALSE,
          is_trusted BOOLEAN DEFAULT FALSE,
          
          -- Timestamps
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_lfg TIMESTAMP,
          
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS reputation_history (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(50),
          change_amount INT,
          reason VARCHAR(255),
          source VARCHAR(50),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[REPUTATION] ✅ Database initialized');
    } catch (e) {
      console.error('[REPUTATION] Init error:', e.message);
    }
  }

  /**
   * Get user's reputation
   */
  async getReputation(userId) {
    // Check cache
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId);
      if (Date.now() - cached.timestamp < 60000) {
        return cached.data;
      }
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM user_reputation WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // New user
        return {
          score: 50,
          label: 'Unknown',
          reliability: 50,
          isBlacklisted: false,
          isFavorite: false,
          isNew: true
        };
      }

      const row = result.rows[0];
      const rep = {
        score: row.score,
        label: this.getLabel(row.score),
        reliability: row.reliability,
        helpfulness: row.helpfulness,
        toxicity: row.toxicity,
        isBlacklisted: row.is_blacklisted,
        isFavorite: row.is_favorite,
        isVIP: row.is_vip,
        isTrusted: row.is_trusted,
        lfgStats: {
          hosted: row.lfg_hosted,
          completed: row.lfg_completed,
          abandoned: row.lfg_abandoned,
          noShows: row.lfg_no_shows
        },
        isNew: false
      };

      // Cache it
      this.cache.set(userId, { data: rep, timestamp: Date.now() });
      
      return rep;
    } catch (e) {
      console.error('[REPUTATION] Get error:', e.message);
      return { score: 50, label: 'Unknown', isNew: true };
    }
  }

  /**
   * Get label for score
   */
  getLabel(score) {
    if (score >= 90) return 'Legend';
    if (score >= 75) return 'Trusted';
    if (score >= 60) return 'Reliable';
    if (score >= 40) return 'Neutral';
    if (score >= 25) return 'Sketchy';
    if (score >= 10) return 'Problematic';
    return 'Blacklisted';
  }

  /**
   * Modify reputation
   */
  async modifyReputation(userId, amount, reason, source = 'system') {
    try {
      // Ensure user exists
      await this.pool.query(`
        INSERT INTO user_reputation (user_id, score)
        VALUES ($1, 50)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);

      // Update score
      await this.pool.query(`
        UPDATE user_reputation 
        SET score = GREATEST(0, LEAST(100, score + $1)),
            updated_at = CURRENT_TIMESTAMP,
            last_seen = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [amount, userId]);

      // Record history
      await this.pool.query(`
        INSERT INTO reputation_history (user_id, change_amount, reason, source)
        VALUES ($1, $2, $3, $4)
      `, [userId, amount, reason, source]);

      // Invalidate cache
      this.cache.delete(userId);

      console.log(`[REPUTATION] ${userId}: ${amount > 0 ? '+' : ''}${amount} (${reason})`);
    } catch (e) {
      console.error('[REPUTATION] Modify error:', e.message);
    }
  }

  /**
   * Record LFG event
   */
  async recordLFGEvent(userId, event) {
    const changes = {
      'hosted': { field: 'lfg_hosted', rep: 2 },
      'completed': { field: 'lfg_completed', rep: 5 },
      'abandoned': { field: 'lfg_abandoned', rep: -15 },
      'no_show': { field: 'lfg_no_shows', rep: -20 },
      'kicked': { field: 'lfg_got_kicked', rep: -10 },
      'kicked_someone': { field: 'lfg_kicked_others', rep: 0 }
    };

    const change = changes[event];
    if (!change) return;

    try {
      await this.pool.query(`
        UPDATE user_reputation 
        SET ${change.field} = ${change.field} + 1,
            score = GREATEST(0, LEAST(100, score + $1)),
            last_lfg = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [change.rep, userId]);

      // Also update reliability specifically
      if (event === 'completed') {
        await this.pool.query(`
          UPDATE user_reputation SET reliability = LEAST(100, reliability + 3) WHERE user_id = $1
        `, [userId]);
      } else if (event === 'abandoned' || event === 'no_show') {
        await this.pool.query(`
          UPDATE user_reputation SET reliability = GREATEST(0, reliability - 10) WHERE user_id = $1
        `, [userId]);
      }

      this.cache.delete(userId);
    } catch (e) {
      console.error('[REPUTATION] LFG event error:', e.message);
    }
  }

  /**
   * Blacklist user
   */
  async blacklist(userId, reason) {
    try {
      await this.pool.query(`
        UPDATE user_reputation 
        SET is_blacklisted = TRUE, score = 0
        WHERE user_id = $1
      `, [userId]);

      await this.modifyReputation(userId, -100, `Blacklisted: ${reason}`, 'mod');
      this.cache.delete(userId);
    } catch (e) {
      console.error('[REPUTATION] Blacklist error:', e.message);
    }
  }

  /**
   * Mark as favorite
   */
  async markFavorite(userId) {
    try {
      await this.pool.query(`
        UPDATE user_reputation SET is_favorite = TRUE WHERE user_id = $1
      `, [userId]);
      this.cache.delete(userId);
    } catch (e) {
      console.error('[REPUTATION] Favorite error:', e.message);
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT user_id, username, score, reliability, lfg_completed
        FROM user_reputation
        WHERE is_blacklisted = FALSE
        ORDER BY score DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (e) {
      console.error('[REPUTATION] Leaderboard error:', e.message);
      return [];
    }
  }

  /**
   * Get user's reputation history
   */
  async getHistory(userId, limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM reputation_history
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `, [userId, limit]);
      return result.rows;
    } catch (e) {
      return [];
    }
  }

  /**
   * Daily decay (call once per day)
   * Slowly brings extreme scores toward neutral
   */
  async dailyDecay() {
    try {
      // High scores decay slightly
      await this.pool.query(`
        UPDATE user_reputation 
        SET score = score - 1
        WHERE score > 60 AND last_seen < NOW() - INTERVAL '7 days'
      `);

      // Low scores recover slightly
      await this.pool.query(`
        UPDATE user_reputation 
        SET score = score + 1
        WHERE score < 40 AND score > 10 AND last_seen < NOW() - INTERVAL '30 days'
      `);

      console.log('[REPUTATION] Daily decay complete');
    } catch (e) {
      console.error('[REPUTATION] Decay error:', e.message);
    }
  }
}

module.exports = { ReputationSystem };
