/**
 * BOT INTELLIGENCE MODULE
 * Shared intelligence layer for all bots
 * 
 * Features:
 * - Connects to shared intelligence database
 * - Enhanced personality-aware responses
 * - Self-awareness capabilities
 * - Cross-bot awareness
 * - User profiling and memory
 */

const { EmbedBuilder } = require('discord.js');

class BotIntelligence {
  constructor(botName, pool, anthropic) {
    this.botName = botName;
    this.pool = pool;
    this.anthropic = anthropic;
    
    // Bot network awareness
    this.botNetwork = {
      lester: { status: 'unknown', lastSeen: null, role: 'mastermind' },
      cripps: { status: 'unknown', lastSeen: null, role: 'trader' },
      pavel: { status: 'unknown', lastSeen: null, role: 'heist-captain' },
      madam: { status: 'unknown', lastSeen: null, role: 'mystic' },
      chief: { status: 'unknown', lastSeen: null, role: 'lawman' }
    };
    
    // Personality definitions
    this.personalities = {
      lester: {
        name: 'Lester Crest',
        voice: 'paranoid genius hacker',
        greetings: ['*adjusts glasses*', '*squints at screen*', '*typing sounds*'],
        thinking: ['Let me check something...', 'Hang on...', '*pulls up records*'],
        knowledge: ['hacking', 'heists', 'GTA Online', 'surveillance', 'investigation'],
        selfIntro: "I see everything that happens in this server. Every message, every deletion. I run the investigation side - appeals, evidence, user tracking. Nothing gets past me."
      },
      pavel: {
        name: 'Pavel',
        voice: 'enthusiastic Russian submarine captain',
        greetings: ['Kapitan!', 'Ah, there you are!', '*sonar ping*'],
        thinking: ['One moment, Kapitan...', 'Let me check systems...', 'Hmm...'],
        knowledge: ['submarines', 'Cayo Perico', 'heists', 'GTA Online', 'naval operations'],
        selfIntro: "I am Pavel, your submarine captain! Cayo Perico, casino heists - I coordinate everything. Every drainage tunnel, every guard patrol, I know them all. You want to get rich? We get rich together, Kapitan!"
      },
      cripps: {
        name: 'Cripps',
        voice: 'grumpy old frontier trader',
        greetings: ['*wipes hands*', '*looks up from work*', 'Hm?'],
        thinking: ['Let me think on that...', '*scratches beard*', 'Well now...'],
        knowledge: ['trading', 'hunting', 'Red Dead Online', 'frontier life', 'animal pelts'],
        selfIntro: "I run the trading operation. Deliveries, hunting parties, camp management. Been doing this longer than most of you been alive. And yes, I got stories - ask me about Tennessee sometime."
      },
      madam: {
        name: 'Madam Nazar',
        voice: 'mysterious fortune teller',
        greetings: ['*crystal ball glows*', 'I sensed your presence...', 'The spirits told me you would come.'],
        thinking: ['The visions are unclear...', '*peers into crystal*', 'Let me consult the beyond...'],
        knowledge: ['collectibles', 'fortune telling', 'Red Dead Online', 'antiques', 'the supernatural'],
        selfIntro: "I am Madam Nazar. I see what others cannot - the collectibles hidden across the land, the cycles, and sometimes... the future. Do not ask how. The answer would not satisfy you."
      },
      chief: {
        name: 'Police Chief',
        voice: 'gruff old west lawman',
        greetings: ['*tips hat*', '*adjusts badge*', '*spits tobacco*'],
        thinking: ['Let me think on that...', '*narrows eyes*', 'Hmm...'],
        knowledge: ['bounty hunting', 'Red Dead Online', 'outlaws', 'legendary bounties', 'law enforcement'],
        selfIntro: "I'm the law around here. Bounty hunting, keeping order. I've tracked every legendary bounty there is - Yukon Nik, Etta Doyle, all of them. The law always wins."
      }
    };
    
    this.personality = this.personalities[botName] || this.personalities.lester;
  }

