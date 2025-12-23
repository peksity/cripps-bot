/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADVANCED BEHAVIOR SYSTEMS v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Contains:
 * 1. Prophecy Tracking - Track and fulfill Madam's predictions
 * 2. Secret Bot Meetings - Reference off-screen conversations
 * 3. Personality Drift - Slow evolution over months
 * 4. Catchphrase Birth - Adopt popular phrases as catchphrases
 * 5. Grudge Archaeology - Long-term memory of slights
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- Enhanced prophecy tracking
CREATE TABLE IF NOT EXISTS prophecies (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) DEFAULT 'madam',
  user_id VARCHAR(32),
  prophecy_text TEXT NOT NULL,
  prophecy_type VARCHAR(64),
  keywords JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  fulfilled BOOLEAN DEFAULT FALSE,
  fulfilled_at TIMESTAMP,
  fulfillment_evidence TEXT,
  referenced_count INT DEFAULT 0
);

-- Secret bot meetings (off-screen conversations)
CREATE TABLE IF NOT EXISTS secret_meetings (
  id SERIAL PRIMARY KEY,
  bot1 VARCHAR(32) NOT NULL,
  bot2 VARCHAR(32) NOT NULL,
  topic VARCHAR(128),
  about_user VARCHAR(32),
  meeting_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  revealed_to JSONB DEFAULT '[]'
);

-- Personality drift tracking
CREATE TABLE IF NOT EXISTS personality_drift (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  trait VARCHAR(64) NOT NULL,
  original_value FLOAT DEFAULT 0.5,
  current_value FLOAT DEFAULT 0.5,
  drift_direction FLOAT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  change_reasons JSONB DEFAULT '[]',
  UNIQUE(bot_id, trait)
);

-- Catchphrase tracking
CREATE TABLE IF NOT EXISTS catchphrases (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  phrase TEXT NOT NULL,
  origin_user VARCHAR(32),
  origin_context TEXT,
  adoption_date TIMESTAMP DEFAULT NOW(),
  usage_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(bot_id, phrase)
);

-- Reaction tracking for catchphrase detection
CREATE TABLE IF NOT EXISTS reaction_tracking (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32),
  author_id VARCHAR(32),
  content TEXT,
  positive_reactions INT DEFAULT 0,
  negative_reactions INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  evaluated BOOLEAN DEFAULT FALSE
);

