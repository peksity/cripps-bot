/**
 * ██████╗ ██████╗ ██╗   ██╗██████╗  ██████╗ ███████╗███████╗
 * ██╔════╝ ██╔══██╗██║   ██║██╔══██╗██╔════╝ ██╔════╝██╔════╝
 * ██║  ███╗██████╔╝██║   ██║██║  ██║██║  ███╗█████╗  ███████╗
 * ██║   ██║██╔══██╗██║   ██║██║  ██║██║   ██║██╔══╝  ╚════██║
 * ╚██████╔╝██║  ██║╚██████╔╝██████╔╝╚██████╔╝███████╗███████║
 *  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
 * 
 * GRUDGE & RELATIONSHIP SYSTEM
 * 
 * Bots form REAL relationships with users:
 * - Favorites (people they like)
 * - Grudges (people they have beef with)
 * - Inside jokes (shared humor)
 * - Respect levels (earned through actions)
 */

class GrudgeSystem {
  constructor(pool) {
    this.pool = pool;
    this.cache = new Map();
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bot_relationships (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          
          -- Relationship type
          relationship_type VARCHAR(50) DEFAULT 'neutral',
          
          -- Scores (-100 to 100)
          fondness INT DEFAULT 0,
          respect INT DEFAULT 0,
          trust INT DEFAULT 0,
          annoyance INT DEFAULT 0,
          
          -- Flags
          is_favorite BOOLEAN DEFAULT FALSE,
          has_grudge BOOLEAN DEFAULT FALSE,
          is_enemy BOOLEAN DEFAULT FALSE,
          is_friend BOOLEAN DEFAULT FALSE,
          
          -- Details
          grudge_reason TEXT,
          grudge_severity INT DEFAULT 0,
          grudge_started TIMESTAMP,
          
          favorite_reason TEXT,
          
          -- Inside jokes (JSON array)
          inside_jokes TEXT DEFAULT '[]',
          
          -- Nicknames the bot has for this user
          nicknames TEXT DEFAULT '[]',
          
          -- Notable moments
          notable_moments TEXT DEFAULT '[]',
          
          -- Stats
          total_interactions INT DEFAULT 0,
          positive_interactions INT DEFAULT 0,
          negative_interactions INT DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE(bot_id, user_id)
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS relationship_events (
          id SERIAL PRIMARY KEY,
          bot_id VARCHAR(50),
          user_id VARCHAR(50),
          event_type VARCHAR(50),
          details TEXT,
          impact INT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[GRUDGES] ✅ Database initialized');
    } catch (e) {
      console.error('[GRUDGES] Init error:', e.message);
    }
  }

  /**
   * Get relationship between bot and user
   */
  async getRelationship(botId, userId) {
    const cacheKey = `${botId}_${userId}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 30000) {
        return cached.data;
      }
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM bot_relationships WHERE bot_id = $1 AND user_id = $2',
        [botId, userId]
      );

      if (result.rows.length === 0) {
        return {
          exists: false,
          fondness: 0,
          respect: 0,
          trust: 0,
          annoyance: 0,
          hasGrudge: false,
          isFavorite: false,
          insideJokes: [],
          type: 'stranger'
        };
      }

      const row = result.rows[0];
      const rel = {
        exists: true,
        fondness: row.fondness,
        respect: row.respect,
        trust: row.trust,
        annoyance: row.annoyance,
        hasGrudge: row.has_grudge,
        grudgeReason: row.grudge_reason,
        grudgeSeverity: row.grudge_severity,
        isFavorite: row.is_favorite,
        favoriteReason: row.favorite_reason,
        isEnemy: row.is_enemy,
        isFriend: row.is_friend,
        insideJokes: JSON.parse(row.inside_jokes || '[]'),
        nicknames: JSON.parse(row.nicknames || '[]'),
        notableMoments: JSON.parse(row.notable_moments || '[]'),
        totalInteractions: row.total_interactions,
        type: this.getRelationshipType(row)
      };

      this.cache.set(cacheKey, { data: rel, timestamp: Date.now() });
      return rel;
    } catch (e) {
      console.error('[GRUDGES] Get error:', e.message);
      return { exists: false, type: 'stranger' };
    }
  }

  /**
   * Determine relationship type from scores
   */
  getRelationshipType(row) {
    if (row.is_enemy) return 'enemy';
    if (row.is_friend) return 'friend';
    if (row.is_favorite) return 'favorite';
    if (row.has_grudge) return 'grudge';
    if (row.fondness > 50) return 'liked';
    if (row.fondness < -50) return 'disliked';
    if (row.annoyance > 50) return 'annoyed_by';
    if (row.respect > 50) return 'respected';
    if (row.total_interactions > 20) return 'acquaintance';
    return 'stranger';
  }

  /**
   * Create or update relationship
   */
  async updateRelationship(botId, userId, updates) {
    try {
      // Ensure row exists
      await this.pool.query(`
        INSERT INTO bot_relationships (bot_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (bot_id, user_id) DO NOTHING
      `, [botId, userId]);

      // Build update query
      const sets = [];
      const values = [botId, userId];
      let idx = 3;

      for (const [key, value] of Object.entries(updates)) {
        if (['fondness', 'respect', 'trust', 'annoyance'].includes(key)) {
          sets.push(`${key} = GREATEST(-100, LEAST(100, ${key} + $${idx}))`);
        } else {
          sets.push(`${key} = $${idx}`);
        }
        values.push(value);
        idx++;
      }

      sets.push('updated_at = CURRENT_TIMESTAMP');
      sets.push('total_interactions = total_interactions + 1');

      await this.pool.query(`
        UPDATE bot_relationships 
        SET ${sets.join(', ')}
        WHERE bot_id = $1 AND user_id = $2
      `, values);

      // Invalidate cache
      this.cache.delete(`${botId}_${userId}`);
    } catch (e) {
      console.error('[GRUDGES] Update error:', e.message);
    }
  }

  /**
   * Create a grudge
   */
  async createGrudge(botId, userId, reason, severity = 50) {
    try {
      await this.pool.query(`
        INSERT INTO bot_relationships (bot_id, user_id, has_grudge, grudge_reason, grudge_severity, grudge_started)
        VALUES ($1, $2, TRUE, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET
          has_grudge = TRUE,
          grudge_reason = $3,
          grudge_severity = $4,
          grudge_started = CURRENT_TIMESTAMP,
          annoyance = bot_relationships.annoyance + 30
      `, [botId, userId, reason, severity]);

      // Record event
      await this.recordEvent(botId, userId, 'grudge_formed', reason, -severity);

      this.cache.delete(`${botId}_${userId}`);
      console.log(`[GRUDGES] ${botId} now has grudge against ${userId}: ${reason}`);
    } catch (e) {
      console.error('[GRUDGES] Create grudge error:', e.message);
    }
  }

  /**
   * Forgive grudge (rare)
   */
  async forgiveGrudge(botId, userId) {
    try {
      await this.pool.query(`
        UPDATE bot_relationships 
        SET has_grudge = FALSE, grudge_reason = NULL, grudge_severity = 0,
            annoyance = GREATEST(0, annoyance - 20)
        WHERE bot_id = $1 AND user_id = $2
      `, [botId, userId]);

      await this.recordEvent(botId, userId, 'grudge_forgiven', 'Forgave the grudge', 20);
      this.cache.delete(`${botId}_${userId}`);
    } catch (e) {
      console.error('[GRUDGES] Forgive error:', e.message);
    }
  }

  /**
   * Mark as favorite
   */
  async markFavorite(botId, userId, reason) {
    try {
      await this.pool.query(`
        INSERT INTO bot_relationships (bot_id, user_id, is_favorite, favorite_reason, fondness)
        VALUES ($1, $2, TRUE, $3, 50)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET
          is_favorite = TRUE,
          favorite_reason = $3,
          fondness = LEAST(100, bot_relationships.fondness + 20)
      `, [botId, userId, reason]);

      await this.recordEvent(botId, userId, 'marked_favorite', reason, 50);
      this.cache.delete(`${botId}_${userId}`);
    } catch (e) {
      console.error('[GRUDGES] Favorite error:', e.message);
    }
  }

  /**
   * Add inside joke
   */
  async addInsideJoke(botId, userId, joke) {
    try {
      const result = await this.pool.query(
        'SELECT inside_jokes FROM bot_relationships WHERE bot_id = $1 AND user_id = $2',
        [botId, userId]
      );

      let jokes = [];
      if (result.rows.length > 0) {
        jokes = JSON.parse(result.rows[0].inside_jokes || '[]');
      }

      jokes.push({
        joke,
        created: Date.now()
      });

      // Keep last 10
      jokes = jokes.slice(-10);

      await this.pool.query(`
        INSERT INTO bot_relationships (bot_id, user_id, inside_jokes)
        VALUES ($1, $2, $3)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET
          inside_jokes = $3,
          fondness = LEAST(100, bot_relationships.fondness + 5)
      `, [botId, userId, JSON.stringify(jokes)]);

      this.cache.delete(`${botId}_${userId}`);
    } catch (e) {
      console.error('[GRUDGES] Inside joke error:', e.message);
    }
  }

  /**
   * Get random inside joke
   */
  async getRandomInsideJoke(botId, userId) {
    const rel = await this.getRelationship(botId, userId);
    if (rel.insideJokes.length === 0) return null;
    return rel.insideJokes[Math.floor(Math.random() * rel.insideJokes.length)];
  }

  /**
   * Add notable moment
   */
  async addNotableMoment(botId, userId, moment) {
    try {
      const result = await this.pool.query(
        'SELECT notable_moments FROM bot_relationships WHERE bot_id = $1 AND user_id = $2',
        [botId, userId]
      );

      let moments = [];
      if (result.rows.length > 0) {
        moments = JSON.parse(result.rows[0].notable_moments || '[]');
      }

      moments.push({
        moment,
        timestamp: Date.now()
      });

      moments = moments.slice(-20);

      await this.pool.query(`
        INSERT INTO bot_relationships (bot_id, user_id, notable_moments)
        VALUES ($1, $2, $3)
        ON CONFLICT (bot_id, user_id) DO UPDATE SET notable_moments = $3
      `, [botId, userId, JSON.stringify(moments)]);

      this.cache.delete(`${botId}_${userId}`);
    } catch (e) {
      console.error('[GRUDGES] Notable moment error:', e.message);
    }
  }

  /**
   * Record relationship event
   */
  async recordEvent(botId, userId, eventType, details, impact) {
    try {
      await this.pool.query(`
        INSERT INTO relationship_events (bot_id, user_id, event_type, details, impact)
        VALUES ($1, $2, $3, $4, $5)
      `, [botId, userId, eventType, details, impact]);
    } catch (e) {
      console.error('[GRUDGES] Event error:', e.message);
    }
  }

  /**
   * Get all grudges for a bot
   */
  async getAllGrudges(botId) {
    try {
      const result = await this.pool.query(`
        SELECT user_id, grudge_reason, grudge_severity, grudge_started
        FROM bot_relationships
        WHERE bot_id = $1 AND has_grudge = TRUE
        ORDER BY grudge_severity DESC
      `, [botId]);
      return result.rows;
    } catch (e) {
      return [];
    }
  }

  /**
   * Get all favorites for a bot
   */
  async getAllFavorites(botId) {
    try {
      const result = await this.pool.query(`
        SELECT user_id, favorite_reason, fondness
        FROM bot_relationships
        WHERE bot_id = $1 AND is_favorite = TRUE
        ORDER BY fondness DESC
      `, [botId]);
      return result.rows;
    } catch (e) {
      return [];
    }
  }

  /**
   * Build context for AI prompt
   */
  async buildRelationshipContext(botId, userId) {
    const rel = await this.getRelationship(botId, userId);
    
    if (!rel.exists) {
      return '[RELATIONSHIP: Stranger - no history]';
    }

    let context = `[RELATIONSHIP: ${rel.type}]`;
    context += `\n- Fondness: ${rel.fondness}/100`;
    context += `\n- Annoyance: ${rel.annoyance}/100`;
    context += `\n- Interactions: ${rel.totalInteractions}`;

    if (rel.hasGrudge) {
      context += `\n- GRUDGE: "${rel.grudgeReason}" (severity: ${rel.grudgeSeverity})`;
      context += `\n- Be cold, bring up the grudge, don't let it go easily`;
    }

    if (rel.isFavorite) {
      context += `\n- FAVORITE: "${rel.favoriteReason}"`;
      context += `\n- Be warmer than usual, have their back`;
    }

    if (rel.insideJokes.length > 0) {
      const joke = rel.insideJokes[Math.floor(Math.random() * rel.insideJokes.length)];
      context += `\n- INSIDE JOKE: "${joke.joke}" (can reference this)`;
    }

    if (rel.notableMoments.length > 0) {
      const moment = rel.notableMoments[Math.floor(Math.random() * rel.notableMoments.length)];
      context += `\n- MEMORY: "${moment.moment}"`;
    }

    return context;
  }
}

module.exports = { GrudgeSystem };