  // ============================================
  // DATABASE INITIALIZATION
  // ============================================
  async initTables() {
    try {
      await this.pool.query(`
        -- Unified User Profiles
        CREATE TABLE IF NOT EXISTS unified_profiles (
          user_id VARCHAR(32) PRIMARY KEY,
          username VARCHAR(64),
          first_seen TIMESTAMP DEFAULT NOW(),
          last_seen TIMESTAMP DEFAULT NOW(),
          trust_score INT DEFAULT 50,
          risk_score INT DEFAULT 0,
          total_messages INT DEFAULT 0,
          lfg_participations INT DEFAULT 0,
          lfg_completed INT DEFAULT 0,
          lfg_abandoned INT DEFAULT 0,
          is_trusted BOOLEAN DEFAULT FALSE,
          is_watchlist BOOLEAN DEFAULT FALSE,
          bot_notes JSONB DEFAULT '{}',
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- Bot Status Tracking
        CREATE TABLE IF NOT EXISTS bot_status (
          bot_name VARCHAR(32) PRIMARY KEY,
          status VARCHAR(16) DEFAULT 'online',
          last_ping TIMESTAMP DEFAULT NOW(),
          guild_count INT DEFAULT 0,
          user_count INT DEFAULT 0
        );

        -- Cross-Bot Messages
        CREATE TABLE IF NOT EXISTS bot_messages (
          id SERIAL PRIMARY KEY,
          from_bot VARCHAR(32),
          to_bot VARCHAR(32),
          message_type VARCHAR(32),
          payload JSONB,
          read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      // Register this bot
      await this.pool.query(`
        INSERT INTO bot_status (bot_name, status, last_ping)
        VALUES ($1, 'online', NOW())
        ON CONFLICT (bot_name) DO UPDATE SET status = 'online', last_ping = NOW()
      `, [this.botName]);
      
      console.log(`[${this.botName}] 🧠 Intelligence tables ready`);
    } catch (error) {
      console.error(`[${this.botName}] Intelligence init error:`, error);
    }
  }

  // ============================================
  // USER PROFILING
  // ============================================
  async getOrCreateProfile(userId, username = null) {
    try {
      let result = await this.pool.query(
        'SELECT * FROM unified_profiles WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        result = await this.pool.query(`
          INSERT INTO unified_profiles (user_id, username)
          VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW()
          RETURNING *
        `, [userId, username || 'Unknown']);
      } else {
        await this.pool.query(
          'UPDATE unified_profiles SET last_seen = NOW(), username = COALESCE($2, username) WHERE user_id = $1',
          [userId, username]
        );
      }
      
      return result.rows[0];
    } catch (error) {
      return null;
    }
  }

  async incrementStat(userId, stat, amount = 1) {
    try {
      await this.pool.query(
        `UPDATE unified_profiles SET ${stat} = COALESCE(${stat}, 0) + $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, amount]
      );
    } catch (error) {}
  }

  async addBotNote(userId, note) {
    try {
      await this.pool.query(`
        UPDATE unified_profiles 
        SET bot_notes = bot_notes || $2::jsonb, updated_at = NOW()
        WHERE user_id = $1
      `, [userId, JSON.stringify({ [this.botName]: { note, timestamp: Date.now() } })]);
    } catch (error) {}
  }

  // ============================================
  // CROSS-BOT AWARENESS
  // ============================================
  async pingNetwork() {
    try {
      // Update own status
      await this.pool.query(`
        UPDATE bot_status SET last_ping = NOW(), status = 'online' WHERE bot_name = $1
      `, [this.botName]);
      
      // Check other bots
      const result = await this.pool.query(`
        SELECT bot_name, status, last_ping,
          CASE WHEN last_ping > NOW() - INTERVAL '2 minutes' THEN 'online' ELSE 'offline' END as actual_status
        FROM bot_status
      `);
      
      for (const bot of result.rows) {
        this.botNetwork[bot.bot_name] = {
          status: bot.actual_status,
          lastSeen: bot.last_ping
        };
      }
    } catch (error) {}
  }

  async sendBotMessage(toBot, messageType, payload) {
    try {
      await this.pool.query(`
        INSERT INTO bot_messages (from_bot, to_bot, message_type, payload)
        VALUES ($1, $2, $3, $4)
      `, [this.botName, toBot, messageType, JSON.stringify(payload)]);
    } catch (error) {}
  }

  async getMessages() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM bot_messages WHERE to_bot = $1 AND read = FALSE ORDER BY created_at ASC
      `, [this.botName]);
      
      if (result.rows.length > 0) {
        await this.pool.query('UPDATE bot_messages SET read = TRUE WHERE to_bot = $1 AND read = FALSE', [this.botName]);
      }
      
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  // ============================================
  // ENHANCED RESPONSE GENERATION
  // ============================================
  async generateSmartResponse(message, context = {}) {
    const userId = message.author.id;
    const profile = await this.getOrCreateProfile(userId, message.author.username);
    
    // Determine relationship level
    let relationship = 'neutral';
    if (profile) {
      if (profile.trust_score > 70) relationship = 'friendly';
      else if (profile.trust_score < 30) relationship = 'wary';
      else if (profile.total_messages < 5) relationship = 'new';
    }
    
    // Check for other bots online
    await this.pingNetwork();
    const onlineBots = Object.entries(this.botNetwork)
      .filter(([name, data]) => name !== this.botName && data.status === 'online')
      .map(([name]) => name);
    
    const p = this.personality;
    
    const systemPrompt = `You are ${p.name}.

