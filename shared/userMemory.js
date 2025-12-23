/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * USER MEMORY & RELATIONSHIP SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This system gives bots PERSISTENT memory of every user they interact with.
 * Bots remember:
 * - User names, nicknames they've given them
 * - Every conversation topic
 * - User preferences and interests
 * - Relationship status (friend, enemy, neutral, favorite)
 * - Trust level
 * - Inside jokes
 * - Promises made
 * - Secrets shared
 * - Last seen timestamps
 * - Reputation scores
 * - Achievements unlocked
 * 
 * Memory decays over time like human memory - old things get fuzzy
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA (PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- User profiles (one per user across all bots)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id VARCHAR(32) PRIMARY KEY,
  username VARCHAR(64),
  display_name VARCHAR(64),
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  total_messages INT DEFAULT 0,
  total_interactions INT DEFAULT 0,
  is_regular BOOLEAN DEFAULT FALSE,
  is_vip BOOLEAN DEFAULT FALSE,
  timezone_guess VARCHAR(32),
  active_hours JSONB DEFAULT '[]',
  interests JSONB DEFAULT '[]',
  mentioned_topics JSONB DEFAULT '[]',
  personal_info JSONB DEFAULT '{}'
);

-- Bot-specific relationships with users
CREATE TABLE IF NOT EXISTS bot_user_relationships (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  relationship_type VARCHAR(32) DEFAULT 'neutral',
  trust_level INT DEFAULT 50,
  affection_level INT DEFAULT 50,
  annoyance_level INT DEFAULT 0,
  respect_level INT DEFAULT 50,
  nickname VARCHAR(64),
  nickname_reason TEXT,
  inside_jokes JSONB DEFAULT '[]',
  memorable_moments JSONB DEFAULT '[]',
  promises JSONB DEFAULT '[]',
  secrets JSONB DEFAULT '[]',
  grudges JSONB DEFAULT '[]',
  gifts_given JSONB DEFAULT '[]',
  last_interaction TIMESTAMP DEFAULT NOW(),
  interaction_count INT DEFAULT 0,
  positive_interactions INT DEFAULT 0,
  negative_interactions INT DEFAULT 0,
  UNIQUE(bot_id, user_id)
);

-- Conversation memories (what was talked about)
CREATE TABLE IF NOT EXISTS conversation_memories (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32),
  timestamp TIMESTAMP DEFAULT NOW(),
  topic VARCHAR(256),
  summary TEXT,
  sentiment VARCHAR(32),
  importance INT DEFAULT 5,
  memory_strength FLOAT DEFAULT 1.0,
  keywords JSONB DEFAULT '[]',
  user_message TEXT,
  bot_response TEXT
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  bot_id VARCHAR(32),
  achievement_id VARCHAR(64) NOT NULL,
  achievement_name VARCHAR(128),
  unlocked_at TIMESTAMP DEFAULT NOW(),
  context TEXT,
  UNIQUE(user_id, bot_id, achievement_id)
);

-- Bot predictions (for Madam Nazar)
CREATE TABLE IF NOT EXISTS bot_predictions (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32),
  prediction TEXT NOT NULL,
  made_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  fulfilled BOOLEAN DEFAULT NULL,
  fulfillment_notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_user ON conversation_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_bot ON conversation_memories(bot_id);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON conversation_memories(timestamp);
