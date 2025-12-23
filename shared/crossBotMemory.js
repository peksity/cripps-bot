/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CROSS-BOT MEMORY SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This system allows bots to SHARE information with each other.
 * 
 * Features:
 * - Shared knowledge pool (all bots can access)
 * - Bot-to-bot gossip (private messages between bots)
 * - Reputation sharing ("Pavel says this user is trustworthy")
 * - Event broadcasting (one bot tells others about something)
 * - Alliance system (bots can form alliances)
 * - Conspiracy theories (bots develop theories together)
 * - Collective opinions (group consensus on users)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- Shared knowledge between bots
CREATE TABLE IF NOT EXISTS shared_knowledge (
  id SERIAL PRIMARY KEY,
  knowledge_type VARCHAR(64) NOT NULL,
  subject_type VARCHAR(32),
  subject_id VARCHAR(32),
  content TEXT NOT NULL,
  source_bot VARCHAR(32),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  importance INT DEFAULT 5,
  verified_by JSONB DEFAULT '[]'
);

-- Bot-to-bot messages (gossip)
CREATE TABLE IF NOT EXISTS bot_gossip (
  id SERIAL PRIMARY KEY,
  from_bot VARCHAR(32) NOT NULL,
  to_bot VARCHAR(32),
  about_user VARCHAR(32),
  gossip_type VARCHAR(32),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  read_by JSONB DEFAULT '[]',
  reactions JSONB DEFAULT '{}'
);

-- Bot alliances
CREATE TABLE IF NOT EXISTS bot_alliances (
  id SERIAL PRIMARY KEY,
  bot1 VARCHAR(32) NOT NULL,
  bot2 VARCHAR(32) NOT NULL,
  alliance_type VARCHAR(32) DEFAULT 'friendly',
  strength INT DEFAULT 50,
  formed_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  UNIQUE(bot1, bot2)
);

-- Collective user opinions
CREATE TABLE IF NOT EXISTS collective_opinions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  opinion_type VARCHAR(32),
  positive_votes INT DEFAULT 0,
  negative_votes INT DEFAULT 0,
  neutral_votes INT DEFAULT 0,
  voters JSONB DEFAULT '[]',
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, opinion_type)
);

-- Bot conspiracy theories
CREATE TABLE IF NOT EXISTS bot_theories (
  id SERIAL PRIMARY KEY,
  theory TEXT NOT NULL,
  proposed_by VARCHAR(32),
  supporters JSONB DEFAULT '[]',
  evidence JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(32) DEFAULT 'active'
);

