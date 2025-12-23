/**
 * INVESTIGATION SYSTEM - Police Chief's Evidence Collection
 * 
 * Features:
 * - Logs ALL messages to database
 * - Tracks conversation threads
 * - Stores edits and deletions
 * - Cross-references user interactions
 * - Appeal system with evidence review
 * - AI-powered investigation analysis
 */

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');

class InvestigationSystem {
  constructor(pool, anthropic) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.messageCache = new Map(); // For tracking edits
  }

  // ============================================
  // DATABASE SETUP
  // ============================================
  async initDatabase() {
    await this.pool.query(`
      -- Message log - stores EVERY message
      CREATE TABLE IF NOT EXISTS message_log (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(32) UNIQUE,
        channel_id VARCHAR(32),
        channel_name VARCHAR(100),
        guild_id VARCHAR(32),
        author_id VARCHAR(32),
        author_name VARCHAR(64),
        author_discriminator VARCHAR(8),
        content TEXT,
        attachments JSONB DEFAULT '[]',
        embeds JSONB DEFAULT '[]',
        reply_to VARCHAR(32),
        edited BOOLEAN DEFAULT FALSE,
        deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        edited_at TIMESTAMP,
        deleted_at TIMESTAMP
      );
      
      -- Message edits history
      CREATE TABLE IF NOT EXISTS message_edits (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(32),
        old_content TEXT,
        new_content TEXT,
        edited_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Moderation actions log
      CREATE TABLE IF NOT EXISTS mod_actions (
        id SERIAL PRIMARY KEY,
        action_type VARCHAR(32),
        target_id VARCHAR(32),
        target_name VARCHAR(64),
        moderator_id VARCHAR(32),
        moderator_name VARCHAR(64),
        reason TEXT,
        evidence JSONB DEFAULT '[]',
        guild_id VARCHAR(32),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Appeals
      CREATE TABLE IF NOT EXISTS appeals (
        id SERIAL PRIMARY KEY,
        appeal_id VARCHAR(32) UNIQUE,
        user_id VARCHAR(32),
        user_name VARCHAR(64),
        mod_action_id INT REFERENCES mod_actions(id),
        appeal_reason TEXT,
        status VARCHAR(16) DEFAULT 'pending',
        investigation_notes TEXT,
        evidence_summary TEXT,
        verdict TEXT,
        reviewed_by VARCHAR(32),
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      );
      
      -- User interactions tracking (who talks to whom)
      CREATE TABLE IF NOT EXISTS user_interactions (
        id SERIAL PRIMARY KEY,
        user_a VARCHAR(32),
        user_b VARCHAR(32),
        channel_id VARCHAR(32),
        interaction_count INT DEFAULT 1,
        last_interaction TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_a, user_b, channel_id)
      );
      
      -- Warnings issued
      CREATE TABLE IF NOT EXISTS warnings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(32),
        user_name VARCHAR(64),
        rule_id VARCHAR(16),
        rule_text TEXT,
        context TEXT,
        issued_by VARCHAR(32),
        guild_id VARCHAR(32),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Create indexes for fast lookups
      CREATE INDEX IF NOT EXISTS idx_message_log_author ON message_log(author_id);
      CREATE INDEX IF NOT EXISTS idx_message_log_channel ON message_log(channel_id);
      CREATE INDEX IF NOT EXISTS idx_message_log_created ON message_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_message_log_guild ON message_log(guild_id);
    `);
    
    console.log('✅ Investigation database initialized');
  }

  // ============================================
  // MESSAGE LOGGING
  // ============================================
  async logMessage(message) {
    if (message.author.bot) return;
    
    try {
      // Store in cache for edit tracking
      this.messageCache.set(message.id, {
        content: message.content,
        timestamp: Date.now()
      });
      
      // Clean old cache entries (older than 1 hour)
      for (const [id, data] of this.messageCache) {
        if (Date.now() - data.timestamp > 3600000) {
          this.messageCache.delete(id);
        }
      }
      
      // Get reply reference
      const replyTo = message.reference?.messageId || null;
      
      // Store attachments info
      const attachments = message.attachments.map(a => ({
        id: a.id,
        name: a.name,
        url: a.url,
        size: a.size,
        contentType: a.contentType
      }));
      
      await this.pool.query(`
        INSERT INTO message_log 
        (message_id, channel_id, channel_name, guild_id, author_id, author_name, author_discriminator, content, attachments, reply_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (message_id) DO NOTHING
      `, [
        message.id,
        message.channel.id,
        message.channel.name,
        message.guild?.id,
        message.author.id,
        message.author.username,
        message.author.discriminator,
        message.content,
        JSON.stringify(attachments),
        replyTo
      ]);
      
      // Track user interactions (if replying to someone)
      if (replyTo) {
        const originalMsg = await this.pool.query(
          'SELECT author_id FROM message_log WHERE message_id = $1',
          [replyTo]
        );
        
        if (originalMsg.rows.length > 0 && originalMsg.rows[0].author_id !== message.author.id) {
          await this.trackInteraction(message.author.id, originalMsg.rows[0].author_id, message.channel.id);
        }
      }
      
    } catch (error) {
      console.error('Error logging message:', error);
    }
  }

  async logEdit(oldMessage, newMessage) {
    try {
      // Get old content from cache or database
      let oldContent = this.messageCache.get(oldMessage.id)?.content || oldMessage.content;
      
      await this.pool.query(`
        INSERT INTO message_edits (message_id, old_content, new_content)
        VALUES ($1, $2, $3)
      `, [oldMessage.id, oldContent, newMessage.content]);
      
      await this.pool.query(`
        UPDATE message_log 
        SET content = $1, edited = TRUE, edited_at = NOW()
        WHERE message_id = $2
      `, [newMessage.content, newMessage.id]);
      
      // Update cache
      this.messageCache.set(newMessage.id, {
        content: newMessage.content,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error logging edit:', error);
    }
  }

  async logDeletion(message) {
    try {
      await this.pool.query(`
        UPDATE message_log 
        SET deleted = TRUE, deleted_at = NOW()
        WHERE message_id = $1
      `, [message.id]);
    } catch (error) {
      console.error('Error logging deletion:', error);
    }
  }

  async trackInteraction(userA, userB, channelId) {
    // Always store in consistent order
    const [first, second] = [userA, userB].sort();
    
    await this.pool.query(`
      INSERT INTO user_interactions (user_a, user_b, channel_id, interaction_count, last_interaction)
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT (user_a, user_b, channel_id) 
      DO UPDATE SET interaction_count = user_interactions.interaction_count + 1, last_interaction = NOW()
    `, [first, second, channelId]);
  }

  // ============================================
  // MODERATION ACTIONS
  // ============================================
  async logModAction(action) {
    const result = await this.pool.query(`
      INSERT INTO mod_actions (action_type, target_id, target_name, moderator_id, moderator_name, reason, evidence, guild_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      action.type,
      action.targetId,
      action.targetName,
      action.moderatorId,
      action.moderatorName,
      action.reason,
      JSON.stringify(action.evidence || []),
      action.guildId
    ]);
    
    return result.rows[0].id;
  }

  // ============================================
  // INVESTIGATION QUERIES
  // ============================================
  async getUserMessages(userId, limit = 100, beforeDate = null) {
    let query = `
      SELECT * FROM message_log 
      WHERE author_id = $1
      ${beforeDate ? 'AND created_at < $3' : ''}
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const params = beforeDate ? [userId, limit, beforeDate] : [userId, limit];
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getChannelMessages(channelId, limit = 100, aroundDate = null) {
    let query = `
      SELECT * FROM message_log 
      WHERE channel_id = $1
      ${aroundDate ? 'AND created_at BETWEEN $3 - interval \'1 hour\' AND $3 + interval \'1 hour\'' : ''}
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const params = aroundDate ? [channelId, limit, aroundDate] : [channelId, limit];
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getConversationBetweenUsers(userA, userB, limit = 50) {
    // Get messages where these users interacted
    const result = await this.pool.query(`
      SELECT m1.* FROM message_log m1
      WHERE m1.author_id IN ($1, $2)
      AND EXISTS (
        SELECT 1 FROM message_log m2 
        WHERE m2.channel_id = m1.channel_id 
        AND m2.author_id IN ($1, $2)
        AND m2.author_id != m1.author_id
        AND ABS(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))) < 300
      )
      ORDER BY m1.created_at DESC
      LIMIT $3
    `, [userA, userB, limit]);
    
    return result.rows;
  }

  async getUserInteractions(userId) {
    const result = await this.pool.query(`
      SELECT 
        CASE WHEN user_a = $1 THEN user_b ELSE user_a END as other_user,
        SUM(interaction_count) as total_interactions,
        MAX(last_interaction) as last_interaction
      FROM user_interactions
      WHERE user_a = $1 OR user_b = $1
      GROUP BY other_user
      ORDER BY total_interactions DESC
      LIMIT 20
    `, [userId]);
    
    return result.rows;
  }

  async getMessageEdits(messageId) {
    const result = await this.pool.query(`
      SELECT * FROM message_edits
      WHERE message_id = $1
      ORDER BY edited_at ASC
    `, [messageId]);
    
    return result.rows;
  }

  async getDeletedMessages(userId, limit = 50) {
    const result = await this.pool.query(`
      SELECT * FROM message_log
      WHERE author_id = $1 AND deleted = TRUE
      ORDER BY deleted_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows;
  }

  async getUserWarnings(userId) {
    const result = await this.pool.query(`
      SELECT * FROM warnings
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    return result.rows;
  }

  async getModActions(targetId) {
    const result = await this.pool.query(`
      SELECT * FROM mod_actions
      WHERE target_id = $1
      ORDER BY created_at DESC
    `, [targetId]);
    
    return result.rows;
  }

  // ============================================
  // AI-POWERED INVESTIGATION
  // ============================================
  async investigateUser(userId, context = '') {
    // Gather all evidence
    const [messages, deletedMessages, interactions, warnings, modActions] = await Promise.all([
      this.getUserMessages(userId, 200),
      this.getDeletedMessages(userId, 50),
      this.getUserInteractions(userId),
      this.getUserWarnings(userId),
      this.getModActions(userId)
    ]);
    
    // Build investigation report
    const evidence = {
      totalMessages: messages.length,
      deletedMessages: deletedMessages.length,
      warnings: warnings.length,
      modActions: modActions.length,
      topInteractions: interactions.slice(0, 5),
      recentMessages: messages.slice(0, 50).map(m => ({
        content: m.content,
        channel: m.channel_name,
        time: m.created_at,
        edited: m.edited,
        deleted: m.deleted
      })),
      deletedContent: deletedMessages.map(m => ({
        content: m.content,
        channel: m.channel_name,
        deletedAt: m.deleted_at
      })),
      warningHistory: warnings.map(w => ({
        rule: w.rule_id,
        context: w.context,
        date: w.created_at
      }))
    };
    
    // Use Claude to analyze
    const analysis = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are Police Chief, an investigation AI for a Discord gaming community. 
      
Analyze the evidence provided and give a detailed investigation report. Look for:
- Patterns of behavior (toxic, helpful, neutral)
- Rule violations
- Suspicious activity (deleted messages, edits)
- Interaction patterns with other users
- Whether any bans/warnings were justified
- Credibility assessment

Be thorough but fair. Present facts objectively.`,
      messages: [{
        role: 'user',
        content: `Investigate this user. Context: ${context || 'General review'}

Evidence:
${JSON.stringify(evidence, null, 2)}

Provide a detailed investigation report.`
      }]
    });
    
    return {
      evidence,
      analysis: analysis.content[0].text
    };
  }

  async reviewAppeal(appealId) {
    // Get appeal details
    const appealResult = await this.pool.query(`
      SELECT a.*, m.* 
      FROM appeals a
      LEFT JOIN mod_actions m ON a.mod_action_id = m.id
      WHERE a.appeal_id = $1
    `, [appealId]);
    
    if (appealResult.rows.length === 0) return null;
    
    const appeal = appealResult.rows[0];
    
    // Get full investigation
    const investigation = await this.investigateUser(
      appeal.user_id, 
      `Appeal review for: ${appeal.action_type} - ${appeal.reason}`
    );
    
    // Get conversation context around the incident
    const incidentMessages = await this.pool.query(`
      SELECT * FROM message_log
      WHERE author_id = $1
      AND created_at BETWEEN $2 - interval '30 minutes' AND $2 + interval '10 minutes'
      ORDER BY created_at ASC
    `, [appeal.user_id, appeal.created_at]);
    
    // AI verdict
    const verdictAnalysis = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are Police Chief reviewing an appeal. Be fair and thorough.

Consider:
1. Was the original action justified based on evidence?
2. Is the user's appeal credible?
3. Are there mitigating circumstances?
4. Does their history support or contradict their claims?

Provide a recommended verdict: APPROVE (overturn action), DENY (uphold action), or REDUCE (modify punishment).`,
      messages: [{
        role: 'user',
        content: `APPEAL REVIEW

Original Action: ${appeal.action_type}
Reason: ${appeal.reason}
User's Appeal: ${appeal.appeal_reason}

Investigation Summary:
${investigation.analysis}

Messages around incident:
${incidentMessages.rows.map(m => `[${m.created_at}] ${m.author_name}: ${m.content}`).join('\n')}

Provide your verdict and detailed reasoning.`
      }]
    });
    
    return {
      appeal,
      investigation,
      incidentContext: incidentMessages.rows,
      verdict: verdictAnalysis.content[0].text
    };
  }

  // ============================================
  // APPEAL MANAGEMENT
  // ============================================
  async createAppeal(userId, userName, modActionId, reason) {
    const appealId = `APL-${Date.now().toString(36).toUpperCase()}`;
    
    await this.pool.query(`
      INSERT INTO appeals (appeal_id, user_id, user_name, mod_action_id, appeal_reason)
      VALUES ($1, $2, $3, $4, $5)
    `, [appealId, odUserId, userName, modActionId, reason]);
    
    return appealId;
  }

  async resolveAppeal(appealId, verdict, reviewerId, notes) {
    await this.pool.query(`
      UPDATE appeals 
      SET status = $1, verdict = $2, reviewed_by = $3, investigation_notes = $4, resolved_at = NOW()
      WHERE appeal_id = $5
    `, [
      verdict === 'APPROVE' ? 'approved' : verdict === 'DENY' ? 'denied' : 'reduced',
      verdict,
      reviewerId,
      notes,
      appealId
    ]);
  }
}

module.exports = InvestigationSystem;