-- Grudge tracking
CREATE TABLE IF NOT EXISTS grudges (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  grudge_type VARCHAR(64),
  original_offense TEXT,
  offense_date TIMESTAMP DEFAULT NOW(),
  severity INT DEFAULT 5,
  times_mentioned INT DEFAULT 0,
  last_mentioned TIMESTAMP,
  forgiven BOOLEAN DEFAULT FALSE,
  forgiven_date TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prophecies_keywords ON prophecies USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_grudges_user ON grudges(user_id);
CREATE INDEX IF NOT EXISTS idx_drift_bot ON personality_drift(bot_id);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROPHECY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const PROPHECY_TEMPLATES = {
  vague: [
    { text: "A stranger will bring unexpected news.", keywords: ['news', 'heard', 'told', 'said', 'found out'] },
    { text: "You will face a choice between two paths.", keywords: ['decide', 'choice', 'should I', 'either', 'or'] },
    { text: "Something lost will be found.", keywords: ['found', 'discovered', 'finally', 'got it'] },
    { text: "An old connection will resurface.", keywords: ['old friend', 'used to', 'remember', 'back', 'again'] },
    { text: "Your patience will be tested.", keywords: ['frustrated', 'annoyed', 'waiting', 'taking forever'] },
    { text: "A small victory awaits.", keywords: ['won', 'beat', 'got it', 'finally', 'success', 'yes'] },
    { text: "Beware the number three.", keywords: ['three', 'third', '3', 'triple'] },
    { text: "Water will play a role.", keywords: ['water', 'rain', 'ocean', 'drink', 'submarine'] },
    { text: "The night holds secrets.", keywords: ['night', 'late', 'dark', 'midnight', 'evening'] },
    { text: "Trust your instincts when the moment comes.", keywords: ['knew it', 'felt', 'instinct', 'gut'] }
  ],
  specific: [
    { text: "You will speak of money before the week ends.", keywords: ['money', 'cash', 'rich', 'broke', 'pay', '$'] },
    { text: "Technology will both help and hinder you.", keywords: ['computer', 'phone', 'bug', 'error', 'work', 'broken'] },
    { text: "A celebration is coming.", keywords: ['party', 'celebrate', 'birthday', 'congrats', 'won'] },
    { text: "Someone will ask for your help.", keywords: ['help', 'please', 'can you', 'need'] },
    { text: "You will laugh genuinely soon.", keywords: ['lmao', 'lol', 'haha', 'dead', 'funny'] },
    { text: "A question will lead to discovery.", keywords: ['what', 'how', 'why', 'found', 'realized'] }
  ],
  dramatic: [
    { text: "The cards show upheaval. Great change approaches.", keywords: ['changing', 'different', 'new', 'everything'] },
    { text: "I see two futures intertwined. Your choice creates the path.", keywords: ['decide', 'choice', 'what if'] },
    { text: "Something ends, but from endings come beginnings.", keywords: ['over', 'done', 'finished', 'starting', 'new'] },
    { text: "The spirits speak of a journey. Not all journeys are physical.", keywords: ['going', 'leaving', 'change', 'growth'] }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECRET MEETING TOPICS
// ═══════════════════════════════════════════════════════════════════════════════

const MEETING_TOPICS = {
  'lester-pavel': [
    "the next big heist",
    "submarine modifications",
    "security systems",
    "escape routes"
  ],
  'lester-chief': [
    "that unsolved case",
    "the evidence that went missing",
    "a mutual enemy"
  ],
  'pavel-cripps': [
    "survival techniques",
    "isolation and loneliness",
    "the best supplies for long trips"
  ],
  'madam-cripps': [
    "the old days",
    "someone they both knew",
    "a shared regret"
  ],
  'madam-chief': [
    "the nature of justice",
    "things that cannot be explained",
    "a cold case with strange circumstances"
  ],
  'generic': [
    "you",
    "recent events",
    "what's been happening",
    "old times",
    "the future"
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONALITY TRAITS
// ═══════════════════════════════════════════════════════════════════════════════

const PERSONALITY_TRAITS = {
  lester: {
    hostility: { base: 0.7, driftRange: [-0.02, 0.01] },      // Can become less hostile
    paranoia: { base: 0.8, driftRange: [-0.01, 0.02] },       // Usually stays or increases
    openness: { base: 0.3, driftRange: [0, 0.02] },           // Can slowly open up
    humor: { base: 0.5, driftRange: [-0.01, 0.01] },          // Stable
    trust: { base: 0.2, driftRange: [0, 0.01] }               // Can slowly increase
  },
  pavel: {
    friendliness: { base: 0.8, driftRange: [-0.01, 0.01] },   // Stable
    nostalgia: { base: 0.5, driftRange: [0, 0.01] },          // Slowly increases
    openness: { base: 0.7, driftRange: [-0.01, 0.01] },       // Stable
    optimism: { base: 0.7, driftRange: [-0.02, 0.01] },       // Can decrease
    trust: { base: 0.6, driftRange: [-0.01, 0.02] }           // Can change
  },
  cripps: {
    rambling: { base: 0.8, driftRange: [0, 0.01] },           // Gets worse
    exaggeration: { base: 0.7, driftRange: [0, 0.02] },       // Gets worse
    warmth: { base: 0.5, driftRange: [0, 0.01] },             // Can increase
    grumpiness: { base: 0.6, driftRange: [-0.01, 0.01] },     // Stable
    nostalgia: { base: 0.9, driftRange: [0, 0] }              // Maxed out
  },
  madam: {
    mysticism: { base: 0.8, driftRange: [-0.01, 0.01] },      // Stable
    crypticness: { base: 0.7, driftRange: [-0.02, 0.01] },    // Can become clearer
    warmth: { base: 0.5, driftRange: [0, 0.01] },             // Can increase
    dramatics: { base: 0.7, driftRange: [-0.01, 0.01] },      // Stable
    authenticity: { base: 0.4, driftRange: [0, 0.02] }        // Can become more genuine
  },
  chief: {
    strictness: { base: 0.8, driftRange: [-0.02, 0.01] },     // Can soften
    suspicion: { base: 0.7, driftRange: [-0.01, 0.01] },      // Stable
    humor: { base: 0.3, driftRange: [0, 0.02] },              // Can develop
    weariness: { base: 0.5, driftRange: [0, 0.01] },          // Gets more tired
    empathy: { base: 0.4, driftRange: [0, 0.01] }             // Can grow
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRUDGE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const GRUDGE_TRIGGERS = {
  insult: {
    patterns: [/stupid/i, /dumb/i, /idiot/i, /useless/i, /trash/i, /suck/i, /worst/i, /boring/i, /annoying/i],
    severity: 6,
    type: 'insult'
  },
  dismissal: {
    patterns: [/don't care/i, /whatever/i, /shut up/i, /nobody asked/i, /who cares/i, /irrelevant/i],
    severity: 5,
    type: 'dismissal'
  },
  betrayal: {
    patterns: [/told everyone/i, /can't trust/i, /liar/i, /fake/i, /snitch/i, /sold out/i],
    severity: 8,
    type: 'betrayal'
  },
  mockery: {
    patterns: [/lol your/i, /imagine being/i, /cringe/i, /embarrassing/i, /pathetic/i],
    severity: 5,
    type: 'mockery'
  },
  doubt: {
    patterns: [/you can't/i, /you won't/i, /never gonna/i, /doubt it/i, /yeah right/i],
    severity: 4,
    type: 'doubt'
  }
};

const GRUDGE_REFERENCES = {
  lester: [
    "You know, {time} ago you called me {offense}. I have a very good memory.",
    "Still thinking about when you said {quote}. Bold move.",
    "Remember {time} ago? When you {offense}? I remember.",
    "*types passive-aggressively* Oh, like how you {offense}?"
  ],
  pavel: [
    "Ah, reminds me of when you {offense}. {time} ago. I forgive... mostly.",
    "You know, kapitan, {time} ago you said {quote}. The submarine remembers.",
    "Is like that time you {offense}. I was hurt, friend. Still a little hurt."
  ],
  cripps: [
    "Now that reminds me... {time} ago you {offense}. Still stings.",
    "You know, {time} ago you said something I ain't forgotten. {quote}.",
    "*mutters* At least I never {offense} like some people. {time} ago..."
  ],
  madam: [
    "The spirits reminded me... {time} ago, you {offense}. They do not forget.",
    "I foresaw this moment, you know. Just as I saw {time} ago when you {offense}.",
    "*cards shuffle* Ah yes. {time} ago. {quote}. The cards remember."
  ],
  chief: [
    "Got a file here. {time} ago: {offense}. It's documented.",
    "Speaking of behavior, {time} ago you {offense}. Noted.",
    "*checks notes* According to my records, {time} ago you said {quote}."
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED BEHAVIOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class AdvancedBehaviorSystems {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.initialized = false;
    this.personalityCache = new Map();
    this.catchphrases = [];
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.pool.query(SCHEMA);
      await this.initializePersonality();
      await this.loadCatchphrases();
      this.initialized = true;
      console.log(`[ADVANCED] ${this.botId} behavior systems initialized`);
    } catch (error) {
      console.error('[ADVANCED] Init error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPHECY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate and store a prophecy
   */
  async makeProphecy(userId, type = 'vague') {
    const templates = PROPHECY_TEMPLATES[type] || PROPHECY_TEMPLATES.vague;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 2 weeks to fulfill
    
    try {
      const result = await this.pool.query(
        `INSERT INTO prophecies (bot_id, user_id, prophecy_text, prophecy_type, keywords, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [this.botId, userId, template.text, type, JSON.stringify(template.keywords), expiresAt]
      );
      
      console.log(`[PROPHECY] Created: ${template.text}`);
      return { id: result.rows[0].id, text: template.text };
    } catch (error) {
      console.error('[ADVANCED] Make prophecy error:', error);
      return null;
    }
  }

  /**
   * Check if a message fulfills any prophecies
   */
  async checkProphecyFulfillment(userId, content) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM prophecies 
         WHERE user_id = $1 AND fulfilled = FALSE 
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      );

      const fulfilled = [];
      const lowerContent = content.toLowerCase();

      for (const prophecy of result.rows) {
        const keywords = prophecy.keywords || [];
        for (const keyword of keywords) {
          if (lowerContent.includes(keyword.toLowerCase())) {
            // Mark as fulfilled
            await this.pool.query(
              `UPDATE prophecies SET fulfilled = TRUE, fulfilled_at = NOW(), 
               fulfillment_evidence = $2 WHERE id = $1`,
              [prophecy.id, content.substring(0, 200)]
            );
            
            fulfilled.push(prophecy);
            console.log(`[PROPHECY] Fulfilled: ${prophecy.prophecy_text}`);
            break;
          }
        }
      }

      return fulfilled;
    } catch (error) {
      console.error('[ADVANCED] Check prophecy error:', error);
      return [];
    }
  }

  /**
   * Get reference to fulfilled prophecy for conversation
   */
  async getFulfilledProphecyReference(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM prophecies 
         WHERE user_id = $1 AND fulfilled = TRUE 
         AND referenced_count < 3
         ORDER BY fulfilled_at DESC LIMIT 1`,
        [userId]
      );

      if (result.rows.length > 0) {
        const prophecy = result.rows[0];
        await this.pool.query(
          'UPDATE prophecies SET referenced_count = referenced_count + 1 WHERE id = $1',
          [prophecy.id]
        );
        return `Did I not tell you "${prophecy.prophecy_text}"? The spirits are never wrong.`;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECRET BOT MEETINGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a secret meeting reference
   */
  async generateSecretMeeting(otherBot, aboutUser = null) {
    await this.initialize();
    
    const key1 = `${this.botId}-${otherBot}`;
    const key2 = `${otherBot}-${this.botId}`;
    const topics = MEETING_TOPICS[key1] || MEETING_TOPICS[key2] || MEETING_TOPICS.generic;
    const topic = topics[Math.floor(Math.random() * topics.length)];
    
    const summaries = [
      `We discussed ${topic}. ${otherBot} had some interesting thoughts.`,
      `${otherBot} brought up ${topic}. Made me think.`,
      `We talked about ${topic}. Can't share details though.`
    ];
    
    try {
      await this.pool.query(
        `INSERT INTO secret_meetings (bot1, bot2, topic, about_user, meeting_summary)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.botId, otherBot, topic, aboutUser, summaries[Math.floor(Math.random() * summaries.length)]]
      );
      
      return { otherBot, topic };
    } catch (error) {
      console.error('[ADVANCED] Generate meeting error:', error);
      return null;
    }
  }

  /**
   * Get a secret meeting to reference
   */
  async getSecretMeetingReference(forUser = null) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM secret_meetings 
         WHERE (bot1 = $1 OR bot2 = $1)
         AND NOT ($2 = ANY(SELECT jsonb_array_elements_text(revealed_to)))
         ORDER BY created_at DESC LIMIT 1`,
        [this.botId, forUser || 'nobody']
      );

      if (result.rows.length > 0) {
        const meeting = result.rows[0];
        const otherBot = meeting.bot1 === this.botId ? meeting.bot2 : meeting.bot1;
        
        // Mark as revealed
        if (forUser) {
          await this.pool.query(
            `UPDATE secret_meetings SET revealed_to = revealed_to || $2::jsonb WHERE id = $1`,
            [meeting.id, JSON.stringify([forUser])]
          );
        }

        const references = [
          `${otherBot} and I were talking last night... about ${meeting.topic}.`,
          `I spoke with ${otherBot} recently. We discussed ${meeting.topic}. Your name came up.`,
          `Between you and me, ${otherBot} mentioned ${meeting.topic}. Thought you should know.`
        ];

        return references[Math.floor(Math.random() * references.length)];
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Randomly create secret meetings (call periodically)
   */
  async maybeCreateSecretMeeting() {
    if (Math.random() > 0.1) return; // 10% chance when called
    
    const otherBots = ['lester', 'pavel', 'cripps', 'madam', 'chief'].filter(b => b !== this.botId);
    const otherBot = otherBots[Math.floor(Math.random() * otherBots.length)];
    
    await this.generateSecretMeeting(otherBot);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONALITY DRIFT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize personality traits in database
   */
  async initializePersonality() {
    const traits = PERSONALITY_TRAITS[this.botId];
    if (!traits) return;

    try {
      for (const [trait, config] of Object.entries(traits)) {
        await this.pool.query(
          `INSERT INTO personality_drift (bot_id, trait, original_value, current_value)
           VALUES ($1, $2, $3, $3)
           ON CONFLICT (bot_id, trait) DO NOTHING`,
          [this.botId, trait, config.base]
        );
      }

      // Load current values
      const result = await this.pool.query(
        'SELECT trait, current_value FROM personality_drift WHERE bot_id = $1',
        [this.botId]
      );
      for (const row of result.rows) {
        this.personalityCache.set(row.trait, parseFloat(row.current_value));
      }
    } catch (error) {
      console.error('[ADVANCED] Init personality error:', error);
    }
  }

  /**
   * Get current personality trait value
   */
  getTraitValue(trait) {
    return this.personalityCache.get(trait) || 0.5;
  }

  /**
   * Apply drift to a trait (call daily or on significant events)
   */
  async applyDrift(trait, reason = 'time', forceDirection = null) {
    const traits = PERSONALITY_TRAITS[this.botId];
    if (!traits || !traits[trait]) return;

    const config = traits[trait];
    let drift;
    
    if (forceDirection !== null) {
      drift = forceDirection > 0 ? config.driftRange[1] : config.driftRange[0];
    } else {
      // Random within range
      drift = config.driftRange[0] + Math.random() * (config.driftRange[1] - config.driftRange[0]);
    }

    try {
      const result = await this.pool.query(
        `UPDATE personality_drift 
         SET current_value = GREATEST(0, LEAST(1, current_value + $3)),
             drift_direction = $3,
             last_updated = NOW(),
             change_reasons = change_reasons || $4::jsonb
         WHERE bot_id = $1 AND trait = $2
         RETURNING current_value`,
        [this.botId, trait, drift, JSON.stringify([{ reason, drift, time: new Date().toISOString() }])]
      );

      if (result.rows.length > 0) {
        this.personalityCache.set(trait, parseFloat(result.rows[0].current_value));
      }
    } catch (error) {
      console.error('[ADVANCED] Apply drift error:', error);
    }
  }

  /**
   * Run daily personality drift
   */
  async runDailyDrift() {
    const traits = PERSONALITY_TRAITS[this.botId];
    if (!traits) return;

    for (const trait of Object.keys(traits)) {
      await this.applyDrift(trait, 'daily_drift');
    }
    console.log(`[DRIFT] ${this.botId} daily personality drift applied`);
  }

  /**
   * Build personality context for AI
   */
  buildPersonalityContext() {
    const traits = PERSONALITY_TRAITS[this.botId];
    if (!traits) return '';

    let context = '\n[CURRENT PERSONALITY STATE]\n';
    for (const trait of Object.keys(traits)) {
      const value = this.getTraitValue(trait);
      const level = value > 0.7 ? 'high' : value < 0.3 ? 'low' : 'moderate';
      context += `${trait}: ${level} (${(value * 100).toFixed(0)}%)\n`;
    }
    context += '[END PERSONALITY]\n';
    return context;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATCHPHRASE BIRTH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load existing catchphrases
   */
  async loadCatchphrases() {
    try {
      const result = await this.pool.query(
        `SELECT phrase FROM catchphrases WHERE bot_id = $1 AND is_active = TRUE`,
        [this.botId]
      );
      this.catchphrases = result.rows.map(r => r.phrase);
    } catch (error) {
      console.error('[ADVANCED] Load catchphrases error:', error);
    }
  }

  /**
   * Track a message for potential catchphrase (call on message create)
   */
  async trackForCatchphrase(messageId, channelId, authorId, content) {
    try {
      await this.pool.query(
        `INSERT INTO reaction_tracking (message_id, channel_id, author_id, content)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [messageId, channelId, authorId, content.substring(0, 200)]
      );
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Update reaction count
   */
  async updateReactionCount(messageId, positive = true) {
    try {
      const column = positive ? 'positive_reactions' : 'negative_reactions';
      await this.pool.query(
        `UPDATE reaction_tracking SET ${column} = ${column} + 1 WHERE message_id = $1`,
        [messageId]
      );
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Evaluate messages for catchphrase adoption
   */
  async evaluateCatchphrases() {
    try {
      // Find messages with high positive reactions
      const result = await this.pool.query(
        `SELECT * FROM reaction_tracking 
         WHERE positive_reactions >= 5 
         AND negative_reactions < 2
         AND evaluated = FALSE
         AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY positive_reactions DESC
         LIMIT 5`
      );

      for (const row of result.rows) {
        // Extract potential catchphrase (short, memorable content)
        const content = row.content;
        if (content.length > 10 && content.length < 50) {
          // 20% chance to adopt
          if (Math.random() < 0.2) {
            await this.adoptCatchphrase(content, row.author_id);
          }
        }

        // Mark as evaluated
        await this.pool.query(
          'UPDATE reaction_tracking SET evaluated = TRUE WHERE id = $1',
          [row.id]
        );
      }
    } catch (error) {
      console.error('[ADVANCED] Evaluate catchphrases error:', error);
    }
  }

  /**
   * Adopt a catchphrase
   */
  async adoptCatchphrase(phrase, originUser) {
    try {
      await this.pool.query(
        `INSERT INTO catchphrases (bot_id, phrase, origin_user, origin_context)
         VALUES ($1, $2, $3, 'Popular message')
         ON CONFLICT (bot_id, phrase) DO NOTHING`,
        [this.botId, phrase, originUser]
      );
      this.catchphrases.push(phrase);
      console.log(`[CATCHPHRASE] ${this.botId} adopted: "${phrase}"`);
    } catch (error) {
      console.error('[ADVANCED] Adopt catchphrase error:', error);
    }
  }

  /**
   * Maybe use a catchphrase in response
   */
  async maybeUseCatchphrase() {
    if (this.catchphrases.length === 0) return null;
    if (Math.random() > 0.1) return null; // 10% chance
    
    const phrase = this.catchphrases[Math.floor(Math.random() * this.catchphrases.length)];
    
    // Update usage count
    try {
      await this.pool.query(
        `UPDATE catchphrases SET usage_count = usage_count + 1 WHERE bot_id = $1 AND phrase = $2`,
        [this.botId, phrase]
      );
    } catch (e) {}
    
    return `As I always say, "${phrase}"`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUDGE ARCHAEOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check message for potential grudge triggers
   */
  detectGrudge(content) {
    for (const [type, config] of Object.entries(GRUDGE_TRIGGERS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(content)) {
          return {
            type: config.type,
            severity: config.severity,
            match: content.match(pattern)?.[0] || content.substring(0, 50)
          };
        }
      }
    }
    return null;
  }

  /**
   * Record a grudge
   */
  async recordGrudge(userId, grudgeType, offense, severity) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO grudges (bot_id, user_id, grudge_type, original_offense, severity)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.botId, userId, grudgeType, offense.substring(0, 200), severity]
      );
      console.log(`[GRUDGE] ${this.botId} recorded grudge against user: ${grudgeType}`);
    } catch (error) {
      console.error('[ADVANCED] Record grudge error:', error);
    }
  }

  /**
   * Check if should mention a grudge (random chance, not too often)
   */
  async shouldMentionGrudge(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM grudges 
         WHERE bot_id = $1 AND user_id = $2 AND forgiven = FALSE
         AND (last_mentioned IS NULL OR last_mentioned < NOW() - INTERVAL '2 hours')
         ORDER BY severity DESC, offense_date DESC
         LIMIT 1`,
        [this.botId, userId]
      );

      if (result.rows.length === 0) return null;
      
      const grudge = result.rows[0];
      
      // Chance based on severity and time
      const daysSinceOffense = (Date.now() - new Date(grudge.offense_date).getTime()) / (1000 * 60 * 60 * 24);
      const chance = (grudge.severity / 10) * Math.max(0.1, 1 - daysSinceOffense / 100);
      
      if (Math.random() < chance * 0.15) { // Max 15% chance
        return grudge;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate grudge reference message
   */
  async generateGrudgeReference(grudge) {
    const templates = GRUDGE_REFERENCES[this.botId] || GRUDGE_REFERENCES.lester;
    let template = templates[Math.floor(Math.random() * templates.length)];

    // Calculate time ago
    const daysAgo = Math.floor((Date.now() - new Date(grudge.offense_date).getTime()) / (1000 * 60 * 60 * 24));
    let timeAgo;
    if (daysAgo === 0) timeAgo = 'earlier today';
    else if (daysAgo === 1) timeAgo = 'yesterday';
    else if (daysAgo < 7) timeAgo = `${daysAgo} days ago`;
    else if (daysAgo < 30) timeAgo = `${Math.floor(daysAgo / 7)} weeks ago`;
    else timeAgo = `${Math.floor(daysAgo / 30)} months ago`;

    template = template
      .replace('{time}', timeAgo)
      .replace('{offense}', grudge.grudge_type)
      .replace('{quote}', grudge.original_offense.substring(0, 50));

    // Update mention count
    try {
      await this.pool.query(
        `UPDATE grudges SET times_mentioned = times_mentioned + 1, last_mentioned = NOW() WHERE id = $1`,
        [grudge.id]
      );
    } catch (e) {}

    return template;
  }

  /**
   * Forgive a grudge (rare, requires positive interactions)
   */
  async maybeForgivegrudge(userId, positiveInteractions = 0) {
    if (positiveInteractions < 20) return false;
    
    try {
      // Forgive oldest, lowest severity grudge
      await this.pool.query(
        `UPDATE grudges SET forgiven = TRUE, forgiven_date = NOW()
         WHERE id = (
           SELECT id FROM grudges 
           WHERE bot_id = $1 AND user_id = $2 AND forgiven = FALSE
           ORDER BY severity ASC, offense_date ASC
           LIMIT 1
         )`,
        [this.botId, userId]
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process message through all systems
   */
  async processMessage(userId, content, messageId = null) {
    await this.initialize();
    
    const results = {
      propheciesFulfilled: [],
      grudgeDetected: null,
      grudgeToMention: null,
      catchphraseToUse: null,
      secretMeeting: null
    };

    // Check prophecy fulfillment (Madam or any bot can trigger)
    results.propheciesFulfilled = await this.checkProphecyFulfillment(userId, content);

    // Check for grudge triggers
    const grudge = this.detectGrudge(content);
    if (grudge) {
      await this.recordGrudge(userId, grudge.type, grudge.match, grudge.severity);
      results.grudgeDetected = grudge;
    }

    // Maybe mention old grudge
    const oldGrudge = await this.shouldMentionGrudge(userId);
    if (oldGrudge) {
      results.grudgeToMention = await this.generateGrudgeReference(oldGrudge);
    }

    // Maybe use catchphrase
    results.catchphraseToUse = await this.maybeUseCatchphrase();

    // Maybe reveal secret meeting
    if (Math.random() < 0.05) { // 5% chance
      results.secretMeeting = await this.getSecretMeetingReference(userId);
    }

    // Track message for catchphrase potential
    if (messageId) {
      await this.trackForCatchphrase(messageId, null, userId, content);
    }

    // Maybe create secret meeting
    await this.maybeCreateSecretMeeting();

    return results;
  }

  /**
   * Build advanced context for AI prompt
   */
  async buildAdvancedContext(userId) {
    let context = '';

    // Add personality state
    context += this.buildPersonalityContext();

    // Add prophecy reference if Madam
    if (this.botId === 'madam') {
      const prophecyRef = await this.getFulfilledProphecyReference(userId);
      if (prophecyRef) {
        context += `\n[PROPHECY FULFILLED - mention this: ${prophecyRef}]\n`;
      }
    }

    // Add catchphrases
    if (this.catchphrases.length > 0) {
      context += `\n[YOUR CATCHPHRASES - use occasionally: ${this.catchphrases.slice(0, 3).join(', ')}]\n`;
    }

    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  AdvancedBehaviorSystems,
  PROPHECY_TEMPLATES,
  PERSONALITY_TRAITS,
  GRUDGE_TRIGGERS,
  GRUDGE_REFERENCES,
  MEETING_TOPICS
};
