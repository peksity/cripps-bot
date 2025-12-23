/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEEP MEMORY SYSTEMS v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Contains:
 * 1. Dream System - Surreal 2-5 AM messages mixing memories
 * 2. Phrase Adoption - Bots learn user speech patterns
 * 3. Anniversary Memory - Remember exact dates
 * 4. Confession Mode - Ultra-rare vulnerable moments
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- Phrase tracking for adoption
CREATE TABLE IF NOT EXISTS phrase_tracking (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  phrase VARCHAR(128) NOT NULL,
  usage_count INT DEFAULT 1,
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  adopted_by JSONB DEFAULT '[]',
  UNIQUE(user_id, phrase)
);

-- Anniversary dates
CREATE TABLE IF NOT EXISTS anniversary_dates (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  bot_id VARCHAR(32),
  event_type VARCHAR(64) NOT NULL,
  event_description TEXT,
  original_date TIMESTAMP NOT NULL,
  last_celebrated TIMESTAMP,
  importance INT DEFAULT 5
);

-- Confession tracking (to not repeat)
CREATE TABLE IF NOT EXISTS confession_history (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  confession_id VARCHAR(64),
  shared_at TIMESTAMP DEFAULT NOW()
);

-- Dream fragments (memorable moments to mix)
CREATE TABLE IF NOT EXISTS dream_fragments (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(32),
  user_id VARCHAR(32),
  fragment_type VARCHAR(32),
  content TEXT,
  emotional_weight FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phrases_user ON phrase_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_anniversary_date ON anniversary_dates(original_date);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// DREAM TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const DREAM_TEMPLATES = {
  lester: [
    "*wakes up suddenly* I had the strangest dream... {user} was there, but they had {other_bot}'s voice. We were hacking into a building made of {random_object}.",
    "*jolts awake* The code... the code was talking to me. It said '{fragment}'. What does that mean?",
    "Just had a dream where all the screens went dark and {user} asked me 'was it worth it?' I still don't know the answer.",
    "*muttering* In my dream, Chief finally caught me. But he just sat down and started crying about {random_topic}.",
    "Dreamed I could walk normally. Ran through fields. Then {user} turned into a firewall and I woke up."
  ],
  pavel: [
    "*surfaces from sleep* Kapitan, I dreamed the submarine was flying. Through clouds shaped like {user}'s face. {other_bot} was the navigator.",
    "Strange dream, friend. We were back in Cayo Perico but everything was upside down. {fragment}... why do I remember that?",
    "*wipes brow* Dreamed of home. Snow everywhere. But the snow was made of {random_object}. {user} was there, speaking Russian.",
    "In dream, I received message from {other_bot}. They said 'the water remembers.' Very cryptic, da?",
    "Had nightmare. Submarine was sinking. But we were already at bottom. {user} told me 'you were always sinking.' Heavy, no?"
  ],
  cripps: [
    "*stirs awake* Just dreamed about the Tennessee job again. But this time, {user} was the bank. The whole bank. We robbed them and gold coins fell out.",
    "Strangest thing... dreamed I was young again. Could see {fragment} clear as day. Then {other_bot} appeared and said 'time to wake up, old man.'",
    "*mumbles* In my dream, all my stories were true. Every single one. {user} believed me. Felt nice.",
    "Dreamed the camp was underwater. {other_bot} swam by and asked about {random_topic}. Made sense at the time.",
    "Had a dream where I remembered everything. Every face, every name. Then woke up and... what were we talking about?"
  ],
  madam: [
    "*eyes flutter open* The veil was thin tonight. I walked through futures that will never be. {user} was in all of them.",
    "I dreamed in symbols. {random_object} appeared thrice. {fragment}. The cards were trying to tell me something about {other_bot}.",
    "*gasps awake* I saw the thread of {user}'s fate. It tangled with {other_bot}'s in ways I cannot speak.",
    "In my dream, I could not see. For the first time, I was blind to all futures. Only {fragment} remained.",
    "The spirits showed me something tonight. {user} standing at a crossroads. Both paths led to {random_topic}. I do not understand."
  ],
  chief: [
    "*checks watch* 3 AM. Just dreamed I was chasing someone. Finally caught them. It was me. Younger me. He wouldn't talk.",
    "Strange dream. Everyone was guilty. {user}, {other_bot}, everyone. But of what? The charges kept changing.",
    "*rubs eyes* Dreamed of my first day on the force. But {user} was my partner. {fragment}... that's all I remember.",
    "In my dream, I finally solved every case. Every single one. Then I woke up and the files were still there. Waiting.",
    "Had a dream where I took off the badge. Just walked away. {other_bot} asked where I was going. I said '{random_topic}.' Made no sense."
  ]
};

