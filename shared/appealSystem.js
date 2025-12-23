/**
 * APPEAL SYSTEM
 * Full Moderation Appeal Workflow
 * 
 * Features:
 * - Auto-DM on ban/kick/mute with appeal option
 * - Multi-step appeal process
 * - Evidence cross-reference
 * - AI analysis of appeal vs evidence
 * - Mod review dashboard
 * - Appeal tracking and history
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class AppealSystem {
  constructor(pool, anthropic, investigation, intelligence) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.investigation = investigation;
    this.intelligence = intelligence;
    this.activeAppeals = new Map(); // oduserId -> appeal state
  }

  // ============================================
  // AUTO-DM ON MODERATION ACTION
  // ============================================
  async onModerationAction(action, targetUser, guild, moderator, reason, duration = null) {
    const actionId = `ACT-${Date.now().toString(36).toUpperCase()}`;
    
    try {
      // Log the action
      await this.pool.query(`
        INSERT INTO mod_actions (action_id, action_type, target_id, target_name, moderator_id, moderator_name, guild_id, reason, duration)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [actionId, action, targetUser.id, targetUser.username, moderator.id, moderator.username, guild.id, reason, duration]);
      
      // Update user profile
      if (this.intelligence) {
        const statMap = {
          'warn': 'warnings_received',
          'mute': 'mutes_received',
          'kick': 'kicks_received',
          'ban': 'bans_received'
        };
        if (statMap[action]) {
          await this.intelligence.incrementStat(targetUser.id, statMap[action]);
        }
      }
      
      // Send appeal DM (except for warnings)
      if (['mute', 'kick', 'ban'].includes(action)) {
        await this.sendAppealDM(targetUser, action, actionId, guild, reason, duration);
      }
      
      return actionId;
    } catch (error) {
      console.error('Mod action logging error:', error);
      return null;
    }
  }

  async sendAppealDM(user, action, actionId, guild, reason, duration) {
    try {
      const actionNames = {
        'mute': 'muted',
        'kick': 'kicked',
        'ban': 'banned'
      };
      
      const durationText = duration ? ` for ${this.formatDuration(duration)}` : '';
      
      const embed = new EmbedBuilder()
        .setTitle(`⚖️ You've been ${actionNames[action]}${durationText}`)
        .setDescription(`**Server:** ${guild.name}\n**Reason:** ${reason || 'No reason provided'}\n**Action ID:** \`${actionId}\``)
        .setColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xFF8C00 : 0xFFAA00)
        .addFields(
          { name: '📨 Want to Appeal?', value: 'If you believe this was unfair, you can submit an appeal. I\'ll pull your record and let you make your case.', inline: false },
          { name: '⏰ Appeal Window', value: action === 'ban' ? '7 days' : '48 hours', inline: true },
          { name: '📋 What Happens', value: 'Your appeal goes to the mod team with full context. They\'ll review and decide.', inline: true }
        )
        .setFooter({ text: 'Reply "appeal" to start the process' })
        .setTimestamp();
      
      await user.send({ embeds: [embed] });
      
      // Store pending appeal opportunity
      this.activeAppeals.set(user.id, {
        stage: 'offered',
        actionId,
        action,
        guildId: guild.id,
        guildName: guild.name,
        reason,
        expiresAt: Date.now() + (action === 'ban' ? 7 * 24 * 60 * 60 * 1000 : 48 * 60 * 60 * 1000)
      });
      
      // Clean up after expiry
      setTimeout(() => {
        const appeal = this.activeAppeals.get(user.id);
        if (appeal && appeal.stage === 'offered') {
          this.activeAppeals.delete(user.id);
        }
      }, action === 'ban' ? 7 * 24 * 60 * 60 * 1000 : 48 * 60 * 60 * 1000);
      
    } catch (error) {
      // Can't DM user (blocked or disabled)
      console.log(`Couldn't send appeal DM to ${user.username}`);
    }
  }

  // ============================================
  // APPEAL CONVERSATION HANDLER
  // ============================================
  async handleAppealMessage(message) {
    const userId = message.author.id;
    const content = message.content.toLowerCase().trim();
    
    // Check if they have a pending appeal opportunity
    if (!this.activeAppeals.has(userId)) {
      // Check if they can start a new appeal
      const recentAction = await this.pool.query(`
        SELECT * FROM mod_actions 
        WHERE target_id = $1 AND action_type IN ('mute', 'kick', 'ban')
        AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC LIMIT 1
      `, [userId]);
      
      if (recentAction.rows.length > 0) {
        const action = recentAction.rows[0];
        this.activeAppeals.set(userId, {
          stage: 'offered',
          actionId: action.action_id,
          action: action.action_type,
          guildId: action.guild_id,
          reason: action.reason,
          expiresAt: Date.now() + 48 * 60 * 60 * 1000
        });
      } else {
        await message.reply("*checks records* I don't see any recent mod actions against you. If you got banned more than 7 days ago, the appeal window's closed.");
        return;
      }
    }
    
    const appeal = this.activeAppeals.get(userId);
    
    // Check expiry
    if (appeal.expiresAt && Date.now() > appeal.expiresAt) {
      this.activeAppeals.delete(userId);
      await message.reply("Appeal window's closed. Should've come to me sooner.");
      return;
    }
    
    switch (appeal.stage) {
      case 'offered':
        await this.handleOfferResponse(message, appeal, userId, content);
        break;
      case 'statement':
        await this.handleStatement(message, appeal, userId);
        break;
      case 'review':
        await this.handleReviewResponse(message, appeal, userId, content);
        break;
      case 'additional':
        await this.handleAdditionalInfo(message, appeal, userId, content);
        break;
    }
  }

  async handleOfferResponse(message, appeal, userId, content) {
    if (content.includes('appeal') || content.includes('yes')) {
      appeal.stage = 'statement';
      
      const embed = new EmbedBuilder()
        .setTitle('📝 Appeal Process Started')
        .setDescription(`Alright, let's hear your side.\n\n**The action:** You were ${appeal.action}ed\n**Their reason:** ${appeal.reason || 'Not specified'}\n\nTell me what happened and why you think it was wrong. Be honest - I'll be cross-referencing everything you say with your message history.`)
        .setColor(0x5865F2)
        .setFooter({ text: 'Type your statement below' });
      
      await message.reply({ embeds: [embed] });
    } else if (content.includes('no') || content.includes('nevermind')) {
      this.activeAppeals.delete(userId);
      await message.reply("*shrugs* Fine by me. Come back if you change your mind.");
    } else {
      await message.reply("Say 'appeal' if you want to contest the action, or 'no' if you're good.");
    }
  }

  async handleStatement(message, appeal, userId) {
    appeal.statement = message.content;
    appeal.stage = 'review';
    
    const loading = await message.reply("*pulls up your file* Give me a second...");
    
    try {
      // Run investigation
      const investigation = await this.investigation.runFullInvestigation(userId, appeal.guildId, 'appeal_system');
      appeal.investigation = investigation;
      
      // Check for contradictions
      const contradictions = await this.investigation.detectContradictions(userId, message.content);
      appeal.contradictions = contradictions;
      
      // Build evidence summary
      const evidenceEmbed = new EmbedBuilder()
        .setTitle('📋 Your Record')
        .setColor(investigation.scores.risk > 50 ? 0xFF0000 : 0xFFAA00)
        .setDescription(`Here's what I found in your file.\n\n**Trust Score:** ${investigation.scores.trust}/100\n**Risk Score:** ${investigation.scores.risk}/100`)
        .addFields(
          { name: '📊 Activity', value: `${investigation.stats.totalMessages} messages logged\n${investigation.stats.deletedCount} deleted\n${investigation.stats.violationCount} violations`, inline: true },
          { name: '⚠️ Mod History', value: `${investigation.stats.modActionCount} mod actions\n${investigation.stats.warningCount} active warnings`, inline: true }
        );
      
      if (contradictions.found) {
        evidenceEmbed.addFields({
          name: '🔍 Contradiction Alert',
          value: contradictions.analysis.slice(0, 500),
          inline: false
        });
      }
      
      evidenceEmbed.addFields({
        name: '📝 Your Statement',
        value: appeal.statement.slice(0, 500),
        inline: false
      });
      
      evidenceEmbed.setFooter({ text: 'Say "submit" to send to mods, or add more info' });
      
      await loading.edit({ content: null, embeds: [evidenceEmbed] });
      
    } catch (error) {
      console.error('Appeal investigation error:', error);
      await loading.edit("Had trouble pulling your full record. You can still submit - say 'submit' when ready.");
    }
  }

  async handleReviewResponse(message, appeal, userId, content) {
    if (content.includes('submit') || content.includes('send')) {
      await this.submitAppeal(message, appeal, userId);
    } else if (content.includes('cancel') || content.includes('nevermind')) {
      this.activeAppeals.delete(userId);
      await message.reply("Appeal cancelled. The action stands.");
    } else {
      // They're adding more info
      appeal.additionalInfo = (appeal.additionalInfo || '') + '\n' + message.content;
      await message.reply("Noted. Say 'submit' when you're done, or keep adding info.");
    }
  }

  async handleAdditionalInfo(message, appeal, userId, content) {
    if (content.includes('submit')) {
      await this.submitAppeal(message, appeal, userId);
    } else {
      appeal.additionalInfo = (appeal.additionalInfo || '') + '\n' + message.content;
      await message.reply("Got it. Say 'submit' to finalize.");
    }
  }

  // ============================================
  // SUBMIT APPEAL
  // ============================================
  async submitAppeal(message, appeal, userId) {
    const appealId = `APP-${Date.now().toString(36).toUpperCase()}`;
    
    try {
      // Generate AI analysis of appeal
      const aiAnalysis = await this.analyzeAppeal(appeal);
      
      // Save to database
      await this.pool.query(`
        INSERT INTO appeals (
          appeal_id, user_id, guild_id, action_id, action_type,
          user_statement, additional_info, ai_analysis, evidence_summary, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      `, [
        appealId,
        userId,
        appeal.guildId,
        appeal.actionId,
        appeal.action,
        appeal.statement,
        appeal.additionalInfo || null,
        aiAnalysis,
        JSON.stringify(appeal.investigation?.stats || {})
      ]);
      
      // Update user profile
      if (this.intelligence) {
        await this.intelligence.incrementStat(userId, 'appeals_submitted');
      }
      
      // Send to mod channel
      await this.notifyMods(appeal, appealId, userId, message.author, aiAnalysis);
      
      // Confirm to user
      const confirmEmbed = new EmbedBuilder()
        .setTitle('✅ Appeal Submitted')
        .setDescription(`Your appeal has been sent to the mod team.\n\n**Appeal ID:** \`${appealId}\`\n\nThey'll review your case and make a decision. I can't promise anything, but at least you've been heard.`)
        .setColor(0x00FF00)
        .setFooter({ text: 'You\'ll be notified of the decision' });
      
      await message.reply({ embeds: [confirmEmbed] });
      this.activeAppeals.delete(userId);
      
      return appealId;
    } catch (error) {
      console.error('Submit appeal error:', error);
      await message.reply("Something went wrong submitting your appeal. Try again or contact a mod directly.");
      return null;
    }
  }

  async analyzeAppeal(appeal) {
    try {
      const prompt = `Analyze this appeal from a moderation perspective.

ORIGINAL ACTION: ${appeal.action}
ORIGINAL REASON: ${appeal.reason || 'Not specified'}

USER'S STATEMENT:
"${appeal.statement}"

${appeal.additionalInfo ? `ADDITIONAL INFO:\n"${appeal.additionalInfo}"` : ''}

USER'S RECORD:
- Trust Score: ${appeal.investigation?.scores?.trust || 'Unknown'}/100
- Risk Score: ${appeal.investigation?.scores?.risk || 'Unknown'}/100
- Total Messages: ${appeal.investigation?.stats?.totalMessages || 'Unknown'}
- Deleted Messages: ${appeal.investigation?.stats?.deletedCount || 'Unknown'}
- Past Violations: ${appeal.investigation?.stats?.violationCount || 'Unknown'}
- Past Mod Actions: ${appeal.investigation?.stats?.modActionCount || 'Unknown'}

${appeal.contradictions?.found ? `CONTRADICTIONS DETECTED:\n${appeal.contradictions.analysis}` : 'NO CONTRADICTIONS DETECTED'}

Provide:
1. Summary of the appeal (2 sentences)
2. Credibility assessment (considering their record and any contradictions)
3. Key factors mods should consider
4. Recommendation (uphold/reduce/overturn) with brief reasoning

Be balanced and factual. Consider both the user's perspective and server safety.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      });
      
      return response.content[0].text;
    } catch (error) {
      return 'AI analysis unavailable.';
    }
  }

  async notifyMods(appeal, appealId, userId, user, aiAnalysis) {
    try {
      // This needs to be called from a bot that has access to the guild
      // For now, we'll store the notification and let the bot pick it up
      await this.pool.query(`
        INSERT INTO bot_messages (from_bot, to_bot, message_type, priority, payload)
        VALUES ('appeal_system', 'lester', 'appeal_notification', 10, $1)
      `, [JSON.stringify({
        appealId,
        oduserId: userId,
        username: user.username,
        guildId: appeal.guildId,
        action: appeal.action,
        statement: appeal.statement?.slice(0, 500),
        aiAnalysis,
        investigation: appeal.investigation?.stats
      })]);
    } catch (error) {
      console.error('Notify mods error:', error);
    }
  }

  // ============================================
  // MOD REVIEW COMMANDS
  // ============================================
  async getPendingAppeals(guildId) {
    const result = await this.pool.query(`
      SELECT a.*, m.reason as original_reason, m.moderator_name
      FROM appeals a
      LEFT JOIN mod_actions m ON a.action_id = m.action_id
      WHERE a.guild_id = $1 AND a.status = 'pending'
      ORDER BY a.created_at ASC
    `, [guildId]);
    return result.rows;
  }

  async getAppeal(appealId) {
    const result = await this.pool.query(`
      SELECT a.*, m.reason as original_reason, m.moderator_name, m.duration
      FROM appeals a
      LEFT JOIN mod_actions m ON a.action_id = m.action_id
      WHERE a.appeal_id = $1
    `, [appealId]);
    return result.rows[0];
  }

  async resolveAppeal(appealId, verdict, verdictReason, reviewerId) {
    try {
      await this.pool.query(`
        UPDATE appeals 
        SET status = 'resolved', verdict = $2, verdict_reason = $3, reviewed_by = $4, resolved_at = NOW()
        WHERE appeal_id = $1
      `, [appealId, verdict, verdictReason, reviewerId]);
      
      const appeal = await this.getAppeal(appealId);
      
      // Update stats if overturned
      if (verdict === 'overturn' && this.intelligence) {
        await this.intelligence.incrementStat(appeal.user_id, 'appeals_won');
      }
      
      return appeal;
    } catch (error) {
      console.error('Resolve appeal error:', error);
      return null;
    }
  }

  buildAppealEmbed(appeal) {
    const statusColors = {
      'pending': 0xFFAA00,
      'resolved': appeal.verdict === 'overturn' ? 0x00FF00 : 0xFF0000
    };
    
    const embed = new EmbedBuilder()
      .setTitle(`📨 Appeal: ${appeal.appeal_id}`)
      .setColor(statusColors[appeal.status] || 0x5865F2)
      .addFields(
        { name: '👤 User', value: `<@${appeal.user_id}>`, inline: true },
        { name: '⚖️ Action', value: appeal.action_type.toUpperCase(), inline: true },
        { name: '📋 Status', value: appeal.status.toUpperCase(), inline: true },
        { name: '📝 Original Reason', value: appeal.original_reason || 'Not specified', inline: false },
        { name: '💬 User Statement', value: appeal.user_statement?.slice(0, 500) || 'None', inline: false }
      )
      .setTimestamp(new Date(appeal.created_at));
    
    if (appeal.ai_analysis) {
      embed.addFields({
        name: '🤖 AI Analysis',
        value: appeal.ai_analysis.slice(0, 800),
        inline: false
      });
    }
    
    if (appeal.status === 'resolved') {
      embed.addFields(
        { name: '⚖️ Verdict', value: appeal.verdict?.toUpperCase() || 'Unknown', inline: true },
        { name: '👮 Reviewed By', value: appeal.reviewed_by || 'Unknown', inline: true },
        { name: '📝 Verdict Reason', value: appeal.verdict_reason || 'None provided', inline: false }
      );
    }
    
    return embed;
  }

  buildAppealButtons(appealId) {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`appeal_overturn_${appealId}`)
          .setLabel('✅ Overturn')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`appeal_reduce_${appealId}`)
          .setLabel('⚖️ Reduce')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`appeal_uphold_${appealId}`)
          .setLabel('❌ Uphold')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`appeal_info_${appealId}`)
          .setLabel('📋 Full Record')
          .setStyle(ButtonStyle.Secondary)
      );
  }

  // ============================================
  // UTILITIES
  // ============================================
  formatDuration(seconds) {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  }
}

module.exports = AppealSystem;