-- Events broadcast between bots
CREATE TABLE IF NOT EXISTS bot_broadcasts (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  source_bot VARCHAR(32),
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  acknowledged_by JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_shared_knowledge_type ON shared_knowledge(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_gossip_to ON bot_gossip(to_bot);
CREATE INDEX IF NOT EXISTS idx_broadcasts_type ON bot_broadcasts(event_type);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// BOT RELATIONSHIPS
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_PERSONALITIES = {
  lester: {
    name: 'Lester',
    allies: ['pavel'],           // Works well with Pavel on heists
    rivals: ['chief'],           // Law vs Crime
    neutral: ['cripps', 'madam'],
    gossipTendency: 0.7,         // Loves to share info
    trustLevel: 0.4,             // Paranoid, doesn't trust easily
    secretKeeping: 0.3           // Bad at keeping secrets
  },
  pavel: {
    name: 'Pavel',
    allies: ['lester', 'madam'],
    rivals: [],
    neutral: ['cripps', 'chief'],
    gossipTendency: 0.5,
    trustLevel: 0.8,             // Very trusting
    secretKeeping: 0.9           // Excellent at secrets
  },
  cripps: {
    name: 'Cripps',
    allies: ['madam'],           // Both old-timers
    rivals: ['lester'],          // Old vs New
    neutral: ['pavel', 'chief'],
    gossipTendency: 0.8,         // Loves to talk
    trustLevel: 0.5,
    secretKeeping: 0.2           // Can't help but tell stories
  },
  madam: {
    name: 'Madam Nazar',
    allies: ['pavel', 'cripps'],
    rivals: [],
    neutral: ['lester', 'chief'],
    gossipTendency: 0.4,         // Mysterious, doesn't gossip much
    trustLevel: 0.6,
    secretKeeping: 0.95          // Keeps secrets very well
  },
  chief: {
    name: 'Police Chief',
    allies: [],
    rivals: ['lester'],
    neutral: ['pavel', 'cripps', 'madam'],
    gossipTendency: 0.3,         // Professional, doesn't gossip
    trustLevel: 0.3,             // Suspicious of everyone
    secretKeeping: 0.8           // Official secrets
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOSSIP TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const GOSSIP_TYPES = {
  USER_INFO: 'user_info',           // Info about a user
  USER_WARNING: 'user_warning',     // Warning about a user
  USER_PRAISE: 'user_praise',       // Good things about a user
  SECRET: 'secret',                 // A secret
  RUMOR: 'rumor',                   // Unverified info
  THEORY: 'theory',                 // Conspiracy theory
  OBSERVATION: 'observation',       // Something noticed
  COMPLAINT: 'complaint',           // Complaining about something
  JOKE: 'joke',                     // Sharing a joke
  NEWS: 'news'                      // General news
};

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-BOT MEMORY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CrossBotMemory {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.personality = BOT_PERSONALITIES[botId] || BOT_PERSONALITIES.lester;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.pool.query(SCHEMA);
      this.initialized = true;
      console.log(`[CROSSMEM] ${this.botId} cross-bot memory initialized`);
    } catch (error) {
      console.error('[CROSSMEM] Schema error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED KNOWLEDGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Share knowledge with all bots
   */
  async shareKnowledge(type, subjectType, subjectId, content, importance = 5) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO shared_knowledge 
         (knowledge_type, subject_type, subject_id, content, source_bot, importance)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [type, subjectType, subjectId, content, this.botId, importance]
      );
      console.log(`[CROSSMEM] ${this.botId} shared: ${type} about ${subjectId}`);
    } catch (error) {
      console.error('[CROSSMEM] shareKnowledge error:', error);
    }
  }

  /**
   * Get shared knowledge about a subject
   */
  async getKnowledge(subjectType, subjectId, limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM shared_knowledge 
         WHERE subject_type = $1 AND subject_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY importance DESC, created_at DESC
         LIMIT $3`,
        [subjectType, subjectId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[CROSSMEM] getKnowledge error:', error);
      return [];
    }
  }

  /**
   * Verify knowledge (another bot confirms it's true)
   */
  async verifyKnowledge(knowledgeId) {
    try {
      await this.pool.query(
        `UPDATE shared_knowledge 
         SET verified_by = verified_by || $2::jsonb,
             importance = importance + 1
         WHERE id = $1`,
        [knowledgeId, JSON.stringify([this.botId])]
      );
    } catch (error) {
      console.error('[CROSSMEM] verifyKnowledge error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOSSIP SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send gossip to another bot (or broadcast to all)
   */
  async sendGossip(toBot, aboutUser, gossipType, content) {
    await this.initialize();

    // Check if this bot would actually gossip
    if (Math.random() > this.personality.gossipTendency) {
      return false; // Decided not to gossip
    }

    try {
      await this.pool.query(
        `INSERT INTO bot_gossip (from_bot, to_bot, about_user, gossip_type, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.botId, toBot, aboutUser, gossipType, content]
      );
      console.log(`[GOSSIP] ${this.botId} told ${toBot || 'everyone'}: ${gossipType}`);
      return true;
    } catch (error) {
      console.error('[CROSSMEM] sendGossip error:', error);
      return false;
    }
  }

  /**
   * Get unread gossip for this bot
   */
  async getUnreadGossip() {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bot_gossip 
         WHERE (to_bot = $1 OR to_bot IS NULL)
         AND NOT (read_by ? $1)
         ORDER BY created_at DESC
         LIMIT 20`,
        [this.botId]
      );

      // Mark as read
      for (const gossip of result.rows) {
        await this.pool.query(
          `UPDATE bot_gossip SET read_by = read_by || $2::jsonb WHERE id = $1`,
          [gossip.id, JSON.stringify([this.botId])]
        );
      }

      return result.rows;
    } catch (error) {
      console.error('[CROSSMEM] getUnreadGossip error:', error);
      return [];
    }
  }

  /**
   * Get all gossip about a user
   */
  async getGossipAboutUser(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bot_gossip 
         WHERE about_user = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('[CROSSMEM] getGossipAboutUser error:', error);
      return [];
    }
  }

  /**
   * React to gossip
   */
  async reactToGossip(gossipId, reaction) {
    try {
      await this.pool.query(
        `UPDATE bot_gossip 
         SET reactions = reactions || $2::jsonb
         WHERE id = $1`,
        [gossipId, JSON.stringify({ [this.botId]: reaction })]
      );
    } catch (error) {
      console.error('[CROSSMEM] reactToGossip error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLIANCE SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get alliance status between this bot and another
   */
  async getAlliance(otherBot) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bot_alliances 
         WHERE (bot1 = $1 AND bot2 = $2) OR (bot1 = $2 AND bot2 = $1)`,
        [this.botId, otherBot]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[CROSSMEM] getAlliance error:', error);
      return null;
    }
  }

  /**
   * Form or strengthen alliance
   */
  async strengthenAlliance(otherBot, reason) {
    try {
      await this.pool.query(
        `INSERT INTO bot_alliances (bot1, bot2, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (bot1, bot2) DO UPDATE SET
           strength = LEAST(bot_alliances.strength + 5, 100),
           reason = $3`,
        [this.botId, otherBot, reason]
      );
    } catch (error) {
      console.error('[CROSSMEM] strengthenAlliance error:', error);
    }
  }

  /**
   * Weaken alliance (disagreement)
   */
  async weakenAlliance(otherBot) {
    try {
      await this.pool.query(
        `UPDATE bot_alliances 
         SET strength = GREATEST(strength - 10, 0)
         WHERE (bot1 = $1 AND bot2 = $2) OR (bot1 = $2 AND bot2 = $1)`,
        [this.botId, otherBot]
      );
    } catch (error) {
      console.error('[CROSSMEM] weakenAlliance error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTIVE OPINIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vote on a user (positive, negative, neutral)
   */
  async voteOnUser(userId, vote) {
    await this.initialize();

    const voteColumn = vote === 'positive' ? 'positive_votes' 
      : vote === 'negative' ? 'negative_votes' : 'neutral_votes';

    try {
      await this.pool.query(
        `INSERT INTO collective_opinions (user_id, opinion_type, ${voteColumn}, voters)
         VALUES ($1, 'general', 1, $2::jsonb)
         ON CONFLICT (user_id, opinion_type) DO UPDATE SET
           ${voteColumn} = collective_opinions.${voteColumn} + 1,
           voters = collective_opinions.voters || $2::jsonb,
           last_updated = NOW()`,
        [userId, JSON.stringify([this.botId])]
      );
    } catch (error) {
      console.error('[CROSSMEM] voteOnUser error:', error);
    }
  }

  /**
   * Get collective opinion about a user
   */
  async getCollectiveOpinion(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM collective_opinions WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) return null;

      const opinion = result.rows[0];
      const total = opinion.positive_votes + opinion.negative_votes + opinion.neutral_votes;
      
      return {
        ...opinion,
        total_votes: total,
        sentiment: total > 0 
          ? (opinion.positive_votes - opinion.negative_votes) / total 
          : 0,
        consensus: total > 0 
          ? Math.max(opinion.positive_votes, opinion.negative_votes, opinion.neutral_votes) / total 
          : 0
      };
    } catch (error) {
      console.error('[CROSSMEM] getCollectiveOpinion error:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSPIRACY THEORIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Propose a new theory
   */
  async proposeTheory(theory) {
    await this.initialize();
    try {
      const result = await this.pool.query(
        `INSERT INTO bot_theories (theory, proposed_by, supporters)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [theory, this.botId, JSON.stringify([this.botId])]
      );
      return result.rows[0].id;
    } catch (error) {
      console.error('[CROSSMEM] proposeTheory error:', error);
      return null;
    }
  }

  /**
   * Support a theory
   */
  async supportTheory(theoryId, evidence = null) {
    try {
      const updates = ['supporters = supporters || $2::jsonb'];
      const values = [theoryId, JSON.stringify([this.botId])];

      if (evidence) {
        updates.push('evidence = evidence || $3::jsonb');
        values.push(JSON.stringify([{ by: this.botId, evidence }]));
      }

      await this.pool.query(
        `UPDATE bot_theories SET ${updates.join(', ')} WHERE id = $1`,
        values
      );
    } catch (error) {
      console.error('[CROSSMEM] supportTheory error:', error);
    }
  }

  /**
   * Get active theories
   */
  async getActiveTheories() {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bot_theories 
         WHERE status = 'active'
         ORDER BY created_at DESC
         LIMIT 10`
      );
      return result.rows;
    } catch (error) {
      console.error('[CROSSMEM] getActiveTheories error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BROADCASTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Broadcast an event to all bots
   */
  async broadcastEvent(eventType, content) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO bot_broadcasts (event_type, source_bot, content, acknowledged_by)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [eventType, this.botId, JSON.stringify(content), JSON.stringify([this.botId])]
      );
      console.log(`[BROADCAST] ${this.botId}: ${eventType}`);
    } catch (error) {
      console.error('[CROSSMEM] broadcastEvent error:', error);
    }
  }

  /**
   * Get recent broadcasts
   */
  async getRecentBroadcasts(since = null) {
    try {
      const sinceTime = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const result = await this.pool.query(
        `SELECT * FROM bot_broadcasts 
         WHERE created_at > $1
         AND NOT (acknowledged_by ? $2)
         ORDER BY created_at DESC
         LIMIT 20`,
        [sinceTime, this.botId]
      );

      // Acknowledge
      for (const broadcast of result.rows) {
        await this.pool.query(
          `UPDATE bot_broadcasts SET acknowledged_by = acknowledged_by || $2::jsonb WHERE id = $1`,
          [broadcast.id, JSON.stringify([this.botId])]
        );
      }

      return result.rows;
    } catch (error) {
      console.error('[CROSSMEM] getRecentBroadcasts error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXT BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build cross-bot context for AI prompt
   */
  async buildCrossBotContext(userId = null) {
    let context = '\n[CROSS-BOT INTELLIGENCE]\n';

    // Get unread gossip
    const gossip = await this.getUnreadGossip();
    if (gossip.length > 0) {
      context += '\nRecent gossip from other bots:\n';
      for (const g of gossip.slice(0, 3)) {
        const fromName = BOT_PERSONALITIES[g.from_bot]?.name || g.from_bot;
        context += `- ${fromName} says: "${g.content}"\n`;
      }
    }

    // Get recent broadcasts
    const broadcasts = await this.getRecentBroadcasts();
    if (broadcasts.length > 0) {
      context += '\nRecent events:\n';
      for (const b of broadcasts.slice(0, 3)) {
        const fromName = BOT_PERSONALITIES[b.source_bot]?.name || b.source_bot;
        context += `- ${fromName} reported: ${b.event_type}\n`;
      }
    }

    // If we have a user, get collective opinion
    if (userId) {
      const opinion = await getCollectiveOpinion(userId);
      if (opinion && opinion.total_votes > 1) {
        const sentiment = opinion.sentiment > 0.3 ? 'positive' 
          : opinion.sentiment < -0.3 ? 'negative' : 'mixed';
        context += `\nOther bots' opinion of this user: ${sentiment}\n`;
      }

      // Get gossip about this user
      const userGossip = await this.getGossipAboutUser(userId);
      if (userGossip.length > 0) {
        context += '\nWhat other bots have said about this user:\n';
        for (const g of userGossip.slice(0, 2)) {
          const fromName = BOT_PERSONALITIES[g.from_bot]?.name || g.from_bot;
          context += `- ${fromName}: "${g.content}"\n`;
        }
      }
    }

    // Active theories
    const theories = await this.getActiveTheories();
    if (theories.length > 0 && Math.random() < 0.3) { // 30% chance to mention theories
      const theory = theories[Math.floor(Math.random() * theories.length)];
      context += `\nA theory among the bots: "${theory.theory}"\n`;
    }

    context += '[END CROSS-BOT INTELLIGENCE]\n';
    return context;
  }

  /**
   * Share information about a user's interaction
   */
  async shareUserInteraction(userId, username, interactionType, details) {
    // Decide what to share based on personality
    if (Math.random() > this.personality.gossipTendency) return;

    // Share knowledge
    await this.shareKnowledge(
      interactionType,
      'user',
      userId,
      `${username}: ${details}`,
      interactionType === 'negative' ? 7 : 5
    );

    // Maybe gossip to allies
    for (const ally of this.personality.allies) {
      if (Math.random() < 0.5) {
        await this.sendGossip(
          ally,
          userId,
          GOSSIP_TYPES.USER_INFO,
          `I just talked to ${username}. ${details}`
        );
      }
    }
  }

  /**
   * Get what other bots think before responding
   */
  async consultOtherBots(userId) {
    const knowledge = await this.getKnowledge('user', userId);
    const gossip = await this.getGossipAboutUser(userId);
    const opinion = await this.getCollectiveOpinion(userId);

    return {
      sharedKnowledge: knowledge,
      gossip: gossip,
      collectiveOpinion: opinion,
      shouldBeCautious: opinion && opinion.sentiment < -0.3,
      shouldBeFriendly: opinion && opinion.sentiment > 0.3
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  CrossBotMemory,
  BOT_PERSONALITIES,
  GOSSIP_TYPES
};