CREATE INDEX IF NOT EXISTS idx_relationships_bot ON bot_user_relationships(bot_id);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const RELATIONSHIP_TYPES = {
  STRANGER: 'stranger',           // Never met
  ACQUAINTANCE: 'acquaintance',   // Met a few times
  NEUTRAL: 'neutral',             // Regular interactions
  FRIENDLY: 'friendly',           // Positive history
  FRIEND: 'friend',               // Strong positive bond
  BEST_FRIEND: 'best_friend',     // Very close
  FAVORITE: 'favorite',           // Bot's favorite human
  ANNOYING: 'annoying',           // Mildly irritating
  DISLIKED: 'disliked',           // Bot doesn't like them
  RIVAL: 'rival',                 // Competitive relationship
  NEMESIS: 'nemesis',             // Actively dislikes
  SUSPICIOUS: 'suspicious',       // Doesn't trust them
  RESPECTED: 'respected',         // High respect
  MENTOR: 'mentor',               // User teaches bot things
  STUDENT: 'student'              // Bot teaches user
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ACHIEVEMENTS = {
  // General achievements
  first_contact: { name: "First Contact", description: "Had your first conversation with a bot" },
  night_owl: { name: "Night Owl", description: "Chat at 3 AM" },
  early_bird: { name: "Early Bird", description: "Chat before 6 AM" },
  chatterbox: { name: "Chatterbox", description: "Send 100 messages in one day" },
  regular: { name: "Regular", description: "Chat for 7 days in a row" },
  veteran: { name: "Veteran", description: "Been around for 30 days" },
  legend: { name: "Legend", description: "Been around for 100 days" },
  
  // Lester achievements
  lester_hacker: { name: "Script Kiddie", description: "Impressed Lester with tech knowledge" },
  lester_conspiracy: { name: "Tin Foil Hat", description: "Engaged in conspiracy theories with Lester" },
  lester_rage: { name: "Keyboard Warrior", description: "Witnessed Lester's rage" },
  lester_respect: { name: "Elite Hacker", description: "Earned Lester's respect" },
  
  // Pavel achievements
  pavel_vodka: { name: "Comrade", description: "Shared a virtual vodka with Pavel" },
  pavel_submarine: { name: "Submariner", description: "Learned submarine facts from Pavel" },
  pavel_heist: { name: "Heist Master", description: "Completed heist discussions with Pavel" },
  pavel_friend: { name: "Kapitan's Friend", description: "Became close with Pavel" },
  
  // Cripps achievements
  cripps_story: { name: "Campfire Tales", description: "Heard one of Cripps' stories" },
  cripps_patience: { name: "Patient Soul", description: "Listened to Cripps ramble for 10 minutes" },
  cripps_bank: { name: "Bank Job Survivor", description: "Heard the Tennessee bank job story" },
  cripps_friend: { name: "Old Timer's Pal", description: "Became friends with Cripps" },
  
  // Madam Nazar achievements
  madam_fortune: { name: "Fortune Seeker", description: "Had your fortune told" },
  madam_believer: { name: "True Believer", description: "Believed in Madam's predictions" },
  madam_prophecy: { name: "Prophecy Fulfilled", description: "Had a prediction come true" },
  madam_mystic: { name: "Fellow Mystic", description: "Connected spiritually with Madam" },
  
  // Chief achievements
  chief_law: { name: "Law Abiding", description: "Stayed on the Chief's good side" },
  chief_trouble: { name: "Troublemaker", description: "Got on the Chief's radar" },
  chief_respect: { name: "Deputy Material", description: "Earned the Chief's respect" },
  chief_outlaw: { name: "Most Wanted", description: "Became the Chief's nemesis" },
  
  // Cross-bot achievements
  social_butterfly: { name: "Social Butterfly", description: "Befriended all 5 bots" },
  bot_whisperer: { name: "Bot Whisperer", description: "Witnessed a bot-to-bot conversation about you" },
  drama_starter: { name: "Drama Starter", description: "Caused an argument between bots" },
  peacemaker: { name: "Peacemaker", description: "Resolved a bot argument" },
  secret_keeper: { name: "Secret Keeper", description: "Kept a bot's secret" },
  gossip: { name: "Gossip", description: "Spread information between bots" }
};

// ═══════════════════════════════════════════════════════════════════════════════
// NICKNAME GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const NICKNAME_TEMPLATES = {
  lester: {
    positive: ['Script Kiddie', 'Fellow Hacker', 'The Reliable One', 'Actually Competent', 'Big Brain'],
    negative: ['Normie', 'The Liability', 'Keyboard Smasher', 'The Noob', 'Script Baby'],
    neutral: ['The User', 'Regular', 'That One', 'Frequent Flyer']
  },
  pavel: {
    positive: ['Comrade', 'Good Friend', 'Fellow Sailor', 'Trusted Crew', 'Kapitan Junior'],
    negative: ['Landlubber', 'The Seasick One', 'Trouble', 'Bad Luck Charm'],
    neutral: ['Friend', 'Crew Member', 'The Passenger']
  },
  cripps: {
    positive: ['Good Kid', 'Youngster', 'The Patient One', 'Story Lover', 'Camp Helper'],
    negative: ['Whippersnapper', 'The Impatient One', 'City Slicker', 'Greenhorn'],
    neutral: ['Partner', 'Stranger', 'Traveler']
  },
  madam: {
    positive: ['Kindred Spirit', 'Seeker of Truth', 'Blessed One', 'Child of Destiny', 'The Believer'],
    negative: ['Skeptic', 'Lost Soul', 'The Blind One', 'Fate\'s Fool'],
    neutral: ['Wanderer', 'Traveler', 'Seeker']
  },
  chief: {
    positive: ['Good Citizen', 'Deputy', 'The Honest One', 'Law Keeper', 'Upstanding Folk'],
    negative: ['Troublemaker', 'Suspect', 'Person of Interest', 'The Rowdy One', 'Outlaw'],
    neutral: ['Citizen', 'Civilian', 'Passerby']
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INTEREST DETECTION KEYWORDS
// ═══════════════════════════════════════════════════════════════════════════════

const INTEREST_KEYWORDS = {
  gaming: ['game', 'play', 'gta', 'rdr', 'heist', 'mission', 'grind', 'level', 'xbox', 'playstation', 'pc', 'steam'],
  tech: ['code', 'programming', 'hack', 'computer', 'software', 'app', 'website', 'server', 'database'],
  music: ['song', 'music', 'band', 'album', 'spotify', 'playlist', 'concert', 'guitar', 'piano'],
  movies: ['movie', 'film', 'watch', 'netflix', 'show', 'series', 'actor', 'director'],
  sports: ['football', 'basketball', 'soccer', 'baseball', 'team', 'game', 'match', 'player'],
  cars: ['car', 'vehicle', 'drive', 'engine', 'mod', 'race', 'tuning', 'motorcycle'],
  food: ['food', 'eat', 'restaurant', 'cook', 'recipe', 'hungry', 'pizza', 'burger'],
  travel: ['travel', 'trip', 'vacation', 'country', 'city', 'flight', 'hotel'],
  art: ['art', 'draw', 'paint', 'design', 'creative', 'artist'],
  money: ['money', 'cash', 'rich', 'bank', 'invest', 'crypto', 'stock']
};

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class UserMemorySystem {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.cache = new Map(); // Local cache for quick access
    this.initialized = false;
  }

  /**
   * Initialize database tables
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.pool.query(SCHEMA);
      this.initialized = true;
      console.log(`[MEMORY] ${this.botId} memory system initialized`);
    } catch (error) {
      console.error('[MEMORY] Schema initialization error:', error);
    }
  }

  /**
   * Get or create user profile
   */
  async getUser(userId, username = null, displayName = null) {
    await this.initialize();
    
    // Check cache first
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId);
      if (Date.now() - cached.fetchedAt < 60000) { // 1 minute cache
        return cached.data;
      }
    }

    try {
      // Try to get existing user
      let result = await this.pool.query(
        'SELECT * FROM user_profiles WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // Create new user
        result = await this.pool.query(
          `INSERT INTO user_profiles (user_id, username, display_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET
             username = COALESCE($2, user_profiles.username),
             display_name = COALESCE($3, user_profiles.display_name),
             last_seen = NOW()
           RETURNING *`,
          [userId, username, displayName]
        );
      } else {
        // Update last seen
        await this.pool.query(
          'UPDATE user_profiles SET last_seen = NOW(), username = COALESCE($2, username) WHERE user_id = $1',
          [userId, username]
        );
      }

      const user = result.rows[0];
      this.cache.set(userId, { data: user, fetchedAt: Date.now() });
      return user;
    } catch (error) {
      console.error('[MEMORY] getUser error:', error);
      return null;
    }
  }

  /**
   * Get bot's relationship with a user
   */
  async getRelationship(userId) {
    await this.initialize();

    try {
      let result = await this.pool.query(
        'SELECT * FROM bot_user_relationships WHERE bot_id = $1 AND user_id = $2',
        [this.botId, userId]
      );

      if (result.rows.length === 0) {
        // Create new relationship
        result = await this.pool.query(
          `INSERT INTO bot_user_relationships (bot_id, user_id)
           VALUES ($1, $2)
           RETURNING *`,
          [this.botId, userId]
        );
      }

      return result.rows[0];
    } catch (error) {
      console.error('[MEMORY] getRelationship error:', error);
      return null;
    }
  }

  /**
   * Update relationship values
   */
  async updateRelationship(userId, updates) {
    await this.initialize();

    const validFields = [
      'relationship_type', 'trust_level', 'affection_level', 'annoyance_level',
      'respect_level', 'nickname', 'nickname_reason', 'inside_jokes',
      'memorable_moments', 'promises', 'secrets', 'grudges', 'gifts_given'
    ];

    const setClauses = [];
    const values = [this.botId, userId];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      if (validFields.includes(key)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return null;

    setClauses.push('last_interaction = NOW()');
    setClauses.push('interaction_count = interaction_count + 1');

    try {
      const result = await this.pool.query(
        `UPDATE bot_user_relationships 
         SET ${setClauses.join(', ')}
         WHERE bot_id = $1 AND user_id = $2
         RETURNING *`,
        values
      );
      return result.rows[0];
    } catch (error) {
      console.error('[MEMORY] updateRelationship error:', error);
      return null;
    }
  }

  /**
   * Record a positive interaction
   */
  async recordPositiveInteraction(userId) {
    try {
      await this.pool.query(
        `UPDATE bot_user_relationships 
         SET positive_interactions = positive_interactions + 1,
             affection_level = LEAST(affection_level + 2, 100),
             trust_level = LEAST(trust_level + 1, 100),
             annoyance_level = GREATEST(annoyance_level - 1, 0)
         WHERE bot_id = $1 AND user_id = $2`,
        [this.botId, userId]
      );
    } catch (error) {
      console.error('[MEMORY] recordPositiveInteraction error:', error);
    }
  }

  /**
   * Record a negative interaction
   */
  async recordNegativeInteraction(userId) {
    try {
      await this.pool.query(
        `UPDATE bot_user_relationships 
         SET negative_interactions = negative_interactions + 1,
             affection_level = GREATEST(affection_level - 3, 0),
             trust_level = GREATEST(trust_level - 2, 0),
             annoyance_level = LEAST(annoyance_level + 5, 100)
         WHERE bot_id = $1 AND user_id = $2`,
        [this.botId, userId]
      );
    } catch (error) {
      console.error('[MEMORY] recordNegativeInteraction error:', error);
    }
  }

  /**
   * Store a conversation memory
   */
  async storeMemory(userId, channelId, topic, summary, sentiment, importance, keywords, userMessage, botResponse) {
    await this.initialize();

    try {
      await this.pool.query(
        `INSERT INTO conversation_memories 
         (bot_id, user_id, channel_id, topic, summary, sentiment, importance, keywords, user_message, bot_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [this.botId, userId, channelId, topic, summary, sentiment, importance, 
         JSON.stringify(keywords), userMessage, botResponse]
      );

      // Update user's mentioned topics
      await this.pool.query(
        `UPDATE user_profiles 
         SET mentioned_topics = mentioned_topics || $2::jsonb,
             total_messages = total_messages + 1
         WHERE user_id = $1`,
        [userId, JSON.stringify([topic])]
      );
    } catch (error) {
      console.error('[MEMORY] storeMemory error:', error);
    }
  }

  /**
   * Get recent memories about a user
   */
  async getRecentMemories(userId, limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM conversation_memories 
         WHERE bot_id = $1 AND user_id = $2
         ORDER BY timestamp DESC
         LIMIT $3`,
        [this.botId, userId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[MEMORY] getRecentMemories error:', error);
      return [];
    }
  }

  /**
   * Get important memories (high importance, hasn't decayed too much)
   */
  async getImportantMemories(userId, minImportance = 7) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM conversation_memories 
         WHERE bot_id = $1 AND user_id = $2 AND importance >= $3
         AND memory_strength > 0.3
         ORDER BY importance DESC, timestamp DESC
         LIMIT 20`,
        [this.botId, userId, minImportance]
      );
      return result.rows;
    } catch (error) {
      console.error('[MEMORY] getImportantMemories error:', error);
      return [];
    }
  }

  /**
   * Search memories by keyword
   */
  async searchMemories(userId, keyword) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM conversation_memories 
         WHERE bot_id = $1 AND user_id = $2
         AND (summary ILIKE $3 OR topic ILIKE $3 OR keywords::text ILIKE $3)
         ORDER BY timestamp DESC
         LIMIT 10`,
        [this.botId, userId, `%${keyword}%`]
      );
      return result.rows;
    } catch (error) {
      console.error('[MEMORY] searchMemories error:', error);
      return [];
    }
  }

  /**
   * Decay old memories (run periodically)
   */
  async decayMemories() {
    try {
      // Memories decay by 5% per day for low importance, 1% for high importance
      await this.pool.query(
        `UPDATE conversation_memories 
         SET memory_strength = memory_strength * 
           CASE 
             WHEN importance >= 8 THEN 0.99
             WHEN importance >= 5 THEN 0.97
             ELSE 0.95
           END
         WHERE timestamp < NOW() - INTERVAL '1 day'
         AND memory_strength > 0.1`
      );

      // Delete completely decayed memories
      await this.pool.query(
        `DELETE FROM conversation_memories WHERE memory_strength <= 0.1`
      );

      console.log('[MEMORY] Memory decay complete');
    } catch (error) {
      console.error('[MEMORY] decayMemories error:', error);
    }
  }

  /**
   * Add an inside joke
   */
  async addInsideJoke(userId, joke, context) {
    const relationship = await this.getRelationship(userId);
    if (!relationship) return;

    const jokes = relationship.inside_jokes || [];
    jokes.push({
      joke,
      context,
      created: new Date().toISOString(),
      timesReferenced: 0
    });

    // Keep only last 10 jokes
    while (jokes.length > 10) jokes.shift();

    await this.updateRelationship(userId, { inside_jokes: jokes });
  }

  /**
   * Get a random inside joke
   */
  async getRandomInsideJoke(userId) {
    const relationship = await this.getRelationship(userId);
    if (!relationship || !relationship.inside_jokes?.length) return null;

    const jokes = relationship.inside_jokes;
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  /**
   * Add a secret
   */
  async addSecret(userId, secret) {
    const relationship = await this.getRelationship(userId);
    if (!relationship) return;

    const secrets = relationship.secrets || [];
    secrets.push({
      secret,
      told: new Date().toISOString(),
      leaked: false
    });

    await this.updateRelationship(userId, { 
      secrets,
      trust_level: Math.min((relationship.trust_level || 50) + 10, 100)
    });
  }

  /**
   * Maybe leak a secret (based on trust level with asker)
   */
  async maybeLeakSecret(askerId, aboutUserId) {
    const relationshipWithAsker = await this.getRelationship(askerId);
    const relationshipWithTarget = await this.getRelationship(aboutUserId);

    if (!relationshipWithTarget?.secrets?.length) return null;

    // High trust with asker + low trust with target = more likely to leak
    const leakChance = 
      ((relationshipWithAsker?.trust_level || 50) / 100) * 
      (1 - (relationshipWithTarget?.trust_level || 50) / 100) * 0.3;

    if (Math.random() < leakChance) {
      const secrets = relationshipWithTarget.secrets;
      const secretToLeak = secrets.find(s => !s.leaked);
      if (secretToLeak) {
        secretToLeak.leaked = true;
        await this.updateRelationship(aboutUserId, { secrets });
        return secretToLeak.secret;
      }
    }

    return null;
  }

  /**
   * Give user a nickname
   */
  async giveNickname(userId, sentiment = 'neutral') {
    const templates = NICKNAME_TEMPLATES[this.botId] || NICKNAME_TEMPLATES.lester;
    const options = templates[sentiment] || templates.neutral;
    const nickname = options[Math.floor(Math.random() * options.length)];
    
    await this.updateRelationship(userId, { 
      nickname,
      nickname_reason: `Based on ${sentiment} interactions`
    });

    return nickname;
  }

  /**
   * Update relationship type based on interaction history
   */
  async evaluateRelationship(userId) {
    const relationship = await this.getRelationship(userId);
    if (!relationship) return;

    const { affection_level, trust_level, annoyance_level, respect_level, interaction_count } = relationship;

    let newType = RELATIONSHIP_TYPES.NEUTRAL;

    // Calculate overall sentiment
    const positive = (affection_level + trust_level + respect_level) / 3;
    const negative = annoyance_level;

    if (interaction_count < 3) {
      newType = RELATIONSHIP_TYPES.STRANGER;
    } else if (interaction_count < 10) {
      newType = RELATIONSHIP_TYPES.ACQUAINTANCE;
    } else if (negative > 80) {
      newType = RELATIONSHIP_TYPES.NEMESIS;
    } else if (negative > 60) {
      newType = RELATIONSHIP_TYPES.DISLIKED;
    } else if (negative > 40) {
      newType = RELATIONSHIP_TYPES.ANNOYING;
    } else if (positive > 85 && interaction_count > 50) {
      newType = RELATIONSHIP_TYPES.BEST_FRIEND;
    } else if (positive > 75) {
      newType = RELATIONSHIP_TYPES.FRIEND;
    } else if (positive > 60) {
      newType = RELATIONSHIP_TYPES.FRIENDLY;
    } else if (respect_level > 80) {
      newType = RELATIONSHIP_TYPES.RESPECTED;
    } else if (trust_level < 30) {
      newType = RELATIONSHIP_TYPES.SUSPICIOUS;
    }

    if (newType !== relationship.relationship_type) {
      await this.updateRelationship(userId, { relationship_type: newType });
    }

    return newType;
  }

  /**
   * Detect user interests from message
   */
  detectInterests(message) {
    const content = message.toLowerCase();
    const detectedInterests = [];

    for (const [interest, keywords] of Object.entries(INTEREST_KEYWORDS)) {
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          detectedInterests.push(interest);
          break;
        }
      }
    }

    return [...new Set(detectedInterests)];
  }

  /**
   * Update user interests
   */
  async updateInterests(userId, newInterests) {
    if (!newInterests.length) return;

    try {
      const user = await this.getUser(userId);
      const currentInterests = user?.interests || [];
      const combined = [...new Set([...currentInterests, ...newInterests])];

      await this.pool.query(
        'UPDATE user_profiles SET interests = $2 WHERE user_id = $1',
        [userId, JSON.stringify(combined)]
      );
    } catch (error) {
      console.error('[MEMORY] updateInterests error:', error);
    }
  }

  /**
   * Check and award achievements
   */
  async checkAchievements(userId, context = {}) {
    const unlocked = [];

    try {
      const user = await this.getUser(userId);
      const relationship = await this.getRelationship(userId);
      
      // Check various achievement conditions
      const checks = {
        first_contact: relationship?.interaction_count === 1,
        night_owl: new Date().getHours() === 3,
        early_bird: new Date().getHours() < 6,
        regular: user?.total_messages >= 50,
        veteran: user?.first_seen && 
          (Date.now() - new Date(user.first_seen).getTime()) > 30 * 24 * 60 * 60 * 1000,
        legend: user?.first_seen && 
          (Date.now() - new Date(user.first_seen).getTime()) > 100 * 24 * 60 * 60 * 1000
      };

      // Bot-specific achievements
      if (this.botId === 'lester') {
        checks.lester_respect = relationship?.respect_level >= 80;
      } else if (this.botId === 'pavel') {
        checks.pavel_friend = relationship?.affection_level >= 80;
      } else if (this.botId === 'cripps') {
        checks.cripps_friend = relationship?.affection_level >= 80;
      } else if (this.botId === 'madam') {
        checks.madam_mystic = relationship?.trust_level >= 80;
      } else if (this.botId === 'chief') {
        checks.chief_respect = relationship?.respect_level >= 80;
        checks.chief_outlaw = relationship?.annoyance_level >= 80;
      }

      // Custom context-based checks
      if (context.mentionedStory && this.botId === 'cripps') {
        checks.cripps_story = true;
      }
      if (context.hadFortuneTold && this.botId === 'madam') {
        checks.madam_fortune = true;
      }

      // Award achievements
      for (const [achievementId, condition] of Object.entries(checks)) {
        if (condition && ACHIEVEMENTS[achievementId]) {
          const awarded = await this.awardAchievement(userId, achievementId);
          if (awarded) {
            unlocked.push(ACHIEVEMENTS[achievementId]);
          }
        }
      }
    } catch (error) {
      console.error('[MEMORY] checkAchievements error:', error);
    }

    return unlocked;
  }

  /**
   * Award an achievement
   */
  async awardAchievement(userId, achievementId) {
    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) return false;

    try {
      const result = await this.pool.query(
        `INSERT INTO user_achievements (user_id, bot_id, achievement_id, achievement_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, bot_id, achievement_id) DO NOTHING
         RETURNING *`,
        [userId, this.botId, achievementId, achievement.name]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('[MEMORY] awardAchievement error:', error);
      return false;
    }
  }

  /**
   * Get user's achievements
   */
  async getAchievements(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM user_achievements 
         WHERE user_id = $1 AND (bot_id = $2 OR bot_id IS NULL)
         ORDER BY unlocked_at DESC`,
        [userId, this.botId]
      );
      return result.rows;
    } catch (error) {
      console.error('[MEMORY] getAchievements error:', error);
      return [];
    }
  }

  /**
   * Make a prediction (Madam Nazar special)
   */
  async makePrediction(userId, prediction, expiresInDays = 7) {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      await this.pool.query(
        `INSERT INTO bot_predictions (bot_id, user_id, prediction, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [this.botId, userId, prediction, expiresAt]
      );
    } catch (error) {
      console.error('[MEMORY] makePrediction error:', error);
    }
  }

  /**
   * Get pending predictions for a user
   */
  async getPendingPredictions(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM bot_predictions 
         WHERE bot_id = $1 AND user_id = $2 
         AND fulfilled IS NULL AND expires_at > NOW()
         ORDER BY made_at DESC`,
        [this.botId, userId]
      );
      return result.rows;
    } catch (error) {
      console.error('[MEMORY] getPendingPredictions error:', error);
      return [];
    }
  }

  /**
   * Build context string for AI prompt
   */
  async buildMemoryContext(userId, username) {
    const user = await this.getUser(userId, username);
    const relationship = await this.getRelationship(userId);
    const recentMemories = await this.getRecentMemories(userId, 5);
    const importantMemories = await this.getImportantMemories(userId, 8);

    let context = '\n[USER MEMORY CONTEXT]\n';

    // Basic info
    context += `User: ${username || 'Unknown'}\n`;
    if (user) {
      context += `First met: ${user.first_seen ? new Date(user.first_seen).toLocaleDateString() : 'Recently'}\n`;
      context += `Total messages: ${user.total_messages || 0}\n`;
      if (user.interests?.length) {
        context += `Known interests: ${user.interests.join(', ')}\n`;
      }
    }

    // Relationship
    if (relationship) {
      context += `\nRelationship: ${relationship.relationship_type || 'neutral'}\n`;
      context += `Trust: ${relationship.trust_level}/100, Affection: ${relationship.affection_level}/100\n`;
      if (relationship.nickname) {
        context += `You call them: "${relationship.nickname}"\n`;
      }
      if (relationship.inside_jokes?.length) {
        const joke = relationship.inside_jokes[relationship.inside_jokes.length - 1];
        context += `Inside joke: "${joke.joke}"\n`;
      }
      if (relationship.annoyance_level > 50) {
        context += `You're annoyed with them (${relationship.annoyance_level}/100)\n`;
      }
    }

    // Recent memories
    if (recentMemories.length) {
      context += `\nRecent conversations:\n`;
      for (const mem of recentMemories.slice(0, 3)) {
        context += `- ${mem.topic}: ${mem.summary}\n`;
      }
    }

    // Important memories
    if (importantMemories.length) {
      context += `\nImportant things to remember:\n`;
      for (const mem of importantMemories.slice(0, 3)) {
        context += `- ${mem.summary}\n`;
      }
    }

    context += '[END MEMORY CONTEXT]\n';
    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  UserMemorySystem,
  RELATIONSHIP_TYPES,
  ACHIEVEMENTS,
  NICKNAME_TEMPLATES,
  INTEREST_KEYWORDS
};
