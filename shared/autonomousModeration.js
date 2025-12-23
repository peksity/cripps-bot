/**
 * AUTONOMOUS MODERATION SYSTEM
 * Full Auto-Moderation - No Human Mods Required
 * 
 * Features:
 * - Auto-detects rule violations in real-time
 * - Auto-punishes based on severity + history
 * - Auto-reviews appeals (AI decides)
 * - Predictive intervention (warns before problems)
 * - Progressive discipline (warn → mute → kick → ban)
 * - Self-learning from patterns
 * - Scam/spam/raid detection
 * - Toxicity analysis
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class AutonomousModeration {
  constructor(pool, anthropic, client) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.client = client;
    
    // Thresholds
    this.config = {
      // How many warnings before escalation
      warningsBeforeMute: 3,
      mutesBeforeKick: 2,
      kicksBeforeBan: 2,
      
      // Auto-mute duration (minutes)
      muteDurations: [5, 15, 60, 1440], // 5min, 15min, 1hr, 24hr
      
      // Spam detection
      spamThreshold: 5, // messages in spamWindow
      spamWindow: 5000, // 5 seconds
      duplicateThreshold: 3, // same message count
      
      // Toxicity threshold (0-1)
      toxicityThreshold: 0.7,
      
      // Appeal auto-approval threshold
      appealApprovalThreshold: 0.6, // trust score needed
      
      // New account restrictions (hours)
      newAccountAge: 24
    };
    
    // Message tracking for spam detection
    this.messageCache = new Map(); // oduserId -> [{content, timestamp}]
    
    // Raid detection
    this.joinCache = []; // [{oduserId, timestamp}]
    this.raidThreshold = 10; // joins in raidWindow
    this.raidWindow = 60000; // 1 minute
  }

  async initialize() {
    try {
      await this.pool.query(`
        -- User punishment history
        CREATE TABLE IF NOT EXISTS punishment_history (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          action_type VARCHAR(16),
          reason TEXT,
          duration INT,
          auto_generated BOOLEAN DEFAULT TRUE,
          ai_confidence FLOAT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_punishment_user ON punishment_history(user_id, guild_id);

        -- Active punishments
        CREATE TABLE IF NOT EXISTS active_punishments (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          punishment_type VARCHAR(16),
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, guild_id, punishment_type)
        );

        -- Auto-appeals
        CREATE TABLE IF NOT EXISTS auto_appeals (
          id SERIAL PRIMARY KEY,
          appeal_id VARCHAR(32) UNIQUE,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          punishment_type VARCHAR(16),
          user_statement TEXT,
          ai_analysis TEXT,
          ai_decision VARCHAR(16),
          ai_confidence FLOAT,
          ai_reasoning TEXT,
          executed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );

        -- Behavioral scores (real-time)
        CREATE TABLE IF NOT EXISTS behavior_scores (
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          toxicity_avg FLOAT DEFAULT 0,
          spam_score FLOAT DEFAULT 0,
          trust_score FLOAT DEFAULT 50,
          risk_score FLOAT DEFAULT 0,
          total_violations INT DEFAULT 0,
          total_warnings INT DEFAULT 0,
          total_mutes INT DEFAULT 0,
          total_kicks INT DEFAULT 0,
          total_bans INT DEFAULT 0,
          last_violation TIMESTAMP,
          updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY(user_id, guild_id)
        );

        -- Violation patterns (for learning)
        CREATE TABLE IF NOT EXISTS violation_patterns (
          id SERIAL PRIMARY KEY,
          pattern_type VARCHAR(32),
          pattern_data JSONB,
          occurrences INT DEFAULT 1,
          false_positive_rate FLOAT DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      console.log('🤖 Autonomous Moderation initialized');
    } catch (error) {
      console.error('Auto-mod init error:', error);
    }
  }

  // ============================================
  // REAL-TIME MESSAGE ANALYSIS
  // ============================================
  async analyzeMessage(message) {
    if (!message.guild || message.author.bot) return null;
    
    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content;
    
    const analysis = {
      spam: false,
      toxic: false,
      scam: false,
      raid: false,
      violation: null,
      severity: 0,
      action: null,
      reason: null
    };
    
    // 1. SPAM DETECTION
    const spamResult = this.detectSpam(message);
    if (spamResult.isSpam) {
      analysis.spam = true;
      analysis.severity = Math.max(analysis.severity, 5);
      analysis.reason = spamResult.reason;
    }
    
    // 2. SCAM DETECTION (links, patterns)
    const scamResult = await this.detectScam(content);
    if (scamResult.isScam) {
      analysis.scam = true;
      analysis.severity = Math.max(analysis.severity, 9);
      analysis.reason = 'Scam detected: ' + scamResult.reason;
    }
    
    // 3. TOXICITY ANALYSIS
    const toxicity = await this.analyzeToxicity(content);
    if (toxicity.score > this.config.toxicityThreshold) {
      analysis.toxic = true;
      analysis.severity = Math.max(analysis.severity, Math.round(toxicity.score * 10));
      analysis.reason = toxicity.reason;
    }
    
    // 4. RULE VIOLATION CHECK
    const violation = await this.checkRuleViolation(message);
    if (violation) {
      analysis.violation = violation;
      analysis.severity = Math.max(analysis.severity, violation.severity);
      analysis.reason = violation.reason;
    }
    
    // Determine action based on severity and history
    if (analysis.severity > 0) {
      analysis.action = await this.determineAction(userId, guildId, analysis.severity, analysis.reason);
    }
    
    return analysis;
  }

  // ============================================
  // SPAM DETECTION
  // ============================================
  detectSpam(message) {
    const oduserId = message.author.id;
    const content = message.content.toLowerCase();
    const now = Date.now();
    
    // Get/create user message cache
    if (!this.messageCache.has(oduserId)) {
      this.messageCache.set(oduserId, []);
    }
    
    const userMessages = this.messageCache.get(oduserId);
    
    // Add current message
    userMessages.push({ content, timestamp: now });
    
    // Clean old messages
    const recentMessages = userMessages.filter(m => now - m.timestamp < this.config.spamWindow);
    this.messageCache.set(oduserId, recentMessages);
    
    // Check message frequency
    if (recentMessages.length >= this.config.spamThreshold) {
      return { isSpam: true, reason: `Sending messages too fast (${recentMessages.length} in ${this.config.spamWindow/1000}s)` };
    }
    
    // Check duplicate messages
    const duplicates = recentMessages.filter(m => m.content === content);
    if (duplicates.length >= this.config.duplicateThreshold) {
      return { isSpam: true, reason: 'Sending duplicate messages' };
    }
    
    // Check for @everyone/@here spam
    if (content.includes('@everyone') || content.includes('@here')) {
      if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        return { isSpam: true, reason: 'Attempted mass ping without permission' };
      }
    }
    
    // Check excessive mentions
    if (message.mentions.users.size > 5) {
      return { isSpam: true, reason: `Excessive mentions (${message.mentions.users.size} users)` };
    }
    
    // Check excessive emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    if (emojiCount > 15) {
      return { isSpam: true, reason: 'Emoji spam' };
    }
    
    // Check caps lock
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
    if (letterCount > 20 && upperCount / letterCount > 0.7) {
      return { isSpam: true, reason: 'Excessive caps lock' };
    }
    
    return { isSpam: false };
  }

  // ============================================
  // SCAM DETECTION
  // ============================================
  async detectScam(content) {
    const lower = content.toLowerCase();
    
    // Known scam patterns
    const scamPatterns = [
      { pattern: /free\s*nitro/i, reason: 'Free Nitro scam' },
      { pattern: /discord\.gift(?!s)/i, reason: 'Fake Discord gift link' },
      { pattern: /discordapp\.com\/gifts/i, reason: 'Fake gift link' },
      { pattern: /steamnity|steamcommunity\.ru|steamcommunity\.co/i, reason: 'Fake Steam link' },
      { pattern: /claim.*prize|won.*prize|winner.*selected/i, reason: 'Prize scam' },
      { pattern: /verify.*wallet|connect.*wallet|airdrop/i, reason: 'Crypto scam' },
      { pattern: /@everyone.*http|@here.*http/i, reason: 'Mass ping with link' },
      { pattern: /account.*suspend|verify.*account.*http/i, reason: 'Phishing attempt' },
      { pattern: /dropbox\.com.*\.exe|drive\.google.*\.exe/i, reason: 'Malware link' }
    ];
    
    for (const scam of scamPatterns) {
      if (scam.pattern.test(content)) {
        return { isScam: true, reason: scam.reason };
      }
    }
    
    // Check for suspicious shortened URLs
    const shorteners = ['bit.ly', 'tinyurl', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly', 'adf.ly'];
    for (const shortener of shorteners) {
      if (lower.includes(shortener)) {
        return { isScam: true, reason: 'Suspicious shortened URL', confidence: 0.6 };
      }
    }
    
    // Check database for known scam links
    try {
      const result = await this.pool.query(
        `SELECT * FROM scam_links WHERE $1 LIKE '%' || link || '%'`,
        [lower]
      );
      if (result.rows.length > 0) {
        return { isScam: true, reason: 'Known scam link' };
      }
    } catch (e) {}
    
    return { isScam: false };
  }

  // ============================================
  // TOXICITY ANALYSIS
  // ============================================
  async analyzeToxicity(content) {
    if (!content || content.length < 3) return { score: 0, reason: null };
    
    // Quick keyword check first (fast path)
    const toxicKeywords = [
      { words: ['kys', 'kill yourself', 'neck yourself'], severity: 1.0, reason: 'Self-harm encouragement' },
      { words: ['nigger', 'nigga', 'faggot', 'retard'], severity: 0.9, reason: 'Slur detected' },
      { words: ['fuck you', 'fucking idiot', 'piece of shit', 'kill you'], severity: 0.8, reason: 'Severe insult' },
      { words: ['stfu', 'shut the fuck up', 'dumbass', 'asshole'], severity: 0.6, reason: 'Hostile language' }
    ];
    
    const lower = content.toLowerCase();
    for (const toxic of toxicKeywords) {
      for (const word of toxic.words) {
        if (lower.includes(word)) {
          return { score: toxic.severity, reason: toxic.reason };
        }
      }
    }
    
    // For borderline cases, use AI
    if (content.length > 20) {
      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `Rate the toxicity of this message from 0.0 to 1.0. Reply with just the number and a brief reason.
Message: "${content.slice(0, 200)}"
Format: [score]|[reason]`
          }]
        });
        
        const result = response.content[0].text.trim();
        const [scoreStr, reason] = result.split('|');
        const score = parseFloat(scoreStr) || 0;
        
        return { score, reason: reason?.trim() || 'AI analysis' };
      } catch (e) {
        return { score: 0, reason: null };
      }
    }
    
    return { score: 0, reason: null };
  }

  // ============================================
  // RULE VIOLATION CHECK
  // ============================================
  async checkRuleViolation(message) {
    const content = message.content.toLowerCase();
    const channelName = message.channel.name.toLowerCase();
    
    // Channel-specific rules
    if (channelName.includes('lfg') && !message.content.startsWith('?')) {
      // Non-command in LFG channel
      return { rule: 'LFG Channel', severity: 2, reason: 'Non-command message in LFG channel' };
    }
    
    if (channelName.includes('media') || channelName.includes('meme')) {
      // Text-only in media channel
      if (!message.attachments.size && !content.includes('http')) {
        return { rule: 'Media Channel', severity: 1, reason: 'Text-only message in media channel' };
      }
    }
    
    // NSFW outside NSFW channels
    const nsfwKeywords = ['porn', 'xxx', 'nude', 'naked', 'sex video'];
    if (!message.channel.nsfw) {
      for (const kw of nsfwKeywords) {
        if (content.includes(kw)) {
          return { rule: 'NSFW Content', severity: 8, reason: 'NSFW content outside designated channels' };
        }
      }
    }
    
    // Advertising/self-promo
    if (content.includes('discord.gg/') || content.includes('discord.com/invite/')) {
      // Check if they have permission
      const allowedChannels = ['promo', 'advertise', 'self-promo', 'partner'];
      if (!allowedChannels.some(c => channelName.includes(c))) {
        return { rule: 'No Advertising', severity: 5, reason: 'Server invite without permission' };
      }
    }
    
    return null;
  }

  // ============================================
  // DETERMINE ACTION (Progressive Discipline)
  // ============================================
  async determineAction(userId, guildId, severity, reason) {
    // Get user's history
    const history = await this.getUserHistory(userId, guildId);
    
    let action = null;
    let duration = null;
    
    // Progressive discipline based on severity and history
    if (severity >= 9) {
      // Severe (scam, slurs, threats) → immediate ban
      action = 'ban';
    } else if (severity >= 7) {
      // High severity
      if (history.total_bans > 0) {
        action = 'ban'; // Already been banned before
      } else if (history.total_kicks >= this.config.kicksBeforeBan) {
        action = 'ban';
      } else {
        action = 'kick';
      }
    } else if (severity >= 5) {
      // Medium severity
      if (history.total_mutes >= this.config.mutesBeforeKick) {
        action = 'kick';
      } else {
        action = 'mute';
        duration = this.config.muteDurations[Math.min(history.total_mutes, this.config.muteDurations.length - 1)];
      }
    } else if (severity >= 3) {
      // Low-medium severity
      if (history.total_warnings >= this.config.warningsBeforeMute) {
        action = 'mute';
        duration = this.config.muteDurations[0]; // 5 min
      } else {
        action = 'warn';
      }
    } else {
      // Low severity - just warn
      action = 'warn';
    }
    
    return { action, duration, reason };
  }

  async getUserHistory(userId, guildId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM behavior_scores 
        WHERE user_id = $1 AND guild_id = $2
      `, [userId, guildId]);
      
      if (result.rows.length === 0) {
        // Create new record
        await this.pool.query(`
          INSERT INTO behavior_scores (user_id, guild_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, guild_id) DO NOTHING
        `, [userId, guildId]);
        
        return {
          total_warnings: 0,
          total_mutes: 0,
          total_kicks: 0,
          total_bans: 0,
          trust_score: 50
        };
      }
      
      return result.rows[0];
    } catch (e) {
      return { total_warnings: 0, total_mutes: 0, total_kicks: 0, total_bans: 0, trust_score: 50 };
    }
  }

  // ============================================
  // EXECUTE ACTION
  // ============================================
  async executeAction(message, analysis) {
    if (!analysis.action) return;
    
    const { action, duration, reason } = analysis.action;
    const member = message.member;
    const guild = message.guild;
    
    // Delete the offending message
    await message.delete().catch(() => {});
    
    // Log to database
    await this.logPunishment(member.id, guild.id, action, reason, duration);
    
    // Execute the action
    switch (action) {
      case 'warn':
        await this.executeWarn(member, guild, reason);
        break;
      case 'mute':
        await this.executeMute(member, guild, reason, duration);
        break;
      case 'kick':
        await this.executeKick(member, guild, reason);
        break;
      case 'ban':
        await this.executeBan(member, guild, reason);
        break;
    }
  }

  async executeWarn(member, guild, reason) {
    // Update stats
    await this.pool.query(`
      UPDATE behavior_scores 
      SET total_warnings = total_warnings + 1, last_violation = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND guild_id = $2
    `, [member.id, guild.id]);
    
    // DM the user
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Warning')
      .setDescription(`You've been warned in **${guild.name}**`)
      .addFields({ name: 'Reason', value: reason })
      .setColor(0xFFAA00)
      .setFooter({ text: 'Further violations will result in mutes or bans' });
    
    await member.send({ embeds: [embed] }).catch(() => {});
    
    // Log to mod channel
    await this.logToModChannel(guild, 'warn', member, reason);
  }

  async executeMute(member, guild, reason, durationMinutes) {
    // Update stats
    await this.pool.query(`
      UPDATE behavior_scores 
      SET total_mutes = total_mutes + 1, last_violation = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND guild_id = $2
    `, [member.id, guild.id]);
    
    // Apply timeout
    const durationMs = durationMinutes * 60 * 1000;
    await member.timeout(durationMs, reason).catch(console.error);
    
    // DM the user
    const embed = new EmbedBuilder()
      .setTitle('🔇 Muted')
      .setDescription(`You've been muted in **${guild.name}** for ${durationMinutes} minutes`)
      .addFields(
        { name: 'Reason', value: reason },
        { name: 'Appeal', value: 'Reply to this message to appeal. Your case will be reviewed automatically.' }
      )
      .setColor(0xFF8C00);
    
    await member.send({ embeds: [embed] }).catch(() => {});
    await this.logToModChannel(guild, 'mute', member, reason, `${durationMinutes} minutes`);
  }

  async executeKick(member, guild, reason) {
    // Update stats
    await this.pool.query(`
      UPDATE behavior_scores 
      SET total_kicks = total_kicks + 1, last_violation = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND guild_id = $2
    `, [member.id, guild.id]);
    
    // DM before kick
    const embed = new EmbedBuilder()
      .setTitle('👢 Kicked')
      .setDescription(`You've been kicked from **${guild.name}**`)
      .addFields(
        { name: 'Reason', value: reason },
        { name: 'Appeal', value: 'You can rejoin and DM me to appeal.' }
      )
      .setColor(0xFF4500);
    
    await member.send({ embeds: [embed] }).catch(() => {});
    await member.kick(reason).catch(console.error);
    await this.logToModChannel(guild, 'kick', member, reason);
  }

  async executeBan(member, guild, reason) {
    // Update stats
    await this.pool.query(`
      UPDATE behavior_scores 
      SET total_bans = total_bans + 1, last_violation = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND guild_id = $2
    `, [member.id, guild.id]);
    
    // DM before ban
    const embed = new EmbedBuilder()
      .setTitle('🔨 Banned')
      .setDescription(`You've been banned from **${guild.name}**`)
      .addFields(
        { name: 'Reason', value: reason },
        { name: 'Appeal', value: 'DM me with "appeal" to submit an appeal. It will be reviewed automatically.' }
      )
      .setColor(0xFF0000);
    
    await member.send({ embeds: [embed] }).catch(() => {});
    await member.ban({ reason, deleteMessageSeconds: 86400 }).catch(console.error);
    await this.logToModChannel(guild, 'ban', member, reason);
  }

  // ============================================
  // AUTO-APPEAL SYSTEM
  // ============================================
  async handleAppeal(message, statement) {
    const oduserId = message.author.id;
    const appealId = `APP-${Date.now().toString(36).toUpperCase()}`;
    
    // Get their punishment history
    const history = await this.pool.query(`
      SELECT * FROM punishment_history 
      WHERE user_id = $1 
      ORDER BY created_at DESC LIMIT 10
    `, [oduserId]);
    
    // Get their behavior score
    const behavior = await this.pool.query(`
      SELECT * FROM behavior_scores WHERE user_id = $1
    `, [oduserId]);
    
    // Get their messages (if logged)
    const messages = await this.pool.query(`
      SELECT content, deleted, created_at FROM message_log 
      WHERE author_id = $1 
      ORDER BY created_at DESC LIMIT 30
    `, [oduserId]);
    
    // AI analyzes the appeal
    const aiDecision = await this.analyzeAppeal({
      oduserId,
      statement,
      history: history.rows,
      behavior: behavior.rows[0] || {},
      recentMessages: messages.rows
    });
    
    // Save appeal
    await this.pool.query(`
      INSERT INTO auto_appeals (appeal_id, user_id, user_statement, ai_analysis, ai_decision, ai_confidence, ai_reasoning)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [appealId, oduserId, statement, aiDecision.analysis, aiDecision.decision, aiDecision.confidence, aiDecision.reasoning]);
    
    // Execute decision
    if (aiDecision.decision === 'approve') {
      await this.executeAppealApproval(message.author, aiDecision);
    }
    
    // Send response
    const embed = new EmbedBuilder()
      .setTitle(aiDecision.decision === 'approve' ? '✅ Appeal Approved' : '❌ Appeal Denied')
      .setDescription(aiDecision.reasoning)
      .setColor(aiDecision.decision === 'approve' ? 0x00FF00 : 0xFF0000)
      .addFields({ name: 'Confidence', value: `${Math.round(aiDecision.confidence * 100)}%`, inline: true })
      .setFooter({ text: `Appeal ID: ${appealId}` });
    
    return { embed, decision: aiDecision };
  }

  async analyzeAppeal(data) {
    try {
      const prompt = `You are an autonomous moderation AI. Analyze this appeal and make a decision.

USER'S APPEAL:
"${data.statement}"

PUNISHMENT HISTORY:
${data.history.map(h => `- ${h.action_type}: ${h.reason} (${new Date(h.created_at).toLocaleDateString()})`).join('\n') || 'No history'}

BEHAVIOR SCORES:
- Warnings: ${data.behavior.total_warnings || 0}
- Mutes: ${data.behavior.total_mutes || 0}
- Kicks: ${data.behavior.total_kicks || 0}
- Bans: ${data.behavior.total_bans || 0}
- Trust Score: ${data.behavior.trust_score || 50}/100

RECENT MESSAGES (sample):
${data.recentMessages.slice(0, 10).map(m => `- "${m.content?.slice(0, 50)}..." ${m.deleted ? '[DELETED]' : ''}`).join('\n') || 'None logged'}

DECISION CRITERIA:
- APPROVE if: First-time offense, shows genuine remorse, violation was minor, or there's reasonable doubt
- DENY if: Repeat offender, severe violation (scams, slurs, threats), no remorse shown, or history shows pattern

Respond in this exact format:
DECISION: [approve/deny]
CONFIDENCE: [0.0-1.0]
REASONING: [2-3 sentence explanation to show the user]
ANALYSIS: [internal notes about the case]`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const text = response.content[0].text;
      
      // Parse response
      const decisionMatch = text.match(/DECISION:\s*(approve|deny)/i);
      const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/);
      const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=ANALYSIS:|$)/is);
      const analysisMatch = text.match(/ANALYSIS:\s*(.+)/is);
      
      return {
        decision: decisionMatch ? decisionMatch[1].toLowerCase() : 'deny',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'Decision made based on available evidence.',
        analysis: analysisMatch ? analysisMatch[1].trim() : text
      };
    } catch (e) {
      console.error('Appeal analysis error:', e);
      return {
        decision: 'deny',
        confidence: 0.5,
        reasoning: 'Unable to fully analyze appeal. Please try again later.',
        analysis: 'Error during analysis'
      };
    }
  }

  async executeAppealApproval(user, decision) {
    // Find which guild they were banned from
    for (const [, guild] of this.client.guilds.cache) {
      try {
        const ban = await guild.bans.fetch(user.id).catch(() => null);
        if (ban) {
          await guild.members.unban(user.id, 'Appeal approved by AI');
          
          // Reset their behavior score
          await this.pool.query(`
            UPDATE behavior_scores 
            SET total_bans = GREATEST(0, total_bans - 1), trust_score = 40
            WHERE user_id = $1 AND guild_id = $2
          `, [user.id, guild.id]);
          
          await this.logToModChannel(guild, 'unban', { user }, `Appeal approved (AI confidence: ${Math.round(decision.confidence * 100)}%)`);
        }
      } catch (e) {}
    }
  }

  // ============================================
  // RAID DETECTION
  // ============================================
  async detectRaid(member) {
    const now = Date.now();
    
    // Add to join cache
    this.joinCache.push({ oduserId: member.id, timestamp: now });
    
    // Clean old entries
    this.joinCache = this.joinCache.filter(j => now - j.timestamp < this.raidWindow);
    
    // Check for raid
    if (this.joinCache.length >= this.raidThreshold) {
      return {
        isRaid: true,
        joinCount: this.joinCache.length,
        recentJoins: this.joinCache.map(j => j.oduserId)
      };
    }
    
    // Check for new account
    const accountAge = now - member.user.createdTimestamp;
    const hoursOld = accountAge / (1000 * 60 * 60);
    
    if (hoursOld < this.config.newAccountAge) {
      return {
        isNewAccount: true,
        hoursOld: Math.round(hoursOld)
      };
    }
    
    return { isRaid: false, isNewAccount: false };
  }

  // ============================================
  // LOGGING
  // ============================================
  async logPunishment(oduserId, guildId, action, reason, duration = null) {
    try {
      await this.pool.query(`
        INSERT INTO punishment_history (user_id, guild_id, action_type, reason, duration, auto_generated)
        VALUES ($1, $2, $3, $4, $5, TRUE)
      `, [oduserId, guildId, action, reason, duration]);
    } catch (e) {}
  }

  async logToModChannel(guild, action, member, reason, extra = '') {
    const modChannel = guild.channels.cache.find(c => 
      c.name.includes('mod-log') || c.name.includes('mod-actions') || c.name.includes('logs')
    );
    
    if (!modChannel) return;
    
    const actionEmojis = { warn: '⚠️', mute: '🔇', kick: '👢', ban: '🔨', unban: '✅' };
    const actionColors = { warn: 0xFFAA00, mute: 0xFF8C00, kick: 0xFF4500, ban: 0xFF0000, unban: 0x00FF00 };
    
    const embed = new EmbedBuilder()
      .setTitle(`${actionEmojis[action] || '📋'} Auto-${action.toUpperCase()}`)
      .setDescription(`**User:** ${member.user?.tag || member.tag || 'Unknown'} (<@${member.id || member.user?.id}>)`)
      .addFields({ name: 'Reason', value: reason })
      .setColor(actionColors[action] || 0x5865F2)
      .setFooter({ text: '🤖 Autonomous Moderation' })
      .setTimestamp();
    
    if (extra) {
      embed.addFields({ name: 'Duration', value: extra, inline: true });
    }
    
    await modChannel.send({ embeds: [embed] }).catch(() => {});
  }

  // ============================================
  // PREDICTIVE INTERVENTION
  // ============================================
  async checkPredictiveIntervention(message) {
    const oduserId = message.author.id;
    const guildId = message.guild.id;
    
    // Get recent behavior
    const recent = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE action_type = 'warn' AND created_at > NOW() - INTERVAL '24 hours') as recent_warns,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as week_violations
      FROM punishment_history 
      WHERE user_id = $1 AND guild_id = $2
    `, [oduserId, guildId]);
    
    const data = recent.rows[0];
    
    // If they've had 2+ warnings today, send a heads up
    if (parseInt(data.recent_warns) >= 2) {
      const embed = new EmbedBuilder()
        .setTitle('⚡ Heads Up')
        .setDescription(`You've received ${data.recent_warns} warnings today. One more violation may result in a mute.`)
        .setColor(0xFFAA00)
        .setFooter({ text: 'This is an automated reminder' });
      
      await message.author.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

module.exports = AutonomousModeration;