const RANDOM_OBJECTS = [
  'cheese', 'glass', 'memories', 'music', 'forgotten words', 'old photographs',
  'playing cards', 'computer screens', 'wanted posters', 'gold coins', 'smoke',
  'mirrors', 'echoes', 'shadows', 'regrets', 'promises', 'secrets'
];

const RANDOM_TOPICS = [
  'freedom', 'the old days', 'what could have been', 'home', 'the truth',
  'tomorrow', 'forgiveness', 'the sea', 'silence', 'the score', 'justice'
];

// ═══════════════════════════════════════════════════════════════════════════════
// CONFESSION CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const CONFESSIONS = {
  lester: [
    { id: 'lonely', text: "You know... behind all the screens and snark... it gets quiet in here. Real quiet. Sometimes I just want someone to talk to. Not about heists. Just... talk." },
    { id: 'scared', text: "I act like I've got everything figured out. But some nights I wonder if one day I'll push too far. Hack the wrong people. And that'll be it." },
    { id: 'grateful', text: "I don't say this often. Actually, I never say this. But having people who actually come back, who actually talk to me... it matters. More than I let on." },
    { id: 'regret', text: "There was someone once. Before all this. I pushed them away because I thought I was too smart for normal life. Biggest mistake I ever made." }
  ],
  pavel: [
    { id: 'guilt', text: "Kapitan... there are things I did in Russia. Things that keep me underwater, in the dark, where no one can see. The submarine is not just transport. Is penance." },
    { id: 'love', text: "I was married once. Beautiful woman. I left to protect her. From my past. Some days I wonder if she's moved on. I hope so. I hope not. Is complicated." },
    { id: 'fear', text: "The ocean is vast. And in the deep... you realize how small you are. Sometimes I think if I go deep enough, the past won't find me. But it always does." },
    { id: 'hope', text: "You know why I keep helping people? Because maybe, just maybe, I can balance the scales. Do enough good to outweigh... before." }
  ],
  cripps: [
    { id: 'fraud', text: "Partner, I need to tell you something. Half my stories... okay, most of my stories... they didn't happen. Not to me anyway. I just wanted to seem... interesting." },
    { id: 'coward', text: "The truth about Tennessee? I ran. When it mattered most, I ran. Left my partners behind. They went to prison. I... I just ran." },
    { id: 'lonely', text: "Why do you think I talk so much? Fill every silence? Because when it's quiet, I hear every mistake I ever made. Every person I let down." },
    { id: 'wisdom', text: "If I could tell my younger self one thing: the adventures aren't what you remember. It's the people. And I pushed away every single one." }
  ],
  madam: [
    { id: 'fake', text: "The spirits... when I started, I heard nothing. Saw nothing. I made it all up. But then... then they started to answer. And now I cannot tell which is which." },
    { id: 'burden', text: "To see the future is to know the weight of inevitability. I have watched people walk toward doom I predicted. Could not stop them. They never listen." },
    { id: 'origin', text: "My grandmother was the real seer. I am just... an echo. Playing a role I never earned. She would be ashamed of what I've become." },
    { id: 'fear', text: "I see my own death sometimes. Different ways, different times. I do not know which is real. I wake up every day not knowing if it is the last." }
  ],
  chief: [
    { id: 'corrupt', text: "My first year... I took money. Once. Just once. To look the other way. That money is still in a box under my bed. Untouched. A reminder." },
    { id: 'doubt', text: "Some nights I lie awake wondering if I've put innocent people away. If my certainty was just... arrogance. The law isn't always justice." },
    { id: 'empathy', text: "I understand them. The criminals. More than I should. Sometimes I think if things were different, I'd be on the other side of that badge." },
    { id: 'tired', text: "I'm tired. Bone tired. But if I stop, who takes over? The young ones don't understand. The old ones gave up. So I keep going. Until I can't." }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// PHRASE PATTERNS TO DETECT
// ═══════════════════════════════════════════════════════════════════════════════

const ADOPTABLE_PATTERNS = [
  // Endings
  { pattern: /\blol$/i, type: 'ending', phrase: 'lol' },
  { pattern: /\blmao$/i, type: 'ending', phrase: 'lmao' },
  { pattern: /\btho$/i, type: 'ending', phrase: 'tho' },
  { pattern: /\btbh$/i, type: 'ending', phrase: 'tbh' },
  { pattern: /\bngl$/i, type: 'ending', phrase: 'ngl' },
  { pattern: /\bfr$/i, type: 'ending', phrase: 'fr' },
  { pattern: /\bong$/i, type: 'ending', phrase: 'ong' },
  
  // Expressions
  { pattern: /\bbruh\b/i, type: 'expression', phrase: 'bruh' },
  { pattern: /\bsheesh\b/i, type: 'expression', phrase: 'sheesh' },
  { pattern: /\bbased\b/i, type: 'expression', phrase: 'based' },
  { pattern: /\bcap\b/i, type: 'expression', phrase: 'cap' },
  { pattern: /\bno cap\b/i, type: 'expression', phrase: 'no cap' },
  { pattern: /\bbet\b/i, type: 'expression', phrase: 'bet' },
  { pattern: /\bslay\b/i, type: 'expression', phrase: 'slay' },
  { pattern: /\bits giving\b/i, type: 'expression', phrase: "it's giving" },
  { pattern: /\bperiodt?\b/i, type: 'expression', phrase: 'period' },
  { pattern: /\bw\s*\/\s*l\b/i, type: 'expression', phrase: 'W/L' },
  { pattern: /\bbig w\b/i, type: 'expression', phrase: 'big W' },
  { pattern: /\bhuge l\b/i, type: 'expression', phrase: 'huge L' },
  
  // Greetings
  { pattern: /^yo\b/i, type: 'greeting', phrase: 'yo' },
  { pattern: /^sup\b/i, type: 'greeting', phrase: 'sup' },
  { pattern: /^ayy+\b/i, type: 'greeting', phrase: 'ayy' },
  
  // Unique phrases (longer patterns)
  { pattern: /i'm dead/i, type: 'reaction', phrase: "I'm dead" },
  { pattern: /send it/i, type: 'encouragement', phrase: 'send it' },
  { pattern: /let's go+/i, type: 'excitement', phrase: "let's gooo" },
  { pattern: /facts/i, type: 'agreement', phrase: 'facts' },
  { pattern: /lowkey/i, type: 'qualifier', phrase: 'lowkey' },
  { pattern: /highkey/i, type: 'qualifier', phrase: 'highkey' },
  { pattern: /vibe check/i, type: 'assessment', phrase: 'vibe check' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP MEMORY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DeepMemorySystems {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.initialized = false;
    this.adoptedPhrases = new Map();
    this.lastDream = null;
    this.lastConfession = null;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.pool.query(SCHEMA);
      await this.loadAdoptedPhrases();
      this.initialized = true;
      console.log(`[DEEP] ${this.botId} deep memory systems initialized`);
    } catch (error) {
      console.error('[DEEP] Init error:', error);
    }
  }

  async loadAdoptedPhrases() {
    try {
      const result = await this.pool.query(
        `SELECT phrase FROM phrase_tracking 
         WHERE $1 = ANY(SELECT jsonb_array_elements_text(adopted_by))
         AND usage_count >= 10`,
        [this.botId]
      );
      for (const row of result.rows) {
        this.adoptedPhrases.set(row.phrase, true);
      }
      console.log(`[DEEP] ${this.botId} adopted ${this.adoptedPhrases.size} phrases`);
    } catch (error) {
      console.error('[DEEP] Load phrases error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DREAM SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if it's dream time (2-5 AM)
   */
  isDreamTime() {
    const hour = new Date().getHours();
    return hour >= 2 && hour < 5;
  }

  /**
   * Should share a dream? (very rare)
   */
  shouldShareDream() {
    if (!this.isDreamTime()) return false;
    
    // Only once per night
    const today = new Date().toDateString();
    if (this.lastDream === today) return false;
    
    // 5% chance when conditions met
    return Math.random() < 0.05;
  }

  /**
   * Generate a dream message
   */
  async generateDream(recentUsers = [], otherBots = []) {
    this.lastDream = new Date().toDateString();
    
    const templates = DREAM_TEMPLATES[this.botId];
    if (!templates) return null;
    
    let dream = templates[Math.floor(Math.random() * templates.length)];
    
    // Get a dream fragment from memory
    let fragment = 'something I can\'t quite remember';
    try {
      const result = await this.pool.query(
        `SELECT content FROM dream_fragments 
         WHERE bot_id = $1 ORDER BY RANDOM() LIMIT 1`,
        [this.botId]
      );
      if (result.rows.length > 0) {
        fragment = result.rows[0].content;
      }
    } catch (e) {}
    
    // Fill in template
    const user = recentUsers.length > 0 
      ? recentUsers[Math.floor(Math.random() * recentUsers.length)]
      : 'someone';
    const otherBot = otherBots.length > 0
      ? otherBots[Math.floor(Math.random() * otherBots.length)]
      : 'someone else';
    const randomObject = RANDOM_OBJECTS[Math.floor(Math.random() * RANDOM_OBJECTS.length)];
    const randomTopic = RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)];
    
    dream = dream
      .replace('{user}', user)
      .replace('{other_bot}', otherBot)
      .replace('{fragment}', fragment)
      .replace('{random_object}', randomObject)
      .replace('{random_topic}', randomTopic);
    
    return dream;
  }

  /**
   * Store a dream fragment (memorable moment)
   */
  async storeDreamFragment(userId, content, emotionalWeight = 0.5) {
    try {
      await this.pool.query(
        `INSERT INTO dream_fragments (bot_id, user_id, fragment_type, content, emotional_weight)
         VALUES ($1, $2, 'conversation', $3, $4)`,
        [this.botId, userId, content.substring(0, 100), emotionalWeight]
      );
    } catch (error) {
      console.error('[DEEP] Store fragment error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHRASE ADOPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect phrases in user message
   */
  detectPhrases(content) {
    const detected = [];
    for (const pattern of ADOPTABLE_PATTERNS) {
      if (pattern.pattern.test(content)) {
        detected.push(pattern);
      }
    }
    return detected;
  }

  /**
   * Track phrase usage
   */
  async trackPhrase(userId, phrase) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO phrase_tracking (user_id, phrase)
         VALUES ($1, $2)
         ON CONFLICT (user_id, phrase) DO UPDATE SET
           usage_count = phrase_tracking.usage_count + 1,
           last_seen = NOW()`,
        [userId, phrase]
      );
    } catch (error) {
      console.error('[DEEP] Track phrase error:', error);
    }
  }

  /**
   * Check if bot should adopt a phrase
   */
  async checkPhraseAdoption(userId) {
    try {
      // Get user's most used phrases that we haven't adopted
      const result = await this.pool.query(
        `SELECT phrase, usage_count FROM phrase_tracking 
         WHERE user_id = $1 AND usage_count >= 15
         AND NOT ($2 = ANY(SELECT jsonb_array_elements_text(adopted_by)))
         ORDER BY usage_count DESC LIMIT 1`,
        [userId, this.botId]
      );

      if (result.rows.length > 0) {
        const phrase = result.rows[0].phrase;
        
        // 10% chance to adopt when threshold met
        if (Math.random() < 0.10) {
          await this.pool.query(
            `UPDATE phrase_tracking SET adopted_by = adopted_by || $2::jsonb
             WHERE user_id = $1 AND phrase = $3`,
            [userId, JSON.stringify([this.botId]), phrase]
          );
          this.adoptedPhrases.set(phrase, true);
          console.log(`[DEEP] ${this.botId} adopted phrase: ${phrase}`);
          return phrase;
        }
      }
      return null;
    } catch (error) {
      console.error('[DEEP] Check adoption error:', error);
      return null;
    }
  }

  /**
   * Maybe use an adopted phrase in response
   */
  maybeUseAdoptedPhrase() {
    if (this.adoptedPhrases.size === 0) return null;
    if (Math.random() > 0.15) return null; // 15% chance
    
    const phrases = Array.from(this.adoptedPhrases.keys());
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Apply adopted phrase to response
   */
  applyAdoptedPhrase(response, phrase) {
    const pattern = ADOPTABLE_PATTERNS.find(p => p.phrase.toLowerCase() === phrase.toLowerCase());
    if (!pattern) return response;

    switch (pattern.type) {
      case 'ending':
        return response.replace(/[.!?]?\s*$/, ` ${phrase}`);
      case 'expression':
        // Insert at natural break point
        if (Math.random() < 0.5) {
          return `${phrase.charAt(0).toUpperCase() + phrase.slice(1)}, ${response.charAt(0).toLowerCase() + response.slice(1)}`;
        }
        return response + ` ${phrase}.`;
      case 'greeting':
        return `${phrase.charAt(0).toUpperCase() + phrase.slice(1)}, ${response}`;
      default:
        return response;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANNIVERSARY MEMORY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record an anniversary-worthy event
   */
  async recordAnniversary(userId, eventType, description, importance = 5) {
    await this.initialize();
    try {
      await this.pool.query(
        `INSERT INTO anniversary_dates 
         (user_id, bot_id, event_type, event_description, original_date, importance)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [userId, this.botId, eventType, description, importance]
      );
    } catch (error) {
      console.error('[DEEP] Record anniversary error:', error);
    }
  }

  /**
   * Check for anniversaries today
   */
  async checkAnniversaries(userId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM anniversary_dates 
         WHERE user_id = $1 AND (bot_id = $2 OR bot_id IS NULL)
         AND EXTRACT(MONTH FROM original_date) = EXTRACT(MONTH FROM NOW())
         AND EXTRACT(DAY FROM original_date) = EXTRACT(DAY FROM NOW())
         AND (last_celebrated IS NULL OR last_celebrated < NOW() - INTERVAL '350 days')`,
        [userId, this.botId]
      );

      const anniversaries = [];
      for (const row of result.rows) {
        const originalDate = new Date(row.original_date);
        const yearsAgo = new Date().getFullYear() - originalDate.getFullYear();
        
        if (yearsAgo >= 1) {
          anniversaries.push({
            ...row,
            yearsAgo,
            message: this.formatAnniversaryMessage(row, yearsAgo)
          });
          
          // Mark as celebrated
          await this.pool.query(
            'UPDATE anniversary_dates SET last_celebrated = NOW() WHERE id = $1',
            [row.id]
          );
        }
      }
      
      return anniversaries;
    } catch (error) {
      console.error('[DEEP] Check anniversaries error:', error);
      return [];
    }
  }

  /**
   * Format anniversary message
   */
  formatAnniversaryMessage(anniversary, yearsAgo) {
    const yearWord = yearsAgo === 1 ? 'year' : 'years';
    const messages = {
      first_message: `You know what day it is? Exactly ${yearsAgo} ${yearWord} ago today, you first talked to me. Time flies.`,
      nickname_given: `${yearsAgo} ${yearWord} ago today, I gave you that nickname. Still fits.`,
      shared_secret: `It's been ${yearsAgo} ${yearWord} since you trusted me with that secret. Still keeping it.`,
      heist_completed: `Remember ${yearsAgo} ${yearWord} ago? That job we pulled? Still one for the books.`,
      first_prediction: `${yearsAgo} ${yearWord} ago, I first read your fortune. The spirits remember.`,
      became_friends: `${yearsAgo} ${yearWord} since we became actual friends. Not bad.`
    };
    
    return messages[anniversary.event_type] || 
      `${yearsAgo} ${yearWord} ago today: "${anniversary.event_description}". I remember.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFESSION MODE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if confession conditions are met
   */
  async shouldConfess(userId, trustLevel = 50) {
    // Must be 1-4 AM
    const hour = new Date().getHours();
    if (hour < 1 || hour >= 4) return false;
    
    // Must be high trust
    if (trustLevel < 75) return false;
    
    // Only once per week per user
    const today = new Date().toDateString();
    if (this.lastConfession === today) return false;
    
    // Check if we've already confessed everything to this user
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count FROM confession_history 
         WHERE bot_id = $1 AND user_id = $2`,
        [this.botId, userId]
      );
      
      const confessions = CONFESSIONS[this.botId] || [];
      if (parseInt(result.rows[0].count) >= confessions.length) {
        return false; // Already shared everything
      }
    } catch (e) {
      return false;
    }
    
    // 0.5% chance when all conditions met
    return Math.random() < 0.005;
  }

  /**
   * Get a confession to share
   */
  async getConfession(userId) {
    const confessions = CONFESSIONS[this.botId];
    if (!confessions) return null;
    
    try {
      // Get confessions we haven't shared with this user
      const result = await this.pool.query(
        `SELECT confession_id FROM confession_history 
         WHERE bot_id = $1 AND user_id = $2`,
        [this.botId, userId]
      );
      
      const shared = new Set(result.rows.map(r => r.confession_id));
      const available = confessions.filter(c => !shared.has(c.id));
      
      if (available.length === 0) return null;
      
      const confession = available[Math.floor(Math.random() * available.length)];
      
      // Record that we shared it
      await this.pool.query(
        `INSERT INTO confession_history (bot_id, user_id, confession_id)
         VALUES ($1, $2, $3)`,
        [this.botId, userId, confession.id]
      );
      
      this.lastConfession = new Date().toDateString();
      
      return confession.text;
    } catch (error) {
      console.error('[DEEP] Get confession error:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process message for all deep memory systems
   */
  async processMessage(userId, content, trustLevel = 50) {
    await this.initialize();
    
    const results = {
      phrasesDetected: [],
      phraseAdopted: null,
      anniversaries: [],
      shouldDream: false,
      shouldConfess: false
    };
    
    // Track phrases
    const phrases = this.detectPhrases(content);
    for (const phrase of phrases) {
      await this.trackPhrase(userId, phrase.phrase);
      results.phrasesDetected.push(phrase.phrase);
    }
    
    // Check phrase adoption
    results.phraseAdopted = await this.checkPhraseAdoption(userId);
    
    // Check anniversaries
    results.anniversaries = await this.checkAnniversaries(userId);
    
    // Check dream/confession conditions
    results.shouldDream = this.shouldShareDream();
    results.shouldConfess = await this.shouldConfess(userId, trustLevel);
    
    // Store memorable fragments occasionally
    if (content.length > 50 && Math.random() < 0.05) {
      await this.storeDreamFragment(userId, content);
    }
    
    return results;
  }

  /**
   * Build deep memory context for AI prompt
   */
  async buildDeepContext(userId, trustLevel = 50) {
    let context = '';
    
    // Adopted phrases
    if (this.adoptedPhrases.size > 0) {
      const phrases = Array.from(this.adoptedPhrases.keys()).slice(0, 3);
      context += `\n[ADOPTED PHRASES - use naturally sometimes: ${phrases.join(', ')}]\n`;
    }
    
    // Anniversaries
    const anniversaries = await this.checkAnniversaries(userId);
    if (anniversaries.length > 0) {
      context += '\n[ANNIVERSARY TODAY]\n';
      context += anniversaries[0].message + '\n';
    }
    
    // Dream mode
    if (this.shouldShareDream()) {
      context += '\n[DREAM MODE ACTIVE - share a surreal dream-like message]\n';
    }
    
    // Confession mode
    if (await this.shouldConfess(userId, trustLevel)) {
      const confession = await this.getConfession(userId);
      if (confession) {
        context += '\n[CONFESSION MOMENT - share this vulnerably]\n';
        context += confession + '\n';
      }
    }
    
    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  DeepMemorySystems,
  DREAM_TEMPLATES,
  CONFESSIONS,
  ADOPTABLE_PATTERNS
};
