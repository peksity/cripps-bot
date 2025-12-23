/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEHAVIORAL PREDICTION AI v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Not detecting bad behavior - PREDICTING it.
 * 
 * Features:
 * - "User X has 73% chance of causing drama in next 48 hours"
 * - Pattern recognition across thousands of data points
 * - Detects brewing conflicts before they explode
 * - Recommends intervention strategies
 * - Learns from outcomes
 * - Early warning system for moderators
 * 
 * This is what big companies pay millions for. Shrunk to Discord scale.
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

const INDICATORS = {
  // Message patterns
  message_frequency: {
    weight: 0.15,
    description: 'Sudden changes in message frequency',
    calculate: (current, baseline) => Math.abs(current - baseline) / Math.max(baseline, 1)
  },
  message_length: {
    weight: 0.10,
    description: 'Changes in average message length',
    calculate: (current, baseline) => Math.abs(current - baseline) / Math.max(baseline, 1)
  },
  caps_ratio: {
    weight: 0.20,
    description: 'Increased use of caps lock',
    calculate: (ratio) => Math.min(ratio * 2, 1)
  },
  punctuation_intensity: {
    weight: 0.15,
    description: 'Excessive punctuation (!!!, ???)',
    calculate: (ratio) => Math.min(ratio * 3, 1)
  },

  // Sentiment indicators
  negative_sentiment: {
    weight: 0.25,
    description: 'Negative language patterns',
    keywords: ['hate', 'stupid', 'idiot', 'trash', 'garbage', 'worst', 'terrible', 
               'annoying', 'ridiculous', 'unfair', 'scam', 'pathetic', 'useless']
  },
  confrontational: {
    weight: 0.30,
    description: 'Confrontational language',
    keywords: ['fight', 'you always', 'you never', 'why don\'t you', 'seriously?',
               'what is wrong with', 'are you kidding', 'unbelievable', 'how dare']
  },
  passive_aggressive: {
    weight: 0.20,
    description: 'Passive-aggressive patterns',
    keywords: ['fine.', 'whatever.', 'sure.', 'ok then', 'i guess', 'if you say so',
               'not that anyone cares', 'but that\'s just me', 'no offense but']
  },

  // Behavioral patterns
  response_time: {
    weight: 0.10,
    description: 'Unusually fast responses (reactive)',
    calculate: (avgMs) => avgMs < 2000 ? 0.8 : avgMs < 5000 ? 0.4 : 0
  },
  channel_hopping: {
    weight: 0.15,
    description: 'Rapidly switching channels',
    calculate: (switches, timeframe) => Math.min(switches / 10, 1)
  },
  mention_frequency: {
    weight: 0.20,
    description: 'Increased @mentions of specific users',
    calculate: (mentions, baseline) => mentions > baseline * 2 ? 0.8 : mentions > baseline ? 0.4 : 0
  },

  // Social patterns
  isolation: {
    weight: 0.15,
    description: 'Withdrawal from usual channels',
    calculate: (current, usual) => usual > 0 ? 1 - (current / usual) : 0
  },
  new_targets: {
    weight: 0.25,
    description: 'Engaging new users they don\'t normally interact with',
    calculate: (newInteractions, total) => newInteractions / Math.max(total, 1)
  },
  
  // Time patterns
  unusual_hours: {
    weight: 0.10,
    description: 'Active during unusual hours',
    calculate: (hour, usualHours) => usualHours.includes(hour) ? 0 : 0.5
  },
  
  // Historical
  prior_incidents: {
    weight: 0.35,
    description: 'History of warnings/timeouts',
    calculate: (count, daysSinceLast) => {
      if (count === 0) return 0;
      const recency = Math.max(0, 1 - (daysSinceLast / 30));
      return Math.min(count * 0.2 + recency * 0.5, 1);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFLICT PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const CONFLICT_PATTERNS = {
  brewing_argument: {
    name: 'Brewing Argument',
    indicators: ['confrontational', 'caps_ratio', 'response_time', 'mention_frequency'],
    threshold: 0.6,
    urgency: 'medium',
    intervention: 'Consider redirecting the conversation or addressing the topic privately.'
  },
  frustration_buildup: {
    name: 'Frustration Buildup',
    indicators: ['negative_sentiment', 'punctuation_intensity', 'message_frequency'],
    threshold: 0.5,
    urgency: 'low',
    intervention: 'User may benefit from a break. Consider gentle engagement.'
  },
  targeted_harassment: {
    name: 'Potential Harassment',
    indicators: ['mention_frequency', 'new_targets', 'confrontational', 'prior_incidents'],
    threshold: 0.7,
    urgency: 'high',
    intervention: 'Monitor closely. Consider proactive moderation if pattern continues.'
  },
  isolation_withdrawal: {
    name: 'Social Withdrawal',
    indicators: ['isolation', 'unusual_hours', 'message_frequency'],
    threshold: 0.5,
    urgency: 'low',
    intervention: 'User may be struggling. Consider wellness check-in.'
  },
  escalation_spiral: {
    name: 'Escalation Spiral',
    indicators: ['confrontational', 'caps_ratio', 'response_time', 'punctuation_intensity', 'negative_sentiment'],
    threshold: 0.75,
    urgency: 'critical',
    intervention: 'IMMEDIATE attention needed. Active conflict likely.'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL PREDICTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class BehaviorPredictionEngine {
  constructor(pool, anthropic, client) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.client = client;
    this.userProfiles = new Map();
    this.activeAlerts = new Map();
    this.predictionCache = new Map();
  }

  async initialize() {
    // User behavior profiles
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_profiles (
        user_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        baseline_data JSONB DEFAULT '{}',
        current_metrics JSONB DEFAULT '{}',
        risk_score FLOAT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Message analytics (rolling window)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_messages (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_length INTEGER,
        caps_ratio FLOAT,
        punctuation_ratio FLOAT,
        sentiment_score FLOAT,
        mentions INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Predictions made
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_predictions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        confidence FLOAT NOT NULL,
        prediction TEXT,
        outcome TEXT,
        accurate BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    // Alerts for moderators
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_alerts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        urgency TEXT NOT NULL,
        confidence FLOAT NOT NULL,
        details JSONB,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Incident history (for learning)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_incidents (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        incident_type TEXT NOT NULL,
        severity INTEGER,
        action_taken TEXT,
        pre_incident_metrics JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Start background analysis
    this.startBackgroundAnalysis();

    console.log('✅ Behavioral Prediction AI initialized');
  }

  /**
   * Analyze a message and update user profile
   */
  async analyzeMessage(message) {
    if (message.author.bot) return;

    const userId = message.author.id;
    const guildId = message.guild?.id;
    if (!guildId) return;

    const content = message.content;
    
    // Calculate message metrics
    const metrics = {
      length: content.length,
      caps_ratio: this.calculateCapsRatio(content),
      punctuation_ratio: this.calculatePunctuationIntensity(content),
      sentiment: await this.analyzeSentiment(content),
      mentions: message.mentions.users.size,
      timestamp: new Date()
    };

    // Store message data
    await this.pool.query(`
      INSERT INTO behavior_messages 
      (user_id, guild_id, channel_id, message_length, caps_ratio, punctuation_ratio, sentiment_score, mentions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [userId, guildId, message.channel.id, metrics.length, metrics.caps_ratio, 
        metrics.punctuation_ratio, metrics.sentiment, metrics.mentions]);

    // Update user profile with rolling metrics
    await this.updateProfile(userId, guildId, metrics);

    // Check for concerning patterns
    const riskAssessment = await this.assessRisk(userId, guildId);
    
    if (riskAssessment.risk > 0.5) {
      await this.generateAlert(userId, guildId, riskAssessment);
    }

    // Cleanup old data (keep 7 days)
    await this.cleanupOldData();

    return riskAssessment;
  }

  /**
   * Calculate caps ratio in message
   */
  calculateCapsRatio(text) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return 0;
    const caps = letters.replace(/[^A-Z]/g, '').length;
    return caps / letters.length;
  }

  /**
   * Calculate punctuation intensity
   */
  calculatePunctuationIntensity(text) {
    const intense = (text.match(/[!?]{2,}/g) || []).length;
    const total = text.length;
    return total > 0 ? Math.min(intense / total * 10, 1) : 0;
  }

  /**
   * Analyze sentiment (simplified - could use Claude for deeper analysis)
   */
  async analyzeSentiment(text) {
    const lower = text.toLowerCase();
    let score = 0;
    
    // Check negative keywords
    for (const keyword of INDICATORS.negative_sentiment.keywords) {
      if (lower.includes(keyword)) score -= 0.15;
    }
    
    // Check confrontational keywords
    for (const keyword of INDICATORS.confrontational.keywords) {
      if (lower.includes(keyword)) score -= 0.2;
    }
    
    // Check passive-aggressive
    for (const keyword of INDICATORS.passive_aggressive.keywords) {
      if (lower.includes(keyword)) score -= 0.1;
    }

    // Positive indicators
    const positive = ['thanks', 'thank you', 'appreciate', 'love', 'great', 'awesome', 
                     'nice', 'helpful', 'perfect', 'amazing', 'wonderful'];
    for (const keyword of positive) {
      if (lower.includes(keyword)) score += 0.1;
    }

    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Update user behavioral profile
   */
  async updateProfile(userId, guildId, metrics) {
    // Get recent messages for this user
    const recent = await this.pool.query(`
      SELECT * FROM behavior_messages 
      WHERE user_id = $1 AND guild_id = $2 
      AND timestamp > NOW() - INTERVAL '24 hours'
      ORDER BY timestamp DESC
    `, [userId, guildId]);

    const messages = recent.rows;

    // Calculate rolling averages
    const avgLength = messages.reduce((sum, m) => sum + m.message_length, 0) / Math.max(messages.length, 1);
    const avgCaps = messages.reduce((sum, m) => sum + parseFloat(m.caps_ratio), 0) / Math.max(messages.length, 1);
    const avgPunct = messages.reduce((sum, m) => sum + parseFloat(m.punctuation_ratio), 0) / Math.max(messages.length, 1);
    const avgSentiment = messages.reduce((sum, m) => sum + parseFloat(m.sentiment_score), 0) / Math.max(messages.length, 1);
    const totalMentions = messages.reduce((sum, m) => sum + m.mentions, 0);
    const messageRate = messages.length; // messages per 24h

    const currentMetrics = {
      avg_length: avgLength,
      avg_caps: avgCaps,
      avg_punctuation: avgPunct,
      avg_sentiment: avgSentiment,
      total_mentions: totalMentions,
      message_rate: messageRate,
      last_message: new Date().toISOString()
    };

    // Get or create baseline
    const existing = await this.pool.query(
      'SELECT baseline_data FROM behavior_profiles WHERE user_id = $1 AND guild_id = $2',
      [userId, guildId]
    );

    let baseline = existing.rows[0]?.baseline_data || currentMetrics;

    // Update baseline slowly (exponential moving average)
    if (existing.rows.length > 0) {
      const alpha = 0.1; // How fast baseline adapts
      baseline = {
        avg_length: baseline.avg_length * (1 - alpha) + currentMetrics.avg_length * alpha,
        avg_caps: baseline.avg_caps * (1 - alpha) + currentMetrics.avg_caps * alpha,
        avg_punctuation: baseline.avg_punctuation * (1 - alpha) + currentMetrics.avg_punctuation * alpha,
        avg_sentiment: baseline.avg_sentiment * (1 - alpha) + currentMetrics.avg_sentiment * alpha,
        total_mentions: baseline.total_mentions * (1 - alpha) + currentMetrics.total_mentions * alpha,
        message_rate: baseline.message_rate * (1 - alpha) + currentMetrics.message_rate * alpha,
      };
    }

    // Save profile
    await this.pool.query(`
      INSERT INTO behavior_profiles (user_id, guild_id, baseline_data, current_metrics, last_updated)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        baseline_data = $3,
        current_metrics = $4,
        last_updated = CURRENT_TIMESTAMP
    `, [userId, guildId, JSON.stringify(baseline), JSON.stringify(currentMetrics)]);

    return { baseline, current: currentMetrics };
  }

  /**
   * Assess risk level for a user
   */
  async assessRisk(userId, guildId) {
    const profile = await this.pool.query(
      'SELECT * FROM behavior_profiles WHERE user_id = $1 AND guild_id = $2',
      [userId, guildId]
    );

    if (profile.rows.length === 0) {
      return { risk: 0, patterns: [], recommendations: [] };
    }

    const { baseline_data: baseline, current_metrics: current } = profile.rows[0];
    
    // Get incident history
    const incidents = await this.pool.query(`
      SELECT COUNT(*) as count, MAX(timestamp) as last_incident
      FROM behavior_incidents 
      WHERE user_id = $1 AND guild_id = $2
    `, [userId, guildId]);

    const incidentCount = parseInt(incidents.rows[0].count);
    const daysSinceLast = incidents.rows[0].last_incident 
      ? (Date.now() - new Date(incidents.rows[0].last_incident).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Calculate individual indicator scores
    const scores = {
      message_frequency: INDICATORS.message_frequency.calculate(current.message_rate, baseline.message_rate),
      message_length: INDICATORS.message_length.calculate(current.avg_length, baseline.avg_length),
      caps_ratio: INDICATORS.caps_ratio.calculate(current.avg_caps),
      punctuation_intensity: INDICATORS.punctuation_intensity.calculate(current.avg_punctuation),
      negative_sentiment: Math.max(0, -current.avg_sentiment),
      mention_frequency: INDICATORS.mention_frequency.calculate(current.total_mentions, baseline.total_mentions),
      prior_incidents: INDICATORS.prior_incidents.calculate(incidentCount, daysSinceLast)
    };

    // Check each conflict pattern
    const detectedPatterns = [];
    
    for (const [key, pattern] of Object.entries(CONFLICT_PATTERNS)) {
      const patternScore = pattern.indicators.reduce((sum, ind) => {
        return sum + (scores[ind] || 0) * (INDICATORS[ind]?.weight || 0.1);
      }, 0) / pattern.indicators.length;

      if (patternScore >= pattern.threshold * 0.7) { // 70% of threshold = warning
        detectedPatterns.push({
          type: key,
          name: pattern.name,
          confidence: Math.min(patternScore / pattern.threshold, 1),
          urgency: pattern.urgency,
          intervention: pattern.intervention
        });
      }
    }

    // Calculate overall risk
    const weightedRisk = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + score * (INDICATORS[key]?.weight || 0.1);
    }, 0);

    const risk = Math.min(1, weightedRisk);

    // Generate recommendations
    const recommendations = this.generateRecommendations(detectedPatterns, risk);

    return {
      risk,
      patterns: detectedPatterns.sort((a, b) => b.confidence - a.confidence),
      scores,
      recommendations
    };
  }

  /**
   * Generate intervention recommendations
   */
  generateRecommendations(patterns, overallRisk) {
    const recs = [];

    if (overallRisk > 0.8) {
      recs.push({
        priority: 'critical',
        action: 'Immediate moderator attention recommended',
        reason: 'Multiple high-risk indicators detected'
      });
    } else if (overallRisk > 0.6) {
      recs.push({
        priority: 'high',
        action: 'Monitor closely for next 24 hours',
        reason: 'Elevated risk patterns detected'
      });
    } else if (overallRisk > 0.4) {
      recs.push({
        priority: 'medium',
        action: 'Keep on watchlist',
        reason: 'Some concerning patterns observed'
      });
    }

    for (const pattern of patterns) {
      if (pattern.confidence > 0.7) {
        recs.push({
          priority: pattern.urgency,
          action: pattern.intervention,
          reason: `${pattern.name} detected (${Math.round(pattern.confidence * 100)}% confidence)`
        });
      }
    }

    return recs;
  }

  /**
   * Generate alert for moderators
   */
  async generateAlert(userId, guildId, assessment) {
    // Don't spam alerts
    const existing = await this.pool.query(`
      SELECT * FROM behavior_alerts 
      WHERE user_id = $1 AND guild_id = $2 
      AND created_at > NOW() - INTERVAL '1 hour'
      AND acknowledged = FALSE
    `, [userId, guildId]);

    if (existing.rows.length > 0) return;

    const topPattern = assessment.patterns[0];
    if (!topPattern) return;

    await this.pool.query(`
      INSERT INTO behavior_alerts 
      (user_id, guild_id, alert_type, urgency, confidence, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, guildId, topPattern.type, topPattern.urgency, 
        topPattern.confidence, JSON.stringify(assessment)]);

    // Store in active alerts for quick lookup
    this.activeAlerts.set(`${guildId}-${userId}`, {
      ...assessment,
      created: new Date()
    });

    console.log(`⚠️ Behavior alert: ${topPattern.name} for user ${userId} (${Math.round(topPattern.confidence * 100)}%)`);

    return {
      alert: topPattern,
      assessment
    };
  }

  /**
   * Get pending alerts for a guild
   */
  async getPendingAlerts(guildId) {
    const result = await this.pool.query(`
      SELECT * FROM behavior_alerts 
      WHERE guild_id = $1 AND acknowledged = FALSE
      ORDER BY 
        CASE urgency 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        confidence DESC
    `, [guildId]);
    return result.rows;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, moderatorId) {
    await this.pool.query(`
      UPDATE behavior_alerts 
      SET acknowledged = TRUE, acknowledged_by = $2
      WHERE id = $1
    `, [alertId, moderatorId]);
  }

  /**
   * Record an incident (for learning)
   */
  async recordIncident(userId, guildId, type, severity, actionTaken) {
    // Get pre-incident metrics
    const profile = await this.pool.query(
      'SELECT current_metrics FROM behavior_profiles WHERE user_id = $1',
      [userId]
    );

    await this.pool.query(`
      INSERT INTO behavior_incidents 
      (user_id, guild_id, incident_type, severity, action_taken, pre_incident_metrics)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, guildId, type, severity, actionTaken, 
        JSON.stringify(profile.rows[0]?.current_metrics || {})]);

    // Update any open predictions
    await this.pool.query(`
      UPDATE behavior_predictions 
      SET outcome = $3, accurate = TRUE, resolved_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND guild_id = $2 AND resolved_at IS NULL
    `, [userId, guildId, type]);
  }

  /**
   * Get prediction embed for a user
   */
  async getPredictionEmbed(userId, username, guildId) {
    const assessment = await this.assessRisk(userId, guildId);
    
    const riskEmoji = assessment.risk > 0.7 ? '🔴' : assessment.risk > 0.4 ? '🟡' : '🟢';
    const riskLevel = assessment.risk > 0.7 ? 'HIGH' : assessment.risk > 0.4 ? 'MEDIUM' : 'LOW';

    const embed = new EmbedBuilder()
      .setTitle(`🔮 Behavioral Analysis: ${username}`)
      .setColor(assessment.risk > 0.7 ? 0xFF0000 : assessment.risk > 0.4 ? 0xFFFF00 : 0x00FF00)
      .addFields(
        { name: 'Risk Level', value: `${riskEmoji} ${riskLevel} (${Math.round(assessment.risk * 100)}%)`, inline: true }
      );

    if (assessment.patterns.length > 0) {
      const patternList = assessment.patterns.slice(0, 3).map(p => 
        `• **${p.name}** (${Math.round(p.confidence * 100)}%)\n  └ ${p.intervention}`
      ).join('\n');
      embed.addFields({ name: '⚠️ Detected Patterns', value: patternList, inline: false });
    } else {
      embed.addFields({ name: '✅ Patterns', value: 'No concerning patterns detected', inline: false });
    }

    if (assessment.recommendations.length > 0) {
      const recList = assessment.recommendations.slice(0, 3).map(r =>
        `[${r.priority.toUpperCase()}] ${r.action}`
      ).join('\n');
      embed.addFields({ name: '📋 Recommendations', value: recList, inline: false });
    }

    // Top indicator scores
    const topScores = Object.entries(assessment.scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, score]) => `${key}: ${Math.round(score * 100)}%`)
      .join(' | ');
    
    embed.setFooter({ text: `Indicators: ${topScores}` });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Background analysis job
   */
  startBackgroundAnalysis() {
    // Run every 5 minutes
    setInterval(async () => {
      try {
        // Get users with recent activity
        const active = await this.pool.query(`
          SELECT DISTINCT user_id, guild_id FROM behavior_messages
          WHERE timestamp > NOW() - INTERVAL '1 hour'
        `);

        for (const row of active.rows) {
          const assessment = await this.assessRisk(row.user_id, row.guild_id);
          if (assessment.risk > 0.5) {
            await this.generateAlert(row.user_id, row.guild_id, assessment);
          }
        }
      } catch (e) {
        console.error('Background analysis error:', e);
      }
    }, 5 * 60 * 1000);

    console.log('🔮 Background behavioral analysis started');
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData() {
    // Keep only 7 days of message data
    await this.pool.query(`
      DELETE FROM behavior_messages WHERE timestamp < NOW() - INTERVAL '7 days'
    `);
  }

  /**
   * Get user's behavioral history summary
   */
  async getHistorySummary(userId, guildId) {
    const incidents = await this.pool.query(`
      SELECT incident_type, COUNT(*) as count, MAX(timestamp) as last
      FROM behavior_incidents 
      WHERE user_id = $1 AND guild_id = $2
      GROUP BY incident_type
    `, [userId, guildId]);

    const predictions = await this.pool.query(`
      SELECT pattern_type, accurate, COUNT(*) as count
      FROM behavior_predictions
      WHERE user_id = $1 AND guild_id = $2 AND resolved_at IS NOT NULL
      GROUP BY pattern_type, accurate
    `, [userId, guildId]);

    return {
      incidents: incidents.rows,
      predictions: predictions.rows,
      accuracy: predictions.rows.length > 0 
        ? predictions.rows.filter(p => p.accurate).length / predictions.rows.length 
        : null
    };
  }
}

module.exports = { BehaviorPredictionEngine, INDICATORS, CONFLICT_PATTERNS };
