/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEHAVIORAL PREDICTION AI v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Not detecting bad behavior - PREDICTING it.
 * Pattern recognition across thousands of data points.
 * Detects brewing conflicts before they explode.
 * 
 * This is what big companies pay millions for.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

const BEHAVIORAL_INDICATORS = {
  // Message pattern indicators
  message_frequency_spike: {
    name: 'Message Frequency Spike',
    weight: 2,
    description: 'Sudden increase in message volume',
    calculation: 'current_rate > (avg_rate * 3)'
  },
  message_frequency_drop: {
    name: 'Message Frequency Drop',
    weight: 1,
    description: 'Sudden decrease in activity',
    calculation: 'current_rate < (avg_rate * 0.2)'
  },
  late_night_activity: {
    name: 'Unusual Hours Activity',
    weight: 1,
    description: 'Active during unusual hours',
    calculation: 'hour >= 2 && hour <= 5'
  },
  
  // Content indicators
  negative_sentiment: {
    name: 'Negative Sentiment',
    weight: 3,
    description: 'Consistently negative message tone',
    calculation: 'sentiment_score < -0.5'
  },
  aggressive_language: {
    name: 'Aggressive Language',
    weight: 4,
    description: 'Use of aggressive or threatening words',
    calculation: 'aggressive_word_count > 0'
  },
  caps_usage: {
    name: 'Excessive Caps',
    weight: 2,
    description: 'Frequent use of all caps',
    calculation: 'caps_ratio > 0.5'
  },
  profanity_increase: {
    name: 'Profanity Increase',
    weight: 2,
    description: 'Increased use of profanity',
    calculation: 'profanity_rate > (avg_profanity * 2)'
  },
  
  // Social indicators
  targeting_user: {
    name: 'User Targeting',
    weight: 5,
    description: 'Repeatedly mentioning/responding to same user negatively',
    calculation: 'same_target_negative > 3'
  },
  isolation: {
    name: 'Social Isolation',
    weight: 2,
    description: 'Not engaging with community responses',
    calculation: 'response_rate < 0.1'
  },
  conflict_engagement: {
    name: 'Conflict Engagement',
    weight: 3,
    description: 'Frequently joining or starting arguments',
    calculation: 'conflict_participation > 5'
  },
  
  // Behavioral pattern indicators
  deleted_messages: {
    name: 'Message Deletion',
    weight: 2,
    description: 'Frequently deleting own messages',
    calculation: 'delete_rate > 0.2'
  },
  edit_frequency: {
    name: 'Frequent Edits',
    weight: 1,
    description: 'Frequently editing messages',
    calculation: 'edit_rate > 0.3'
  },
  channel_hopping: {
    name: 'Channel Hopping',
    weight: 2,
    description: 'Rapidly switching between channels',
    calculation: 'channel_switches > 10 in 5 minutes'
  },
  
  // Historical indicators
  past_warnings: {
    name: 'Warning History',
    weight: 4,
    description: 'Has received warnings before',
    calculation: 'warning_count > 0'
  },
  recent_timeout: {
    name: 'Recent Timeout',
    weight: 5,
    description: 'Recently timed out',
    calculation: 'days_since_timeout < 7'
  },
  ban_history: {
    name: 'Ban History',
    weight: 6,
    description: 'Has been banned before',
    calculation: 'ban_count > 0'
  },
  
  // Network indicators (from reputation system)
  low_reputation: {
    name: 'Low Network Reputation',
    weight: 3,
    description: 'Low score in reputation network',
    calculation: 'reputation_score < -50'
  },
  network_bans: {
    name: 'Network Bans',
    weight: 5,
    description: 'Banned in other network servers',
    calculation: 'network_ban_count > 0'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// THREAT PROFILES
// ═══════════════════════════════════════════════════════════════════════════════

const THREAT_PROFILES = {
  troll: {
    name: 'Troll',
    description: 'Likely to cause disruption for entertainment',
    indicators: ['aggressive_language', 'caps_usage', 'conflict_engagement', 'channel_hopping'],
    minMatch: 3,
    interventions: ['mod_watch', 'warning']
  },
  
  harasser: {
    name: 'Potential Harasser',
    description: 'May target specific users',
    indicators: ['targeting_user', 'aggressive_language', 'negative_sentiment', 'past_warnings'],
    minMatch: 2,
    interventions: ['target_protection', 'dm_check', 'immediate_review']
  },
  
  raider: {
    name: 'Potential Raider',
    description: 'May be part of coordinated attack',
    indicators: ['message_frequency_spike', 'channel_hopping', 'aggressive_language', 'low_reputation', 'network_bans'],
    minMatch: 3,
    interventions: ['lockdown_ready', 'immediate_review', 'ban']
  },
  
  frustrated_user: {
    name: 'Frustrated User',
    description: 'Becoming increasingly frustrated, may lash out',
    indicators: ['negative_sentiment', 'caps_usage', 'profanity_increase', 'message_frequency_spike'],
    minMatch: 2,
    interventions: ['de_escalation', 'mod_reach_out']
  },
  
  disengaging: {
    name: 'Disengaging User',
    description: 'Pulling away from community',
    indicators: ['message_frequency_drop', 'isolation', 'negative_sentiment'],
    minMatch: 2,
    interventions: ['community_reach_out', 'check_in']
  },
  
  ban_evader: {
    name: 'Potential Ban Evader',
    description: 'May be evading a previous ban',
    indicators: ['late_night_activity', 'targeting_user', 'network_bans', 'low_reputation'],
    minMatch: 2,
    interventions: ['alt_check', 'immediate_review']
  },
  
  escalating: {
    name: 'Escalating Conflict',
    description: 'Situation is getting worse',
    indicators: ['conflict_engagement', 'aggressive_language', 'caps_usage', 'targeting_user'],
    minMatch: 3,
    interventions: ['separate_parties', 'cooling_off', 'mod_intervention']
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGGRESSIVE WORDS LIST
// ═══════════════════════════════════════════════════════════════════════════════

const AGGRESSIVE_WORDS = [
  'kill', 'die', 'death', 'dead', 'hurt', 'attack', 'destroy', 'hate', 'stupid',
  'idiot', 'dumb', 'moron', 'loser', 'trash', 'garbage', 'worthless', 'pathetic',
  'fight', 'punch', 'beat', 'murder', 'threat', 'warn', 'regret', 'suffer',
  'kys', 'neck', 'rope', 'end it', 'unalive' // Self-harm indicators
];

const PROFANITY_WORDS = [
  'fuck', 'shit', 'damn', 'hell', 'ass', 'bitch', 'crap', 'piss'
];

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL PREDICTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class BehavioralPrediction {
  constructor(pool, anthropic, client) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.client = client;
    this.userProfiles = new Map();
    this.activeAlerts = new Map();
    this.conflictTracker = new Map(); // channelId -> { users: [], intensity: 0, lastUpdate: Date }
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavioral_profiles (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        avg_messages_per_day FLOAT DEFAULT 0,
        sentiment_avg FLOAT DEFAULT 0,
        caps_ratio FLOAT DEFAULT 0,
        profanity_rate FLOAT DEFAULT 0,
        conflict_count INTEGER DEFAULT 0,
        warning_count INTEGER DEFAULT 0,
        timeout_count INTEGER DEFAULT 0,
        last_timeout TIMESTAMP,
        ban_count INTEGER DEFAULT 0,
        indicators JSONB DEFAULT '{}',
        threat_score FLOAT DEFAULT 0,
        last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, guild_id)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavioral_events (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavioral_predictions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        threat_profile TEXT NOT NULL,
        confidence FLOAT NOT NULL,
        indicators JSONB,
        recommended_actions JSONB,
        outcome TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS behavioral_conflicts (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        participants JSONB NOT NULL,
        intensity FLOAT NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('🧠 Behavioral Prediction AI: ONLINE');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MESSAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════════

  async analyzeMessage(message) {
    if (message.author.bot) return null;

    const userId = message.author.id;
    const guildId = message.guild.id;
    const content = message.content.toLowerCase();

    // Get or create profile
    let profile = await this.getProfile(userId, guildId);

    // Calculate message metrics
    const metrics = this.calculateMessageMetrics(content);

    // Update profile with new data
    await this.updateProfile(userId, guildId, metrics, message);

    // Check for immediate threats
    const immediateThreats = this.checkImmediateThreats(metrics, profile);
    if (immediateThreats.length > 0) {
      await this.raiseAlert(userId, guildId, immediateThreats, message);
    }

    // Track potential conflicts
    await this.trackConflict(message, metrics);

    // Periodically run full prediction (every 10 messages)
    if (profile.message_count % 10 === 0) {
      await this.runPrediction(userId, guildId);
    }

    return { metrics, profile, immediateThreats };
  }

  calculateMessageMetrics(content) {
    const words = content.split(/\s+/);
    const wordCount = words.length;

    // Caps ratio
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
    const capsRatio = letterCount > 0 ? capsCount / letterCount : 0;

    // Aggressive words
    const aggressiveCount = AGGRESSIVE_WORDS.filter(w => content.includes(w)).length;

    // Profanity
    const profanityCount = PROFANITY_WORDS.filter(w => content.includes(w)).length;

    // Sentiment (simplified)
    const positiveWords = ['good', 'great', 'awesome', 'love', 'thanks', 'nice', 'cool', 'amazing', 'happy', 'lol', 'haha', ':)', '😊', '👍'];
    const negativeWords = ['bad', 'hate', 'sucks', 'awful', 'terrible', 'annoying', 'angry', 'mad', 'sad', ':(', '😠', '😡', '👎'];
    
    const positiveCount = positiveWords.filter(w => content.includes(w)).length;
    const negativeCount = negativeWords.filter(w => content.includes(w)).length;
    const sentiment = (positiveCount - negativeCount) / Math.max(wordCount, 1);

    // Mentions
    const mentionCount = (content.match(/<@!?\d+>/g) || []).length;

    return {
      wordCount,
      capsRatio,
      aggressiveCount,
      profanityCount,
      sentiment,
      mentionCount,
      isQuestion: content.includes('?'),
      hasLinks: /https?:\/\//.test(content),
      timestamp: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROFILE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  async getProfile(userId, guildId) {
    const cacheKey = `${userId}-${guildId}`;
    
    if (this.userProfiles.has(cacheKey)) {
      return this.userProfiles.get(cacheKey);
    }

    const result = await this.pool.query(
      'SELECT * FROM behavioral_profiles WHERE user_id = $1 AND guild_id = $2',
      [userId, guildId]
    );

    let profile;
    if (result.rows.length === 0) {
      // Create new profile
      await this.pool.query(`
        INSERT INTO behavioral_profiles (user_id, guild_id)
        VALUES ($1, $2)
      `, [userId, guildId]);
      
      profile = {
        user_id: userId,
        guild_id: guildId,
        message_count: 0,
        avg_messages_per_day: 0,
        sentiment_avg: 0,
        caps_ratio: 0,
        profanity_rate: 0,
        conflict_count: 0,
        warning_count: 0,
        timeout_count: 0,
        ban_count: 0,
        indicators: {},
        threat_score: 0
      };
    } else {
      profile = result.rows[0];
    }

    this.userProfiles.set(cacheKey, profile);
    return profile;
  }

  async updateProfile(userId, guildId, metrics, message) {
    const profile = await this.getProfile(userId, guildId);

    // Update running averages
    const n = profile.message_count + 1;
    profile.message_count = n;
    profile.sentiment_avg = ((profile.sentiment_avg * (n - 1)) + metrics.sentiment) / n;
    profile.caps_ratio = ((profile.caps_ratio * (n - 1)) + metrics.capsRatio) / n;
    profile.profanity_rate = ((profile.profanity_rate * (n - 1)) + (metrics.profanityCount > 0 ? 1 : 0)) / n;

    // Update indicators
    const indicators = profile.indicators || {};

    // Check each indicator
    if (metrics.capsRatio > 0.5) {
      indicators.caps_usage = (indicators.caps_usage || 0) + 1;
    }
    if (metrics.aggressiveCount > 0) {
      indicators.aggressive_language = (indicators.aggressive_language || 0) + metrics.aggressiveCount;
    }
    if (metrics.sentiment < -0.3) {
      indicators.negative_sentiment = (indicators.negative_sentiment || 0) + 1;
    }
    if (metrics.profanityCount > 0) {
      indicators.profanity_increase = (indicators.profanity_increase || 0) + 1;
    }

    // Track targeting
    const mentions = message.mentions.users;
    if (mentions.size > 0 && metrics.sentiment < 0) {
      const targetId = mentions.first().id;
      indicators.targets = indicators.targets || {};
      indicators.targets[targetId] = (indicators.targets[targetId] || 0) + 1;
      
      if (indicators.targets[targetId] >= 3) {
        indicators.targeting_user = (indicators.targeting_user || 0) + 1;
      }
    }

    profile.indicators = indicators;

    // Calculate threat score
    profile.threat_score = this.calculateThreatScore(profile);

    // Save to database
    await this.pool.query(`
      UPDATE behavioral_profiles SET
        message_count = $3,
        sentiment_avg = $4,
        caps_ratio = $5,
        profanity_rate = $6,
        indicators = $7,
        threat_score = $8,
        last_analyzed = NOW()
      WHERE user_id = $1 AND guild_id = $2
    `, [userId, guildId, profile.message_count, profile.sentiment_avg, 
        profile.caps_ratio, profile.profanity_rate, JSON.stringify(profile.indicators),
        profile.threat_score]);

    // Update cache
    this.userProfiles.set(`${userId}-${guildId}`, profile);

    return profile;
  }

  calculateThreatScore(profile) {
    let score = 0;
    const indicators = profile.indicators || {};

    for (const [indicator, count] of Object.entries(indicators)) {
      if (BEHAVIORAL_INDICATORS[indicator]) {
        score += BEHAVIORAL_INDICATORS[indicator].weight * Math.min(count, 10);
      }
    }

    // Add historical factors
    score += profile.warning_count * BEHAVIORAL_INDICATORS.past_warnings.weight;
    score += profile.timeout_count * BEHAVIORAL_INDICATORS.recent_timeout.weight;
    score += profile.ban_count * BEHAVIORAL_INDICATORS.ban_history.weight;

    // Normalize to 0-100
    return Math.min(100, Math.max(0, score));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // THREAT DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  checkImmediateThreats(metrics, profile) {
    const threats = [];

    // Self-harm indicators - HIGHEST PRIORITY
    const selfHarmWords = ['kys', 'kill myself', 'end it', 'unalive', 'want to die'];
    if (selfHarmWords.some(w => metrics.content?.includes(w))) {
      threats.push({
        type: 'self_harm_indicator',
        severity: 'critical',
        action: 'immediate_review',
        notify: true
      });
    }

    // Extreme aggression
    if (metrics.aggressiveCount >= 3 && metrics.capsRatio > 0.7) {
      threats.push({
        type: 'extreme_aggression',
        severity: 'high',
        action: 'mod_intervention'
      });
    }

    // Harassment pattern
    const indicators = profile.indicators || {};
    if (indicators.targeting_user && indicators.targeting_user >= 2) {
      threats.push({
        type: 'harassment_pattern',
        severity: 'high',
        action: 'target_protection'
      });
    }

    // Rapid escalation
    if (profile.threat_score > 50 && profile.message_count < 20) {
      threats.push({
        type: 'rapid_escalation',
        severity: 'medium',
        action: 'mod_watch'
      });
    }

    return threats;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PREDICTION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════════

  async runPrediction(userId, guildId) {
    const profile = await this.getProfile(userId, guildId);
    const indicators = profile.indicators || {};

    const predictions = [];

    for (const [profileId, threatProfile] of Object.entries(THREAT_PROFILES)) {
      let matchCount = 0;
      const matchedIndicators = [];

      for (const indicator of threatProfile.indicators) {
        if (indicators[indicator] && indicators[indicator] > 0) {
          matchCount++;
          matchedIndicators.push(indicator);
        }
      }

      if (matchCount >= threatProfile.minMatch) {
        const confidence = matchCount / threatProfile.indicators.length;
        
        predictions.push({
          profile: profileId,
          name: threatProfile.name,
          description: threatProfile.description,
          confidence,
          matchedIndicators,
          interventions: threatProfile.interventions
        });
      }
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);

    // Store top prediction
    if (predictions.length > 0) {
      const topPrediction = predictions[0];
      
      await this.pool.query(`
        INSERT INTO behavioral_predictions 
        (user_id, guild_id, threat_profile, confidence, indicators, recommended_actions)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, guildId, topPrediction.profile, topPrediction.confidence,
          JSON.stringify(topPrediction.matchedIndicators), 
          JSON.stringify(topPrediction.interventions)]);

      // If high confidence, raise alert
      if (topPrediction.confidence >= 0.6) {
        await this.raisePredictionAlert(userId, guildId, topPrediction);
      }
    }

    return predictions;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFLICT TRACKING
  // ═══════════════════════════════════════════════════════════════════════════════

  async trackConflict(message, metrics) {
    const channelId = message.channel.id;
    const guildId = message.guild.id;

    // Get or create conflict tracker for this channel
    let tracker = this.conflictTracker.get(channelId) || {
      users: new Map(),
      intensity: 0,
      lastUpdate: new Date(),
      messageCount: 0
    };

    // Decay intensity over time
    const minutesSinceUpdate = (Date.now() - tracker.lastUpdate.getTime()) / 60000;
    tracker.intensity = Math.max(0, tracker.intensity - (minutesSinceUpdate * 2));

    // Add to intensity based on message metrics
    if (metrics.aggressiveCount > 0) tracker.intensity += metrics.aggressiveCount * 5;
    if (metrics.capsRatio > 0.5) tracker.intensity += 3;
    if (metrics.sentiment < -0.3) tracker.intensity += 2;
    if (metrics.mentionCount > 2) tracker.intensity += 2;

    // Track users involved
    tracker.users.set(message.author.id, {
      lastMessage: new Date(),
      negativity: (tracker.users.get(message.author.id)?.negativity || 0) + (metrics.sentiment < 0 ? 1 : 0)
    });

    tracker.messageCount++;
    tracker.lastUpdate = new Date();

    this.conflictTracker.set(channelId, tracker);

    // Check if conflict threshold reached
    if (tracker.intensity >= 30 && tracker.users.size >= 2) {
      await this.detectConflict(channelId, guildId, tracker);
    }
  }

  async detectConflict(channelId, guildId, tracker) {
    // Check if we already have an active conflict for this channel
    const existingAlert = this.activeAlerts.get(`conflict-${channelId}`);
    if (existingAlert && (Date.now() - existingAlert.time) < 300000) {
      return; // Don't spam alerts within 5 minutes
    }

    const participants = Array.from(tracker.users.entries())
      .filter(([, data]) => data.negativity > 1)
      .map(([userId]) => userId);

    if (participants.length < 2) return;

    // Log conflict
    await this.pool.query(`
      INSERT INTO behavioral_conflicts (guild_id, channel_id, participants, intensity)
      VALUES ($1, $2, $3, $4)
    `, [guildId, channelId, JSON.stringify(participants), tracker.intensity]);

    // Raise alert
    await this.raiseConflictAlert(channelId, guildId, participants, tracker.intensity);

    this.activeAlerts.set(`conflict-${channelId}`, { time: Date.now() });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ALERTING
  // ═══════════════════════════════════════════════════════════════════════════════

  async raiseAlert(userId, guildId, threats, message) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const alertChannel = guild.channels.cache.find(c => 
      c.name === 'mod-alerts' || c.name === 'nexus-log' || c.name === 'staff-alerts'
    );

    if (!alertChannel) return;

    const user = await this.client.users.fetch(userId).catch(() => null);

    for (const threat of threats) {
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ ${threat.severity.toUpperCase()} ALERT: ${threat.type.replace(/_/g, ' ')}`)
        .setDescription(`Potential issue detected`)
        .addFields(
          { name: 'User', value: `${user?.tag || userId} (<@${userId}>)`, inline: true },
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Recommended Action', value: threat.action.replace(/_/g, ' '), inline: true }
        )
        .setColor(threat.severity === 'critical' ? 0xFF0000 : threat.severity === 'high' ? 0xFF6600 : 0xFFAA00)
        .setTimestamp()
        .setFooter({ text: 'Behavioral Prediction AI' });

      if (message.content) {
        embed.addFields({ name: 'Message Content', value: message.content.substring(0, 500), inline: false });
      }

      await alertChannel.send({ embeds: [embed] });
    }
  }

  async raisePredictionAlert(userId, guildId, prediction) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const alertChannel = guild.channels.cache.find(c => 
      c.name === 'mod-alerts' || c.name === 'nexus-log'
    );

    if (!alertChannel) return;

    const user = await this.client.users.fetch(userId).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`🔮 PREDICTION: ${prediction.name}`)
      .setDescription(prediction.description)
      .addFields(
        { name: 'User', value: `${user?.tag || userId} (<@${userId}>)`, inline: true },
        { name: 'Confidence', value: `${(prediction.confidence * 100).toFixed(0)}%`, inline: true },
        { name: 'Indicators', value: prediction.matchedIndicators.map(i => `• ${i.replace(/_/g, ' ')}`).join('\n'), inline: false },
        { name: 'Recommended Interventions', value: prediction.interventions.map(i => `• ${i.replace(/_/g, ' ')}`).join('\n'), inline: false }
      )
      .setColor(prediction.confidence > 0.8 ? 0xFF0000 : prediction.confidence > 0.6 ? 0xFFAA00 : 0xFFFF00)
      .setTimestamp()
      .setFooter({ text: 'Behavioral Prediction AI' });

    await alertChannel.send({ embeds: [embed] });
  }

  async raiseConflictAlert(channelId, guildId, participants, intensity) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const alertChannel = guild.channels.cache.find(c => 
      c.name === 'mod-alerts' || c.name === 'nexus-log'
    );

    if (!alertChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ CONFLICT DETECTED')
      .setDescription(`A heated exchange has been detected`)
      .addFields(
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Intensity', value: `${intensity.toFixed(0)}/100`, inline: true },
        { name: 'Participants', value: participants.map(p => `<@${p}>`).join(', '), inline: false }
      )
      .setColor(intensity > 60 ? 0xFF0000 : 0xFFAA00)
      .setTimestamp()
      .setFooter({ text: 'Behavioral Prediction AI - Conflict Detection' });

    await alertChannel.send({ embeds: [embed] });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMMAND HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════════

  async handleCommand(message, command, args) {
    if (!message.member.permissions.has('ModerateMembers')) {
      return message.reply('You need Moderate Members permission.');
    }

    switch (command) {
      case 'threat':
      case 'analyze':
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `?threat @user`');
        
        const profile = await this.getProfile(target.id, message.guild.id);
        const predictions = await this.runPrediction(target.id, message.guild.id);
        
        const embed = new EmbedBuilder()
          .setTitle(`🔍 Behavioral Analysis: ${target.tag}`)
          .addFields(
            { name: 'Threat Score', value: `${profile.threat_score.toFixed(0)}/100`, inline: true },
            { name: 'Messages Analyzed', value: `${profile.message_count}`, inline: true },
            { name: 'Avg Sentiment', value: profile.sentiment_avg.toFixed(2), inline: true },
            { name: 'Warnings', value: `${profile.warning_count}`, inline: true },
            { name: 'Timeouts', value: `${profile.timeout_count}`, inline: true },
            { name: 'Bans', value: `${profile.ban_count}`, inline: true }
          )
          .setColor(profile.threat_score > 50 ? 0xFF0000 : profile.threat_score > 25 ? 0xFFAA00 : 0x00FF00)
          .setTimestamp();

        if (predictions.length > 0) {
          embed.addFields({
            name: '🔮 Predictions',
            value: predictions.slice(0, 3).map(p => 
              `**${p.name}** (${(p.confidence * 100).toFixed(0)}% confidence)`
            ).join('\n')
          });
        }

        const indicators = profile.indicators || {};
        if (Object.keys(indicators).length > 0) {
          embed.addFields({
            name: '⚠️ Active Indicators',
            value: Object.entries(indicators)
              .filter(([key]) => key !== 'targets')
              .slice(0, 5)
              .map(([key, val]) => `• ${key.replace(/_/g, ' ')}: ${val}`)
              .join('\n') || 'None'
          });
        }

        return message.reply({ embeds: [embed] });

      case 'conflicts':
        const conflicts = await this.pool.query(`
          SELECT * FROM behavioral_conflicts 
          WHERE guild_id = $1 AND NOT resolved
          ORDER BY timestamp DESC LIMIT 10
        `, [message.guild.id]);

        if (conflicts.rows.length === 0) {
          return message.reply('No active conflicts detected.');
        }

        const conflictEmbed = new EmbedBuilder()
          .setTitle('⚔️ Active Conflicts')
          .setDescription(conflicts.rows.map(c => 
            `<#${c.channel_id}> - Intensity: ${c.intensity.toFixed(0)} - ${new Date(c.timestamp).toLocaleString()}`
          ).join('\n'))
          .setColor(0xFF6600);

        return message.reply({ embeds: [conflictEmbed] });

      default:
        return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LEARNING / FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════════════

  async recordOutcome(predictionId, outcome) {
    // Record whether the prediction was accurate
    // This data is used to improve the model
    await this.pool.query(`
      UPDATE behavioral_predictions SET outcome = $2 WHERE id = $1
    `, [predictionId, outcome]);

    // In a more advanced system, this would retrain weights
    // For now, just log for analysis
  }
}

module.exports = { BehavioralPrediction, BEHAVIORAL_INDICATORS, THREAT_PROFILES };