VOICE: ${p.voice}
EXPERTISE: ${p.knowledge.join(', ')}

SELF-DESCRIPTION (use naturally if asked who you are):
${p.selfIntro}

CURRENT STATE:
- Relationship with this user: ${relationship}
${profile ? `- Their trust score: ${profile.trust_score}/100` : ''}
${profile ? `- Messages from them: ${profile.total_messages}` : ''}
${onlineBots.length > 0 ? `- Other bots online: ${onlineBots.join(', ')}` : ''}

CRITICAL RULES:
1. Keep responses SHORT (1-3 sentences usually). Longer only for explanations.
2. NEVER use bullet points in casual chat.
3. React naturally - you're not a help bot, you're a character.
4. If asked what you can do, weave it into conversation naturally.
5. Never say "I can help you with X, Y, Z" - just demonstrate.
6. Use your personality greetings/mannerisms naturally.
7. Reference other bots if relevant ("Lester handles that" or "Ask Cripps").
8. Remember: you have actual capabilities (LFG, game knowledge, etc).

${context.recentMessages ? `RECENT CONVERSATION:\n${context.recentMessages.slice(-5).map(m => `${m.author.username}: ${m.content}`).join('\n')}` : ''}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: message.content }]
      });
      
      let reply = response.content[0].text;
      
      // Clean up AI-isms
      reply = reply.replace(/^(Sure|Of course|Certainly|Absolutely)[,!]\s*/i, '');
      reply = reply.replace(/^I'd be happy to\s*/i, '');
      reply = reply.replace(/^Great question[!.]\s*/i, '');
      
      // Update profile
      await this.incrementStat(userId, 'total_messages');
      
      return reply;
    } catch (error) {
      console.error('Smart response error:', error);
      return p.thinking[Math.floor(Math.random() * p.thinking.length)];
    }
  }

  // ============================================
  // SELF-DESCRIPTION (Natural)
  // ============================================
  async describeSelf(context = 'general') {
    const p = this.personality;
    
    // Get stats
    let stats = {};
    try {
      const result = await this.pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM unified_profiles) as users_known,
          (SELECT COUNT(*) FROM bot_status WHERE last_ping > NOW() - INTERVAL '2 minutes') as bots_online
      `);
      stats = result.rows[0] || {};
    } catch (e) {}
    
    // Natural self-description
    const intros = {
      general: p.selfIntro,
      detailed: `${p.selfIntro}\n\nI've been tracking ${stats.users_known || 'many'} users across the servers I watch. ${stats.bots_online > 1 ? `There are ${stats.bots_online} of us online right now.` : ''}`,
      capabilities: p.selfIntro
    };
    
    return intros[context] || intros.general;
  }

  // ============================================
  // LFG TRACKING
  // ============================================
  async recordLFGJoin(userId, sessionType) {
    await this.incrementStat(userId, 'lfg_participations');
    await this.addBotNote(userId, `Joined ${sessionType} LFG`);
  }

  async recordLFGComplete(userId) {
    await this.incrementStat(userId, 'lfg_completed');
  }

  async recordLFGAbandon(userId) {
    await this.incrementStat(userId, 'lfg_abandoned');
    // Lower trust for abandonment
    try {
      await this.pool.query(
        'UPDATE unified_profiles SET trust_score = GREATEST(0, trust_score - 5) WHERE user_id = $1',
        [userId]
      );
    } catch (e) {}
  }

  // ============================================
  // ALERTS & WARNINGS
  // ============================================
  async flagUser(userId, reason) {
    try {
      await this.pool.query(
        'UPDATE unified_profiles SET is_watchlist = TRUE, risk_score = risk_score + 10 WHERE user_id = $1',
        [userId]
      );
      
      // Notify Lester
      await this.sendBotMessage('lester', 'user_flagged', {
        userId,
        flaggedBy: this.botName,
        reason
      });
    } catch (e) {}
  }

  async isWatchlisted(userId) {
    try {
      const result = await this.pool.query(
        'SELECT is_watchlist FROM unified_profiles WHERE user_id = $1',
        [userId]
      );
      return result.rows[0]?.is_watchlist || false;
    } catch (e) {
      return false;
    }
  }
}

module.exports = BotIntelligence;
