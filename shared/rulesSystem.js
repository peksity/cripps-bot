/**
 * SMART RULES SYSTEM - Lester's Rule Enforcement
 * 
 * Features:
 * - Stores all server rules with unique IDs
 * - AI-powered rule violation detection
 * - Smart warnings (not false positives)
 * - Links to specific rules
 * - Learning from context
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');

class RulesSystem {
  constructor(pool, anthropic) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.rulesCache = new Map();
    this.recentWarnings = new Map(); // Prevent spam
  }

  // ============================================
  // DATABASE SETUP
  // ============================================
  async initDatabase() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS server_rules (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(16) UNIQUE,
        guild_id VARCHAR(32),
        category VARCHAR(64),
        title VARCHAR(128),
        description TEXT,
        examples TEXT,
        severity VARCHAR(16) DEFAULT 'warning',
        auto_enforce BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS rule_violations (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(16),
        user_id VARCHAR(32),
        user_name VARCHAR(64),
        message_id VARCHAR(32),
        message_content TEXT,
        channel_id VARCHAR(32),
        confidence FLOAT,
        action_taken VARCHAR(32),
        false_positive BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ Rules database initialized');
  }

  // ============================================
  // RULE MANAGEMENT
  // ============================================
  async addRule(guildId, rule) {
    const ruleId = `R${String(await this.getNextRuleNumber(guildId)).padStart(2, '0')}`;
    
    await this.pool.query(`
      INSERT INTO server_rules (rule_id, guild_id, category, title, description, examples, severity, auto_enforce)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      ruleId,
      guildId,
      rule.category,
      rule.title,
      rule.description,
      rule.examples || '',
      rule.severity || 'warning',
      rule.autoEnforce !== false
    ]);
    
    this.rulesCache.delete(guildId);
    return ruleId;
  }

  async getNextRuleNumber(guildId) {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM server_rules WHERE guild_id = $1',
      [guildId]
    );
    return parseInt(result.rows[0].count) + 1;
  }

  async getRules(guildId) {
    if (this.rulesCache.has(guildId)) {
      return this.rulesCache.get(guildId);
    }
    
    const result = await this.pool.query(
      'SELECT * FROM server_rules WHERE guild_id = $1 ORDER BY rule_id',
      [guildId]
    );
    
    this.rulesCache.set(guildId, result.rows);
    return result.rows;
  }

  async getRule(guildId, ruleId) {
    const result = await this.pool.query(
      'SELECT * FROM server_rules WHERE guild_id = $1 AND rule_id = $2',
      [guildId, ruleId]
    );
    return result.rows[0];
  }

  // ============================================
  // DEFAULT RULES FOR THE UNPATCHED METHOD
  // ============================================
  async setupDefaultRules(guildId) {
    const defaultRules = [
      {
        category: 'Respect',
        title: 'Be Respectful',
        description: 'Treat all members with respect. No harassment, bullying, hate speech, discrimination, or personal attacks.',
        examples: 'Slurs, targeted harassment, making fun of someone repeatedly, discriminatory remarks',
        severity: 'warning'
      },
      {
        category: 'Content',
        title: 'No NSFW Content',
        description: 'Keep all content SFW (Safe For Work). No explicit images, videos, or discussions.',
        examples: 'Pornographic content, graphic violence, gore, sexual discussions',
        severity: 'ban'
      },
      {
        category: 'Spam',
        title: 'No Spam or Excessive Self-Promotion',
        description: 'Don\'t spam messages, emojis, or links. Self-promotion requires mod approval.',
        examples: 'Repeated messages, excessive caps, uninvited server invites, repeated advertising',
        severity: 'mute'
      },
      {
        category: 'Channels',
        title: 'Use Correct Channels',
        description: 'Post content in the appropriate channels. LFG posts go in LFG channels, chat goes in chat channels.',
        examples: 'Posting LFG requests in general chat, random chat in LFG channels',
        severity: 'warning'
      },
      {
        category: 'Glitches',
        title: 'No Real-Money Exploits',
        description: 'We focus on legitimate in-game money glitches only. No real money scams, account selling, or modded money.',
        examples: 'Selling modded accounts, real money trading, account recovery scams',
        severity: 'ban'
      },
      {
        category: 'Safety',
        title: 'No Personal Information',
        description: 'Don\'t share or request personal information like addresses, phone numbers, or real names.',
        examples: 'Doxxing, asking for someone\'s address, sharing private info',
        severity: 'ban'
      },
      {
        category: 'Fair Play',
        title: 'No Griefing Discussion',
        description: 'We\'re here to help each other, not grief. Don\'t discuss or plan griefing other players.',
        examples: 'Planning to destroy cargo, discussing ways to annoy players, targeting specific users',
        severity: 'warning'
      },
      {
        category: 'Cooperation',
        title: 'Honor LFG Commitments',
        description: 'If you join an LFG, follow through. Don\'t abandon your team mid-session without good reason.',
        examples: 'Leaving heists early, not showing up after joining, sabotaging runs',
        severity: 'warning'
      },
      {
        category: 'Moderation',
        title: 'Follow Mod Instructions',
        description: 'Listen to moderators and bots. If you\'re warned, take it seriously.',
        examples: 'Arguing with mods publicly, ignoring warnings, mini-modding',
        severity: 'mute'
      },
      {
        category: 'Scams',
        title: 'No Scams or Phishing',
        description: 'Don\'t post scam links, phishing attempts, or fake giveaways.',
        examples: 'Free Shark Card links, fake Rockstar pages, account stealing attempts',
        severity: 'ban'
      }
    ];
    
    for (const rule of defaultRules) {
      await this.addRule(guildId, rule);
    }
    
    return defaultRules.length;
  }

  // ============================================
  // AI RULE DETECTION
  // ============================================
  async checkMessage(message) {
    if (message.author.bot) return null;
    
    const rules = await this.getRules(message.guild.id);
    if (rules.length === 0) return null;
    
    // Don't spam warnings - check if recently warned
    const warningKey = `${message.author.id}-${message.channel.id}`;
    const lastWarning = this.recentWarnings.get(warningKey);
    if (lastWarning && Date.now() - lastWarning < 60000) { // 1 minute cooldown
      return null;
    }
    
    // Build rules context for AI
    const rulesContext = rules.map(r => 
      `[${r.rule_id}] ${r.title}: ${r.description} (Examples: ${r.examples})`
    ).join('\n');
    
    // Get recent channel context (last 10 messages)
    let context = '';
    try {
      const recentMessages = await message.channel.messages.fetch({ limit: 10, before: message.id });
      context = recentMessages.reverse().map(m => 
        `${m.author.username}: ${m.content}`
      ).join('\n');
    } catch (e) {}
    
    // AI analysis
    const analysis = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a rule enforcement AI for a gaming Discord server. Your job is to detect rule violations.

CRITICAL: You must be VERY CAREFUL about false positives. Only flag CLEAR violations.

Consider:
- Context matters - jokes between friends are different from harassment
- Gaming language is often casual - "that's crazy" or "you're insane" aren't insults
- Glitch discussion is ALLOWED - this is a glitch community
- Be lenient on first impressions - only flag obvious violations
- When in doubt, DON'T flag

Respond ONLY with valid JSON:
{
  "violation": true/false,
  "confidence": 0.0-1.0,
  "rule_id": "R01" or null,
  "reason": "brief explanation" or null
}

Only set violation:true if confidence > 0.7`,
      messages: [{
        role: 'user',
        content: `SERVER RULES:
${rulesContext}

RECENT CONTEXT:
${context}

NEW MESSAGE TO CHECK:
${message.author.username}: ${message.content}

Analyze for rule violations. Remember: be careful about false positives!`
      }]
    });
    
    try {
      const result = JSON.parse(analysis.content[0].text);
      
      if (result.violation && result.confidence > 0.7) {
        this.recentWarnings.set(warningKey, Date.now());
        
        // Log the violation
        await this.pool.query(`
          INSERT INTO rule_violations (rule_id, user_id, user_name, message_id, message_content, channel_id, confidence, action_taken)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          result.rule_id,
          message.author.id,
          message.author.username,
          message.id,
          message.content,
          message.channel.id,
          result.confidence,
          'warned'
        ]);
        
        return {
          violation: true,
          ruleId: result.rule_id,
          reason: result.reason,
          confidence: result.confidence
        };
      }
      
      return null;
    } catch (e) {
      console.error('Error parsing rule check:', e);
      return null;
    }
  }

  // ============================================
  // WARNING SYSTEM
  // ============================================
  async sendWarning(message, violation, rulesChannelId) {
    const rule = await this.getRule(message.guild.id, violation.ruleId);
    if (!rule) return;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Rule Reminder`)
      .setDescription(`Hey <@${message.author.id}>, just a heads up about our community guidelines.`)
      .setColor(0xFFAA00)
      .addFields(
        { 
          name: `📜 ${rule.rule_id}: ${rule.title}`, 
          value: rule.description,
          inline: false 
        },
        {
          name: '💬 Why this was flagged',
          value: violation.reason,
          inline: false
        }
      )
      .setFooter({ text: `Click below to see all rules • Confidence: ${Math.round(violation.confidence * 100)}%` });
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel(`📖 View Rule ${rule.rule_id}`)
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${message.guild.id}/${rulesChannelId}`),
        new ButtonBuilder()
          .setCustomId(`false_positive_${message.id}`)
          .setLabel('❌ Not a violation')
          .setStyle(ButtonStyle.Secondary)
      );
    
    const warning = await message.channel.send({ 
      embeds: [embed], 
      components: [row] 
    });
    
    // Auto-delete warning after 30 seconds
    setTimeout(() => warning.delete().catch(() => {}), 30000);
    
    return warning;
  }

  // ============================================
  // RULES EMBED FOR CHANNEL
  // ============================================
  async createRulesEmbed(guildId) {
    const rules = await this.getRules(guildId);
    
    const embed = new EmbedBuilder()
      .setTitle('📜 SERVER RULES')
      .setDescription('Please read and follow these rules to keep our community awesome!')
      .setColor(0x5865F2);
    
    // Group by category
    const categories = {};
    for (const rule of rules) {
      if (!categories[rule.category]) {
        categories[rule.category] = [];
      }
      categories[rule.category].push(rule);
    }
    
    for (const [category, categoryRules] of Object.entries(categories)) {
      const rulesText = categoryRules.map(r => 
        `**${r.rule_id}** - ${r.title}\n${r.description}`
      ).join('\n\n');
      
      embed.addFields({ name: `📌 ${category}`, value: rulesText, inline: false });
    }
    
    embed.setFooter({ text: 'Breaking rules may result in warnings, mutes, or bans. Be cool! 😎' });
    
    return embed;
  }

  // ============================================
  // FALSE POSITIVE HANDLING
  // ============================================
  async markFalsePositive(messageId) {
    await this.pool.query(`
      UPDATE rule_violations SET false_positive = TRUE WHERE message_id = $1
    `, [messageId]);
  }
}

module.exports = RulesSystem;
