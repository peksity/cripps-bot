/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CROSS-SERVER REPUTATION NETWORK v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Your reputation follows you across ALL servers using these bots.
 * 
 * Features:
 * - Trust scores that persist across servers
 * - Vouch system: trusted users can vouch for new members
 * - Automatic scammer/griefer flagging network-wide
 * - Reputation decay and recovery
 * - Server-to-server reputation sharing
 * - Configurable trust thresholds per server
 * 
 * This could be a PAID SERVICE other server owners subscribe to.
 */

const { EmbedBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Starting reputation for new users
  startingRep: 100,
  
  // Reputation bounds
  minRep: -1000,
  maxRep: 10000,
  
  // Trust levels
  trustLevels: {
    untrusted: { min: -1000, max: -1, color: 0xFF0000, name: 'Untrusted', emoji: '🔴' },
    new: { min: 0, max: 99, color: 0x808080, name: 'New', emoji: '⚪' },
    member: { min: 100, max: 299, color: 0x00FF00, name: 'Member', emoji: '🟢' },
    trusted: { min: 300, max: 599, color: 0x0080FF, name: 'Trusted', emoji: '🔵' },
    veteran: { min: 600, max: 999, color: 0x800080, name: 'Veteran', emoji: '🟣' },
    elite: { min: 1000, max: 10000, color: 0xFFD700, name: 'Elite', emoji: '🌟' }
  },

  // Reputation changes
  actions: {
    // Positive actions
    message_helpful: 2,
    vouch_given: 10,
    vouch_received: 25,
    heist_completed: 15,
    event_participation: 10,
    daily_activity: 1,
    
    // Negative actions
    warning_received: -50,
    timeout_received: -100,
    kick_received: -200,
    ban_received: -500,
    scam_detected: -300,
    report_confirmed: -100,
    
    // Decay
    daily_decay: -1,
    inactive_decay: -5 // per week of inactivity
  },

  // Vouch system
  vouchRequirements: {
    minRepToVouch: 300,         // Minimum rep needed to vouch for others
    maxVouchesPerDay: 3,        // Max vouches a user can give per day
    vouchCooldown: 86400000,    // 24 hours between vouching same person
  },

  // Cross-server sync
  syncInterval: 300000, // 5 minutes
};

// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION SYSTEM CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ReputationSystem {
  constructor(pool, client) {
    this.pool = pool;
    this.client = client;
    this.cache = new Map(); // oduserId -> rep data
    this.serverConfigs = new Map(); // guildId -> config
  }

  async initialize() {
    // Main reputation table (shared across all servers)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_global (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        reputation INTEGER DEFAULT 100,
        total_vouches_given INTEGER DEFAULT 0,
        total_vouches_received INTEGER DEFAULT 0,
        flags JSONB DEFAULT '[]',
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        servers_active JSONB DEFAULT '[]'
      )
    `);

    // Server-specific reputation modifiers
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_servers (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        local_modifier INTEGER DEFAULT 0,
        roles_earned JSONB DEFAULT '[]',
        notes TEXT,
        UNIQUE(user_id, guild_id)
      )
    `);

    // Vouch tracking
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_vouches (
        id SERIAL PRIMARY KEY,
        voucher_id TEXT NOT NULL,
        vouched_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        reason TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reputation history log
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_history (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        action TEXT NOT NULL,
        change INTEGER NOT NULL,
        new_total INTEGER NOT NULL,
        reason TEXT,
        by_user_id TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Flags and bans (network-wide)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_flags (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        flag_type TEXT NOT NULL,
        reason TEXT,
        evidence TEXT,
        reported_by TEXT,
        guild_id TEXT,
        active BOOLEAN DEFAULT TRUE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Server configurations
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_config (
        guild_id TEXT PRIMARY KEY,
        min_trust_to_join INTEGER DEFAULT 0,
        min_trust_for_lfg INTEGER DEFAULT 100,
        min_trust_for_trade INTEGER DEFAULT 200,
        auto_roles JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT TRUE
      )
    `);

    console.log('✅ Cross-Server Reputation System initialized');
  }

  /**
   * Get user's global reputation
   */
  async getReputation(userId) {
    // Check cache first
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId);
      if (Date.now() - cached.time < 60000) return cached.data;
    }

    const result = await this.pool.query(
      'SELECT * FROM reputation_global WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const data = result.rows[0];
    this.cache.set(userId, { data, time: Date.now() });
    return data;
  }

  /**
   * Initialize a new user
   */
  async initUser(userId, username) {
    await this.pool.query(`
      INSERT INTO reputation_global (user_id, username, reputation)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET 
        username = $2,
        last_active = CURRENT_TIMESTAMP
    `, [userId, username, CONFIG.startingRep]);

    this.cache.delete(userId);
    return this.getReputation(userId);
  }

  /**
   * Get trust level for a reputation value
   */
  getTrustLevel(reputation) {
    for (const [key, level] of Object.entries(CONFIG.trustLevels)) {
      if (reputation >= level.min && reputation <= level.max) {
        return { key, ...level };
      }
    }
    return CONFIG.trustLevels.new;
  }

  /**
   * Modify user reputation
   */
  async modifyReputation(userId, change, action, guildId = null, reason = null, byUserId = null) {
    // Get current rep
    let rep = await this.getReputation(userId);
    if (!rep) {
      await this.initUser(userId, 'Unknown');
      rep = await this.getReputation(userId);
    }

    const newRep = Math.max(CONFIG.minRep, Math.min(CONFIG.maxRep, rep.reputation + change));

    // Update global reputation
    await this.pool.query(`
      UPDATE reputation_global SET 
        reputation = $2,
        last_active = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId, newRep]);

    // Log the change
    await this.pool.query(`
      INSERT INTO reputation_history (user_id, guild_id, action, change, new_total, reason, by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, guildId, action, change, newRep, reason, byUserId]);

    // Clear cache
    this.cache.delete(userId);

    return { oldRep: rep.reputation, newRep, change };
  }

  /**
   * Quick rep modifiers for common actions
   */
  async addPositive(userId, action, guildId = null) {
    const change = CONFIG.actions[action] || 5;
    return this.modifyReputation(userId, change, action, guildId);
  }

  async addNegative(userId, action, guildId = null, reason = null, byUserId = null) {
    const change = CONFIG.actions[action] || -50;
    return this.modifyReputation(userId, change, action, guildId, reason, byUserId);
  }

  /**
   * Vouch for another user
   */
  async vouch(voucherId, vouchedId, guildId, reason = null) {
    // Get voucher's rep
    const voucherRep = await this.getReputation(voucherId);
    if (!voucherRep || voucherRep.reputation < CONFIG.vouchRequirements.minRepToVouch) {
      return { success: false, reason: `Need ${CONFIG.vouchRequirements.minRepToVouch} reputation to vouch` };
    }

    // Check if already vouched recently
    const recent = await this.pool.query(`
      SELECT * FROM reputation_vouches 
      WHERE voucher_id = $1 AND vouched_id = $2 
      AND timestamp > NOW() - INTERVAL '24 hours'
    `, [voucherId, vouchedId]);

    if (recent.rows.length > 0) {
      return { success: false, reason: 'Already vouched for this user today' };
    }

    // Check daily vouch limit
    const todayVouches = await this.pool.query(`
      SELECT COUNT(*) as count FROM reputation_vouches 
      WHERE voucher_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
    `, [voucherId]);

    if (parseInt(todayVouches.rows[0].count) >= CONFIG.vouchRequirements.maxVouchesPerDay) {
      return { success: false, reason: 'Daily vouch limit reached' };
    }

    // Record vouch
    await this.pool.query(`
      INSERT INTO reputation_vouches (voucher_id, vouched_id, guild_id, reason)
      VALUES ($1, $2, $3, $4)
    `, [voucherId, vouchedId, guildId, reason]);

    // Update counts
    await this.pool.query(`
      UPDATE reputation_global SET total_vouches_given = total_vouches_given + 1
      WHERE user_id = $1
    `, [voucherId]);

    await this.pool.query(`
      UPDATE reputation_global SET total_vouches_received = total_vouches_received + 1
      WHERE user_id = $1
    `, [vouchedId]);

    // Give reputation
    await this.modifyReputation(voucherId, CONFIG.actions.vouch_given, 'vouch_given', guildId);
    const result = await this.modifyReputation(vouchedId, CONFIG.actions.vouch_received, 'vouch_received', guildId, `Vouched by user`, voucherId);

    return { success: true, newRep: result.newRep };
  }

  /**
   * Flag a user (network-wide warning)
   */
  async flagUser(userId, flagType, reason, evidence = null, reportedBy = null, guildId = null) {
    await this.pool.query(`
      INSERT INTO reputation_flags (user_id, flag_type, reason, evidence, reported_by, guild_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, flagType, reason, evidence, reportedBy, guildId]);

    // Add to user's flags
    await this.pool.query(`
      UPDATE reputation_global 
      SET flags = flags || $2::jsonb
      WHERE user_id = $1
    `, [userId, JSON.stringify([{ type: flagType, reason, time: new Date().toISOString() }])]);

    // Apply reputation penalty based on flag type
    const penalties = {
      scammer: -500,
      griefer: -200,
      toxic: -100,
      cheater: -300,
      ban_evasion: -400
    };

    const penalty = penalties[flagType] || -100;
    await this.modifyReputation(userId, penalty, `flag_${flagType}`, guildId, reason, reportedBy);

    return { success: true, penalty };
  }

  /**
   * Get user's flags
   */
  async getFlags(userId) {
    const result = await this.pool.query(`
      SELECT * FROM reputation_flags WHERE user_id = $1 AND active = TRUE
      ORDER BY timestamp DESC
    `, [userId]);
    return result.rows;
  }

  /**
   * Check if user meets trust requirements
   */
  async checkTrust(userId, guildId, requirement) {
    const rep = await this.getReputation(userId);
    if (!rep) return { meets: false, reason: 'No reputation data' };

    const config = await this.getServerConfig(guildId);
    const threshold = config[requirement] || 0;

    if (rep.reputation < threshold) {
      return { 
        meets: false, 
        reason: `Requires ${threshold} reputation (you have ${rep.reputation})`,
        current: rep.reputation,
        required: threshold
      };
    }

    // Check for active flags
    const flags = await this.getFlags(userId);
    const blockers = flags.filter(f => ['scammer', 'cheater', 'ban_evasion'].includes(f.flag_type));
    
    if (blockers.length > 0) {
      return { 
        meets: false, 
        reason: `Account flagged: ${blockers[0].flag_type}`,
        flags: blockers
      };
    }

    return { meets: true, reputation: rep.reputation };
  }

  /**
   * Get server configuration
   */
  async getServerConfig(guildId) {
    if (this.serverConfigs.has(guildId)) {
      return this.serverConfigs.get(guildId);
    }

    const result = await this.pool.query(
      'SELECT * FROM reputation_config WHERE guild_id = $1',
      [guildId]
    );

    const config = result.rows[0] || {
      min_trust_to_join: 0,
      min_trust_for_lfg: 100,
      min_trust_for_trade: 200,
      auto_roles: {},
      enabled: true
    };

    this.serverConfigs.set(guildId, config);
    return config;
  }

  /**
   * Set server configuration
   */
  async setServerConfig(guildId, config) {
    await this.pool.query(`
      INSERT INTO reputation_config (guild_id, min_trust_to_join, min_trust_for_lfg, min_trust_for_trade, auto_roles, enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (guild_id) DO UPDATE SET
        min_trust_to_join = $2,
        min_trust_for_lfg = $3,
        min_trust_for_trade = $4,
        auto_roles = $5,
        enabled = $6
    `, [guildId, config.min_trust_to_join, config.min_trust_for_lfg, 
        config.min_trust_for_trade, JSON.stringify(config.auto_roles), config.enabled]);

    this.serverConfigs.set(guildId, config);
  }

  /**
   * Get reputation leaderboard
   */
  async getLeaderboard(guildId = null, limit = 10) {
    let query;
    if (guildId) {
      // Server-specific leaderboard
      query = await this.pool.query(`
        SELECT g.*, s.local_modifier 
        FROM reputation_global g
        LEFT JOIN reputation_servers s ON g.user_id = s.user_id AND s.guild_id = $1
        WHERE $1 = ANY(g.servers_active::text[]) OR s.guild_id = $1
        ORDER BY (g.reputation + COALESCE(s.local_modifier, 0)) DESC
        LIMIT $2
      `, [guildId, limit]);
    } else {
      // Global leaderboard
      query = await this.pool.query(`
        SELECT * FROM reputation_global 
        ORDER BY reputation DESC 
        LIMIT $1
      `, [limit]);
    }
    return query.rows;
  }

  /**
   * Generate reputation card embed
   */
  async getReputationEmbed(userId, username) {
    let rep = await this.getReputation(userId);
    if (!rep) {
      await this.initUser(userId, username);
      rep = await this.getReputation(userId);
    }

    const level = this.getTrustLevel(rep.reputation);
    const flags = await this.getFlags(userId);

    const embed = new EmbedBuilder()
      .setTitle(`${level.emoji} ${username}'s Reputation`)
      .setColor(level.color)
      .addFields(
        { name: 'Reputation', value: `**${rep.reputation}**`, inline: true },
        { name: 'Trust Level', value: level.name, inline: true },
        { name: 'Vouches', value: `Given: ${rep.total_vouches_given} | Received: ${rep.total_vouches_received}`, inline: true }
      );

    if (flags.length > 0) {
      embed.addFields({
        name: '⚠️ Active Flags',
        value: flags.map(f => `\`${f.flag_type}\` - ${f.reason}`).join('\n'),
        inline: false
      });
    }

    // Active servers
    const servers = rep.servers_active || [];
    if (servers.length > 0) {
      embed.addFields({
        name: 'Active In',
        value: `${servers.length} server(s)`,
        inline: true
      });
    }

    embed.setFooter({ text: `First seen: ${new Date(rep.first_seen).toLocaleDateString()}` });
    embed.setTimestamp(new Date(rep.last_active));

    return embed;
  }

  /**
   * Record user activity in a server
   */
  async recordActivity(userId, username, guildId) {
    // Ensure user exists
    await this.initUser(userId, username);

    // Add server to active list
    await this.pool.query(`
      UPDATE reputation_global 
      SET servers_active = (
        SELECT jsonb_agg(DISTINCT value) 
        FROM jsonb_array_elements(COALESCE(servers_active, '[]'::jsonb) || $2::jsonb)
      ),
      last_active = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId, JSON.stringify([guildId])]);

    // Ensure server entry exists
    await this.pool.query(`
      INSERT INTO reputation_servers (user_id, guild_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, guild_id) DO NOTHING
    `, [userId, guildId]);

    this.cache.delete(userId);
  }

  /**
   * Daily reputation decay (run on cron)
   */
  async processDecay() {
    // Apply small daily decay to all users
    await this.pool.query(`
      UPDATE reputation_global 
      SET reputation = GREATEST($1, reputation + $2)
      WHERE reputation > $1
    `, [CONFIG.minRep, CONFIG.actions.daily_decay]);

    // Apply larger decay to inactive users (no activity in 7+ days)
    await this.pool.query(`
      UPDATE reputation_global 
      SET reputation = GREATEST($1, reputation + $2)
      WHERE last_active < NOW() - INTERVAL '7 days'
      AND reputation > 0
    `, [CONFIG.minRep, CONFIG.actions.inactive_decay]);

    console.log('✅ Reputation decay processed');
  }

  /**
   * Get reputation history
   */
  async getHistory(userId, limit = 20) {
    const result = await this.pool.query(`
      SELECT * FROM reputation_history 
      WHERE user_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `, [userId, limit]);
    return result.rows;
  }

  /**
   * Network-wide ban check
   */
  async isNetworkBanned(userId) {
    const flags = await this.getFlags(userId);
    const banFlags = ['scammer', 'cheater', 'ban_evasion'];
    return flags.some(f => banFlags.includes(f.flag_type));
  }

  /**
   * Get cross-server statistics
   */
  async getNetworkStats() {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_users,
        AVG(reputation) as avg_reputation,
        COUNT(CASE WHEN reputation < 0 THEN 1 END) as flagged_users,
        SUM(total_vouches_given) as total_vouches
      FROM reputation_global
    `);
    return result.rows[0];
  }
}

module.exports = { ReputationSystem, CONFIG };
