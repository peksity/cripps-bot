/**
 * ADVANCED INVESTIGATION SYSTEM
 * Enterprise-Grade User Analysis & Evidence Collection
 * 
 * Features:
 * - Behavioral Pattern Analysis
 * - Network/Relationship Mapping
 * - Timeline Reconstruction
 * - Sentiment Trending
 * - Contradiction Detection
 * - Predictive Risk Assessment
 * - Evidence Chain Building
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class AdvancedInvestigation {
  constructor(pool, anthropic, sharedIntelligence) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.intelligence = sharedIntelligence;
  }

  // ============================================
  // DATABASE INITIALIZATION
  // ============================================
  async initTables() {
    try {
      await this.pool.query(`
        -- Enhanced Message Log
        CREATE TABLE IF NOT EXISTS message_log (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(32) UNIQUE,
          channel_id VARCHAR(32),
          channel_name VARCHAR(64),
          guild_id VARCHAR(32),
          author_id VARCHAR(32),
          author_name VARCHAR(64),
          content TEXT,
          attachments JSONB DEFAULT '[]',
          embeds JSONB DEFAULT '[]',
          mentions JSONB DEFAULT '[]',
          reply_to VARCHAR(32),
          edited BOOLEAN DEFAULT FALSE,
          deleted BOOLEAN DEFAULT FALSE,
          sentiment_score FLOAT,
          toxicity_score FLOAT,
          created_at TIMESTAMP DEFAULT NOW(),
          edited_at TIMESTAMP,
          deleted_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_msg_author ON message_log(author_id);
        CREATE INDEX IF NOT EXISTS idx_msg_guild ON message_log(guild_id);
        CREATE INDEX IF NOT EXISTS idx_msg_channel ON message_log(channel_id);
        CREATE INDEX IF NOT EXISTS idx_msg_created ON message_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_msg_deleted ON message_log(deleted);

        -- Message Edit History
        CREATE TABLE IF NOT EXISTS message_edits (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(32),
          old_content TEXT,
          new_content TEXT,
          edit_number INT DEFAULT 1,
          edited_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_edits_msg ON message_edits(message_id);

        -- Server Rules
        CREATE TABLE IF NOT EXISTS server_rules (
          id SERIAL PRIMARY KEY,
          rule_id VARCHAR(16),
          guild_id VARCHAR(32),
          category VARCHAR(32),
          title VARCHAR(128),
          description TEXT,
          examples JSONB DEFAULT '[]',
          severity INT DEFAULT 5,
          auto_action VARCHAR(32),
          message_id VARCHAR(32),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(rule_id, guild_id)
        );

        -- Rule Violations
        CREATE TABLE IF NOT EXISTS rule_violations (
          id SERIAL PRIMARY KEY,
          rule_id VARCHAR(16),
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          message_id VARCHAR(32),
          message_content TEXT,
          channel_id VARCHAR(32),
          confidence FLOAT,
          ai_reasoning TEXT,
          action_taken VARCHAR(32),
          false_positive BOOLEAN DEFAULT FALSE,
          reviewed_by VARCHAR(32),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_violations_user ON rule_violations(user_id);

        -- Mod Actions
        CREATE TABLE IF NOT EXISTS mod_actions (
          id SERIAL PRIMARY KEY,
          action_id VARCHAR(32) UNIQUE,
          action_type VARCHAR(32),
          target_id VARCHAR(32),
          target_name VARCHAR(64),
          moderator_id VARCHAR(32),
          moderator_name VARCHAR(64),
          guild_id VARCHAR(32),
          reason TEXT,
          duration INT,
          evidence JSONB DEFAULT '[]',
          related_messages JSONB DEFAULT '[]',
          appeal_id VARCHAR(32),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_actions_target ON mod_actions(target_id);

        -- Appeals
        CREATE TABLE IF NOT EXISTS appeals (
          id SERIAL PRIMARY KEY,
          appeal_id VARCHAR(32) UNIQUE,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          action_id VARCHAR(32),
          action_type VARCHAR(32),
          user_statement TEXT,
          additional_info TEXT,
          ai_analysis TEXT,
          evidence_summary JSONB,
          status VARCHAR(16) DEFAULT 'pending',
          verdict VARCHAR(16),
          verdict_reason TEXT,
          reviewed_by VARCHAR(32),
          created_at TIMESTAMP DEFAULT NOW(),
          resolved_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
        CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);

        -- Warnings
        CREATE TABLE IF NOT EXISTS warnings (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(32),
          guild_id VARCHAR(32),
          rule_id VARCHAR(16),
          rule_text TEXT,
          context TEXT,
          severity INT DEFAULT 5,
          issued_by VARCHAR(32),
          expires_at TIMESTAMP,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id);

        -- Investigation Reports
        CREATE TABLE IF NOT EXISTS investigation_reports (
          id SERIAL PRIMARY KEY,
          report_id VARCHAR(32) UNIQUE,
          target_id VARCHAR(32),
          guild_id VARCHAR(32),
          requested_by VARCHAR(32),
          report_type VARCHAR(32),
          summary TEXT,
          detailed_analysis TEXT,
          risk_assessment JSONB,
          behavioral_patterns JSONB,
          network_analysis JSONB,
          recommendations JSONB,
          evidence_links JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      console.log('✅ Advanced Investigation tables ready');
    } catch (error) {
      console.error('Investigation init error:', error);
    }
  }

  // ============================================
  // MESSAGE LOGGING (Enhanced)
  // ============================================
  async logMessage(message) {
    if (!message.guild) return;
    
    try {
      // Extract mentions
      const mentions = {
        users: message.mentions.users.map(u => u.id),
        roles: message.mentions.roles.map(r => r.id),
        channels: message.mentions.channels.map(c => c.id)
      };
      
      // Basic sentiment analysis (will be enhanced with AI)
      const sentiment = this.quickSentiment(message.content);
      
      await this.pool.query(`
        INSERT INTO message_log (
          message_id, channel_id, channel_name, guild_id, author_id, author_name,
          content, attachments, embeds, mentions, reply_to, sentiment_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (message_id) DO NOTHING
      `, [
        message.id,
        message.channel.id,
        message.channel.name,
        message.guild.id,
        message.author.id,
        message.author.username,
        message.content,
        JSON.stringify(message.attachments.map(a => ({ url: a.url, name: a.name }))),
        JSON.stringify(message.embeds.map(e => ({ title: e.title, description: e.description }))),
        JSON.stringify(mentions),
        message.reference?.messageId || null,
        sentiment
      ]);
      
      // Update unified profile
      if (this.intelligence) {
        await this.intelligence.incrementStat(message.author.id, 'total_messages');
        
        // Track interactions if reply
        if (message.reference?.messageId) {
          const original = await this.pool.query(
            'SELECT author_id FROM message_log WHERE message_id = $1',
            [message.reference.messageId]
          );
          if (original.rows[0]) {
            await this.intelligence.recordInteraction(
              message.author.id,
              original.rows[0].author_id,
              message.guild.id,
              sentiment > -0.3
            );
          }
        }
      }
    } catch (error) {
      // Silent fail for logging
    }
  }

  async logEdit(oldMessage, newMessage) {
    if (!oldMessage.content || !newMessage.content) return;
    if (oldMessage.content === newMessage.content) return;
    
    try {
      // Get edit count
      const countResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM message_edits WHERE message_id = $1',
        [oldMessage.id]
      );
      const editNum = parseInt(countResult.rows[0]?.count || 0) + 1;
      
      await this.pool.query(`
        INSERT INTO message_edits (message_id, old_content, new_content, edit_number)
        VALUES ($1, $2, $3, $4)
      `, [oldMessage.id, oldMessage.content, newMessage.content, editNum]);
      
      await this.pool.query(`
        UPDATE message_log SET edited = TRUE, content = $2, edited_at = NOW()
        WHERE message_id = $1
      `, [oldMessage.id, newMessage.content]);
      
    } catch (error) {
      // Silent fail
    }
  }

  async logDeletion(message) {
    if (!message.id) return;
    
    try {
      await this.pool.query(`
        UPDATE message_log SET deleted = TRUE, deleted_at = NOW()
        WHERE message_id = $1
      `, [message.id]);
      
      // Record as behavioral event if high deletion rate
      if (this.intelligence && message.author) {
        const recentDeletes = await this.pool.query(`
          SELECT COUNT(*) FROM message_log 
          WHERE author_id = $1 AND deleted = TRUE AND deleted_at > NOW() - INTERVAL '1 hour'
        `, [message.author.id]);
        
        if (parseInt(recentDeletes.rows[0].count) > 5) {
          await this.intelligence.recordEvent(
            message.author.id,
            message.guild?.id,
            'high_deletion_rate',
            6,
            `Deleted ${recentDeletes.rows[0].count} messages in the last hour`,
            { latestContent: message.content?.slice(0, 200) }
          );
        }
      }
    } catch (error) {
      // Silent fail
    }
  }

  // ============================================
  // FULL INVESTIGATION
  // ============================================
  async runFullInvestigation(userId, guildId, requestedBy) {
    const reportId = `INV-${Date.now().toString(36).toUpperCase()}`;
    
    // Gather all data
    const [
      profile,
      messages,
      deletedMessages,
      editedMessages,
      violations,
      modActions,
      warnings,
      network,
      events
    ] = await Promise.all([
      this.intelligence?.getOrCreateProfile(userId),
      this.getUserMessages(userId, guildId, 200),
      this.getDeletedMessages(userId, guildId, 50),
      this.getEditedMessages(userId, guildId, 50),
      this.getViolations(userId, guildId),
      this.getModActions(userId, guildId),
      this.getWarnings(userId, guildId),
      this.intelligence?.getUserNetwork(userId, guildId) || [],
      this.intelligence?.getUserEvents(userId, 100) || []
    ]);
    
    // Calculate scores
    const trustScore = await this.intelligence?.calculateTrustScore(userId) || 50;
    const riskScore = await this.intelligence?.calculateRiskScore(userId, guildId) || 0;
    
    // Behavioral analysis
    const behavioralPatterns = await this.analyzeBehavioralPatterns(userId, guildId, messages);
    
    // Timeline of significant events
    const timeline = this.buildTimeline(messages, deletedMessages, violations, modActions, events);
    
    // AI Analysis
    const aiAnalysis = await this.generateAIAnalysis({
      userId,
      profile,
      messages: messages.slice(0, 50),
      deletedMessages: deletedMessages.slice(0, 20),
      violations,
      modActions,
      warnings,
      network,
      behavioralPatterns,
      trustScore,
      riskScore
    });
    
    // Save report
    await this.pool.query(`
      INSERT INTO investigation_reports (
        report_id, target_id, guild_id, requested_by, report_type,
        summary, detailed_analysis, risk_assessment, behavioral_patterns, network_analysis
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      reportId,
      userId,
      guildId,
      requestedBy,
      'full',
      aiAnalysis.summary,
      aiAnalysis.detailed,
      JSON.stringify({ trust: trustScore, risk: riskScore }),
      JSON.stringify(behavioralPatterns),
      JSON.stringify(network)
    ]);
    
    return {
      reportId,
      profile,
      stats: {
        totalMessages: messages.length,
        deletedCount: deletedMessages.length,
        editedCount: editedMessages.length,
        violationCount: violations.length,
        modActionCount: modActions.length,
        warningCount: warnings.length,
        networkSize: network.length
      },
      scores: { trust: trustScore, risk: riskScore },
      behavioralPatterns,
      timeline: timeline.slice(0, 20),
      network,
      analysis: aiAnalysis
    };
  }

  // ============================================
  // DATA RETRIEVAL
  // ============================================
  async getUserMessages(userId, guildId, limit = 100) {
    const result = await this.pool.query(`
      SELECT * FROM message_log 
      WHERE author_id = $1 AND guild_id = $2
      ORDER BY created_at DESC LIMIT $3
    `, [userId, guildId, limit]);
    return result.rows;
  }

  async getDeletedMessages(userId, guildId, limit = 50) {
    const result = await this.pool.query(`
      SELECT * FROM message_log 
      WHERE author_id = $1 AND guild_id = $2 AND deleted = TRUE
      ORDER BY deleted_at DESC LIMIT $3
    `, [userId, guildId, limit]);
    return result.rows;
  }

  async getEditedMessages(userId, guildId, limit = 50) {
    const result = await this.pool.query(`
      SELECT m.*, e.old_content, e.new_content, e.edit_number
      FROM message_log m
      JOIN message_edits e ON m.message_id = e.message_id
      WHERE m.author_id = $1 AND m.guild_id = $2
      ORDER BY e.edited_at DESC LIMIT $3
    `, [userId, guildId, limit]);
    return result.rows;
  }

  async getViolations(userId, guildId) {
    const result = await this.pool.query(`
      SELECT v.*, r.title as rule_title, r.severity as rule_severity
      FROM rule_violations v
      LEFT JOIN server_rules r ON v.rule_id = r.rule_id AND v.guild_id = r.guild_id
      WHERE v.user_id = $1 AND v.guild_id = $2
      ORDER BY v.created_at DESC
    `, [userId, guildId]);
    return result.rows;
  }

  async getModActions(userId, guildId) {
    const result = await this.pool.query(`
      SELECT * FROM mod_actions 
      WHERE target_id = $1 AND guild_id = $2
      ORDER BY created_at DESC
    `, [userId, guildId]);
    return result.rows;
  }

  async getWarnings(userId, guildId) {
    const result = await this.pool.query(`
      SELECT * FROM warnings 
      WHERE user_id = $1 AND guild_id = $2 AND active = TRUE
      ORDER BY created_at DESC
    `, [userId, guildId]);
    return result.rows;
  }

  async getConversationBetween(userA, userB, guildId, limit = 50) {
    const result = await this.pool.query(`
      SELECT * FROM message_log
      WHERE guild_id = $3 AND (
        (author_id = $1 AND reply_to IN (SELECT message_id FROM message_log WHERE author_id = $2))
        OR (author_id = $2 AND reply_to IN (SELECT message_id FROM message_log WHERE author_id = $1))
        OR (author_id = $1 AND $2 = ANY(SELECT jsonb_array_elements_text(mentions->'users')))
        OR (author_id = $2 AND $1 = ANY(SELECT jsonb_array_elements_text(mentions->'users')))
      )
      ORDER BY created_at DESC LIMIT $4
    `, [userA, userB, guildId, limit]);
    return result.rows;
  }

  // ============================================
  // BEHAVIORAL ANALYSIS
  // ============================================
  async analyzeBehavioralPatterns(userId, guildId, messages) {
    const patterns = {
      activityPattern: {},
      channelPreferences: {},
      averageSentiment: 0,
      sentimentTrend: 'stable',
      messageLength: { avg: 0, short: 0, medium: 0, long: 0 },
      replyRate: 0,
      mentionRate: 0,
      deleteRate: 0,
      editRate: 0,
      activeHours: {},
      activeDays: {}
    };
    
    if (messages.length === 0) return patterns;
    
    let totalSentiment = 0;
    let totalLength = 0;
    let replies = 0;
    let withMentions = 0;
    
    const recentSentiments = [];
    
    for (const msg of messages) {
      // Time analysis
      const date = new Date(msg.created_at);
      const hour = date.getHours();
      const day = date.getDay();
      
      patterns.activeHours[hour] = (patterns.activeHours[hour] || 0) + 1;
      patterns.activeDays[day] = (patterns.activeDays[day] || 0) + 1;
      
      // Channel preferences
      patterns.channelPreferences[msg.channel_name] = (patterns.channelPreferences[msg.channel_name] || 0) + 1;
      
      // Message length
      const len = msg.content?.length || 0;
      totalLength += len;
      if (len < 50) patterns.messageLength.short++;
      else if (len < 200) patterns.messageLength.medium++;
      else patterns.messageLength.long++;
      
      // Sentiment
      if (msg.sentiment_score !== null) {
        totalSentiment += msg.sentiment_score;
        recentSentiments.push(msg.sentiment_score);
      }
      
      // Interactions
      if (msg.reply_to) replies++;
      const mentions = msg.mentions ? JSON.parse(msg.mentions) : {};
      if (mentions.users?.length > 0) withMentions++;
    }
    
    patterns.averageSentiment = totalSentiment / messages.length;
    patterns.messageLength.avg = Math.round(totalLength / messages.length);
    patterns.replyRate = (replies / messages.length * 100).toFixed(1);
    patterns.mentionRate = (withMentions / messages.length * 100).toFixed(1);
    
    // Sentiment trend (compare recent to older)
    if (recentSentiments.length >= 20) {
      const recent = recentSentiments.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const older = recentSentiments.slice(-10).reduce((a, b) => a + b, 0) / 10;
      
      if (recent > older + 0.2) patterns.sentimentTrend = 'improving';
      else if (recent < older - 0.2) patterns.sentimentTrend = 'declining';
    }
    
    // Get delete/edit rates
    const stats = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE deleted = TRUE) as deleted,
        COUNT(*) FILTER (WHERE edited = TRUE) as edited,
        COUNT(*) as total
      FROM message_log WHERE author_id = $1 AND guild_id = $2
    `, [userId, guildId]);
    
    if (stats.rows[0].total > 0) {
      patterns.deleteRate = (stats.rows[0].deleted / stats.rows[0].total * 100).toFixed(1);
      patterns.editRate = (stats.rows[0].edited / stats.rows[0].total * 100).toFixed(1);
    }
    
    return patterns;
  }

  // ============================================
  // TIMELINE BUILDING
  // ============================================
  buildTimeline(messages, deletedMessages, violations, modActions, events) {
    const timeline = [];
    
    // Add violations
    for (const v of violations) {
      timeline.push({
        type: 'violation',
        severity: v.rule_severity || 5,
        timestamp: v.created_at,
        description: `Rule violation: ${v.rule_title || v.rule_id}`,
        details: v.message_content?.slice(0, 100)
      });
    }
    
    // Add mod actions
    for (const a of modActions) {
      timeline.push({
        type: 'mod_action',
        severity: a.action_type === 'ban' ? 10 : a.action_type === 'kick' ? 8 : 5,
        timestamp: a.created_at,
        description: `${a.action_type.toUpperCase()}: ${a.reason || 'No reason given'}`,
        details: `By ${a.moderator_name}`
      });
    }
    
    // Add significant deletions
    for (const d of deletedMessages.slice(0, 10)) {
      timeline.push({
        type: 'deletion',
        severity: 3,
        timestamp: d.deleted_at,
        description: `Deleted message in #${d.channel_name}`,
        details: d.content?.slice(0, 100)
      });
    }
    
    // Add behavioral events
    for (const e of events) {
      timeline.push({
        type: 'event',
        severity: e.severity,
        timestamp: e.created_at,
        description: e.description,
        details: e.event_type
      });
    }
    
    // Sort by timestamp descending
    timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return timeline;
  }

  // ============================================
  // AI ANALYSIS
  // ============================================
  async generateAIAnalysis(data) {
    try {
      const prompt = `You are an expert investigator analyzing a Discord user's behavior. Provide a professional analysis.

USER DATA:
- Trust Score: ${data.trustScore}/100
- Risk Score: ${data.riskScore}/100
- Total Messages Logged: ${data.messages.length}
- Deleted Messages: ${data.deletedMessages.length}
- Rule Violations: ${data.violations.length}
- Mod Actions Against Them: ${data.modActions.length}
- Active Warnings: ${data.warnings.length}
- Network Size: ${data.network.length} connections

BEHAVIORAL PATTERNS:
${JSON.stringify(data.behavioralPatterns, null, 2)}

RECENT VIOLATIONS:
${data.violations.slice(0, 5).map(v => `- ${v.rule_title || v.rule_id}: "${v.message_content?.slice(0, 80)}"`).join('\n') || 'None'}

DELETED MESSAGES (sample):
${data.deletedMessages.slice(0, 5).map(m => `- "${m.content?.slice(0, 80)}"`).join('\n') || 'None'}

MOD ACTIONS:
${data.modActions.slice(0, 5).map(a => `- ${a.action_type}: ${a.reason || 'No reason'}`).join('\n') || 'None'}

NETWORK (top connections):
${data.network.slice(0, 5).map(n => `- ${n.interaction_count} interactions (${n.positive_interactions} positive, ${n.negative_interactions} negative)`).join('\n') || 'No significant connections'}

Provide:
1. A 2-3 sentence summary of this user
2. Key behavioral observations (2-3 points)
3. Risk assessment and concerns (if any)
4. Recommendations for moderators

Be direct and professional. Do not be overly dramatic. Focus on patterns and facts.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const analysis = response.content[0].text;
      
      // Split into summary and detailed
      const lines = analysis.split('\n').filter(l => l.trim());
      const summary = lines.slice(0, 3).join(' ');
      
      return {
        summary: summary.slice(0, 500),
        detailed: analysis,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI Analysis error:', error);
      return {
        summary: `User has ${data.messages.length} messages logged, ${data.violations.length} violations, trust score ${data.trustScore}/100.`,
        detailed: 'AI analysis unavailable.',
        generatedAt: new Date().toISOString()
      };
    }
  }

  // ============================================
  // CONTRADICTION DETECTION
  // ============================================
  async detectContradictions(userId, statement) {
    try {
      // Get user's message history
      const messages = await this.pool.query(`
        SELECT content, created_at FROM message_log
        WHERE author_id = $1 AND content IS NOT NULL AND LENGTH(content) > 20
        ORDER BY created_at DESC LIMIT 100
      `, [userId]);
      
      if (messages.rows.length < 5) {
        return { found: false, reason: 'Insufficient message history' };
      }
      
      const prompt = `Analyze if this statement contradicts the user's message history.

STATEMENT TO CHECK:
"${statement}"

USER'S RECENT MESSAGES:
${messages.rows.slice(0, 30).map(m => `- "${m.content.slice(0, 150)}"`).join('\n')}

If you find contradictions, list them specifically with quotes. If no contradictions, say so.
Be factual and specific. Don't reach or assume.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const analysis = response.content[0].text.toLowerCase();
      const found = analysis.includes('contradict') && !analysis.includes('no contradict');
      
      return {
        found,
        analysis: response.content[0].text
      };
    } catch (error) {
      return { found: false, error: 'Analysis failed' };
    }
  }

  // ============================================
  // PREDICTIVE ANALYSIS
  // ============================================
  async predictRisk(userId, guildId) {
    const [
      recentViolations,
      deletionTrend,
      sentimentTrend,
      recentEvents
    ] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*) FROM rule_violations 
        WHERE user_id = $1 AND guild_id = $2 AND created_at > NOW() - INTERVAL '7 days'
      `, [userId, guildId]),
      this.pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE deleted_at > NOW() - INTERVAL '24 hours') as last_24h,
          COUNT(*) FILTER (WHERE deleted_at > NOW() - INTERVAL '7 days') as last_week
        FROM message_log WHERE author_id = $1 AND guild_id = $2 AND deleted = TRUE
      `, [userId, guildId]),
      this.pool.query(`
        SELECT AVG(sentiment_score) as avg_sentiment
        FROM message_log 
        WHERE author_id = $1 AND guild_id = $2 AND created_at > NOW() - INTERVAL '24 hours'
      `, [userId, guildId]),
      this.pool.query(`
        SELECT COUNT(*) FROM behavioral_events 
        WHERE user_id = $1 AND guild_id = $2 AND severity >= 6 AND created_at > NOW() - INTERVAL '48 hours'
      `, [userId, guildId])
    ]);
    
    const predictions = {
      likelyToViolate: false,
      likelyToEscalate: false,
      likelyToLeave: false,
      concerns: []
    };
    
    const violationCount = parseInt(recentViolations.rows[0].count);
    const deletions24h = parseInt(deletionTrend.rows[0].last_24h);
    const avgSentiment = parseFloat(sentimentTrend.rows[0].avg_sentiment) || 0;
    const highSeverityEvents = parseInt(recentEvents.rows[0].count);
    
    // Violation prediction
    if (violationCount >= 2) {
      predictions.likelyToViolate = true;
      predictions.concerns.push(`${violationCount} violations in the last 7 days`);
    }
    
    // Escalation prediction
    if (deletions24h >= 5 || avgSentiment < -0.4) {
      predictions.likelyToEscalate = true;
      if (deletions24h >= 5) predictions.concerns.push(`High deletion activity (${deletions24h} in 24h)`);
      if (avgSentiment < -0.4) predictions.concerns.push(`Negative sentiment trend`);
    }
    
    // High severity events
    if (highSeverityEvents >= 2) {
      predictions.likelyToEscalate = true;
      predictions.concerns.push(`${highSeverityEvents} high-severity events in 48h`);
    }
    
    return predictions;
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  quickSentiment(text) {
    if (!text) return 0;
    
    const positive = ['thanks', 'thank', 'good', 'great', 'awesome', 'nice', 'love', 'lol', 'lmao', 'haha', '😊', '😄', '👍', '❤️', 'gg', 'poggers', 'pog', 'w', 'dub'];
    const negative = ['hate', 'stupid', 'dumb', 'idiot', 'fuck', 'shit', 'ass', 'trash', 'garbage', 'suck', 'terrible', 'worst', 'bad', 'toxic', 'cringe', 'L', 'ratio', '😡', '🤬', 'stfu', 'kys'];
    
    const lower = text.toLowerCase();
    let score = 0;
    
    for (const word of positive) {
      if (lower.includes(word)) score += 0.2;
    }
    for (const word of negative) {
      if (lower.includes(word)) score -= 0.3;
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  // ============================================
  // EMBED BUILDERS
  // ============================================
  buildInvestigationEmbed(result, targetUser) {
    const riskColor = result.scores.risk > 60 ? 0xFF0000 : result.scores.risk > 30 ? 0xFFA500 : 0x00FF00;
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 INVESTIGATION: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(riskColor)
      .setDescription(result.analysis.summary)
      .addFields(
        { 
          name: '📊 Scores', 
          value: `Trust: ${result.scores.trust}/100\nRisk: ${result.scores.risk}/100`, 
          inline: true 
        },
        { 
          name: '📈 Activity', 
          value: `Messages: ${result.stats.totalMessages}\nDeleted: ${result.stats.deletedCount}\nEdited: ${result.stats.editedCount}`, 
          inline: true 
        },
        { 
          name: '⚠️ Record', 
          value: `Violations: ${result.stats.violationCount}\nMod Actions: ${result.stats.modActionCount}\nWarnings: ${result.stats.warningCount}`, 
          inline: true 
        }
      )
      .setFooter({ text: `Report ID: ${result.reportId}` })
      .setTimestamp();
    
    // Add behavioral insights
    if (result.behavioralPatterns) {
      const bp = result.behavioralPatterns;
      embed.addFields({
        name: '🧠 Behavioral Pattern',
        value: `Sentiment: ${bp.sentimentTrend} (avg: ${bp.averageSentiment?.toFixed(2) || 'N/A'})\nDelete Rate: ${bp.deleteRate}%\nReply Rate: ${bp.replyRate}%`,
        inline: false
      });
    }
    
    return embed;
  }
}

module.exports = AdvancedInvestigation;
