/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CROSS-SERVER REPUTATION NETWORK v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Your reputation follows you EVERYWHERE.
 * Scammers, griefers, trolls get flagged across all servers using this system.
 * Good players build trust that transfers between communities.
 * 
 * This could be a paid service other server owners subscribe to.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { EmbedBuilder } = require('discord.js');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

const REPUTATION_CATEGORIES = {
  // Positive
  helpful: { name: 'Helpful', emoji: '💡', weight: 2, description: 'Helps other members' },
  reliable: { name: 'Reliable', emoji: '✅', weight: 3, description: 'Shows up, keeps commitments' },
  skilled: { name: 'Skilled', emoji: '🎮', weight: 2, description: 'Good at the game' },
  friendly: { name: 'Friendly', emoji: '😊', weight: 1, description: 'Pleasant to interact with' },
  leader: { name: 'Leader', emoji: '👑', weight: 3, description: 'Organizes events, leads groups' },
  generous: { name: 'Generous', emoji: '🎁', weight: 2, description: 'Shares resources, helps newbies' },
  trusted: { name: 'Trusted', emoji: '🔐', weight: 4, description: 'Vouched by trusted members' },
  veteran: { name: 'Veteran', emoji: '⭐', weight: 2, description: 'Long-standing community member' },
  
  // Negative
  toxic: { name: 'Toxic', emoji: '☠️', weight: -3, description: 'Rude, aggressive behavior' },
  scammer: { name: 'Scammer', emoji: '🚨', weight: -10, description: 'Confirmed scam attempts' },
  griefer: { name: 'Griefer', emoji: '💀', weight: -5, description: 'Intentionally ruins others\' experience' },
  unreliable: { name: 'Unreliable', emoji: '❌', weight: -2, description: 'No-shows, breaks commitments' },
  cheater: { name: 'Cheater', emoji: '🎭', weight: -7, description: 'Uses exploits/cheats unfairly' },
  harassment: { name: 'Harasser', emoji: '⚠️', weight: -8, description: 'Harasses other members' },
  ban_evader: { name: 'Ban Evader', emoji: '🔄', weight: -6, description: 'Creates alts to evade bans' },
  raid: { name: 'Raider', emoji: '💣', weight: -9, description: 'Participates in server raids' }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST TIERS
// ═══════════════════════════════════════════════════════════════════════════════

const TRUST_TIERS = {
  legendary: { min: 500, name: 'Legendary', emoji: '🏆', color: 0xFFD700, perks: ['instant_verify', 'vouch_power_5'] },
  trusted: { min: 200, name: 'Trusted', emoji: '💎', color: 0x00FFFF, perks: ['fast_verify', 'vouch_power_3'] },
  established: { min: 100, name: 'Established', emoji: '🌟', color: 0x00FF00, perks: ['vouch_power_2'] },
  member: { min: 25, name: 'Member', emoji: '👤', color: 0x808080, perks: ['vouch_power_1'] },
  new: { min: 0, name: 'New', emoji: '🆕', color: 0xAAAAAA, perks: [] },
  sus: { min: -25, name: 'Suspicious', emoji: '👀', color: 0xFFAA00, perks: [], restrictions: ['slow_verify'] },
  untrusted: { min: -100, name: 'Untrusted', emoji: '⚠️', color: 0xFF6600, perks: [], restrictions: ['manual_verify'] },
  blacklisted: { min: -200, name: 'Blacklisted', emoji: '🚫', color: 0xFF0000, perks: [], restrictions: ['auto_deny'] }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-SERVER REPUTATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

class ReputationNetwork {
  constructor(pool, client) {
    this.pool = pool;
    this.client = client;
    this.networkId = process.env.REPUTATION_NETWORK_ID || 'unpatched_network';
    this.networkSecret = process.env.REPUTATION_NETWORK_SECRET || this.generateSecret();
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  async initialize() {
    // Create tables
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_users (
        user_id TEXT PRIMARY KEY,
        global_score INTEGER DEFAULT 0,
        category_scores JSONB DEFAULT '{}',
        trust_tier TEXT DEFAULT 'new',
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        servers_active INTEGER DEFAULT 0,
        total_vouches_received INTEGER DEFAULT 0,
        total_vouches_given INTEGER DEFAULT 0,
        flags JSONB DEFAULT '[]',
        notes TEXT[]
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_events (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        category TEXT,
        points INTEGER,
        source_server TEXT,
        source_user TEXT,
        evidence TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified BOOLEAN DEFAULT FALSE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_vouches (
        id SERIAL PRIMARY KEY,
        voucher_id TEXT NOT NULL,
        vouchee_id TEXT NOT NULL,
        vouch_type TEXT DEFAULT 'positive',
        reason TEXT,
        weight INTEGER DEFAULT 1,
        server_id TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked BOOLEAN DEFAULT FALSE,
        UNIQUE(voucher_id, vouchee_id)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_servers (
        server_id TEXT PRIMARY KEY,
        server_name TEXT,
        owner_id TEXT,
        joined_network TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        trust_level INTEGER DEFAULT 1,
        total_reports INTEGER DEFAULT 0,
        verified_reports INTEGER DEFAULT 0,
        settings JSONB DEFAULT '{}'
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_bans (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        reason TEXT,
        banned_by TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        propagate BOOLEAN DEFAULT TRUE,
        severity INTEGER DEFAULT 1,
        UNIQUE(user_id, server_id)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_appeals (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        appeal_type TEXT,
        reason TEXT,
        evidence TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('🌐 Reputation Network: ONLINE');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // USER REPUTATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  async getReputation(userId) {
    let result = await this.pool.query('SELECT * FROM reputation_users WHERE user_id = $1', [userId]);
    
    if (result.rows.length === 0) {
      // Create new user
      await this.pool.query(`
        INSERT INTO reputation_users (user_id) VALUES ($1)
      `, [userId]);
      result = await this.pool.query('SELECT * FROM reputation_users WHERE user_id = $1', [userId]);
    }
    
    const user = result.rows[0];
    user.tier = this.calculateTier(user.global_score);
    
    return user;
  }

  calculateTier(score) {
    for (const [tierId, tier] of Object.entries(TRUST_TIERS)) {
      if (score >= tier.min) {
        return { id: tierId, ...tier };
      }
    }
    return { id: 'new', ...TRUST_TIERS.new };
  }

  async addReputationEvent(userId, category, points, sourceServer, sourceUser, evidence = null) {
    // Validate category
    if (!REPUTATION_CATEGORIES[category]) {
      throw new Error('Invalid reputation category');
    }

    const categoryData = REPUTATION_CATEGORIES[category];
    const actualPoints = points * categoryData.weight;

    // Log the event
    await this.pool.query(`
      INSERT INTO reputation_events (user_id, event_type, category, points, source_server, source_user, evidence)
      VALUES ($1, 'reputation_change', $2, $3, $4, $5, $6)
    `, [userId, category, actualPoints, sourceServer, sourceUser, evidence]);

    // Update user's reputation
    await this.pool.query(`
      UPDATE reputation_users SET
        global_score = global_score + $2,
        category_scores = jsonb_set(
          COALESCE(category_scores, '{}'),
          ARRAY[$3],
          (COALESCE((category_scores->$3)::integer, 0) + $4)::text::jsonb
        ),
        last_updated = NOW()
      WHERE user_id = $1
    `, [userId, actualPoints, category, points]);

    // Update trust tier
    await this.updateTrustTier(userId);

    return { category, points: actualPoints };
  }

  async updateTrustTier(userId) {
    const user = await this.getReputation(userId);
    const tier = this.calculateTier(user.global_score);
    
    if (user.trust_tier !== tier.id) {
      await this.pool.query(`
        UPDATE reputation_users SET trust_tier = $2 WHERE user_id = $1
      `, [userId, tier.id]);

      // Log tier change
      await this.pool.query(`
        INSERT INTO reputation_events (user_id, event_type, category, points, source_server)
        VALUES ($1, 'tier_change', $2, $3, 'system')
      `, [userId, tier.id, user.global_score]);
    }

    return tier;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VOUCH SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════════

  async vouch(voucherId, voucheeId, serverId, reason = null) {
    // Get voucher's reputation to determine vouch weight
    const voucher = await this.getReputation(voucherId);
    const voucherTier = this.calculateTier(voucher.global_score);
    
    // Determine vouch power
    let vouchPower = 1;
    for (const perk of voucherTier.perks || []) {
      if (perk.startsWith('vouch_power_')) {
        vouchPower = parseInt(perk.split('_')[2]);
      }
    }

    // Check if already vouched
    const existing = await this.pool.query(
      'SELECT * FROM reputation_vouches WHERE voucher_id = $1 AND vouchee_id = $2 AND NOT revoked',
      [voucherId, voucheeId]
    );

    if (existing.rows.length > 0) {
      return { success: false, message: 'You have already vouched for this user.' };
    }

    // Can't vouch for yourself
    if (voucherId === voucheeId) {
      return { success: false, message: 'You cannot vouch for yourself.' };
    }

    // Create vouch
    await this.pool.query(`
      INSERT INTO reputation_vouches (voucher_id, vouchee_id, weight, reason, server_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [voucherId, voucheeId, vouchPower, reason, serverId]);

    // Update vouchee's reputation
    await this.addReputationEvent(voucheeId, 'trusted', vouchPower, serverId, voucherId, `Vouched by user with ${voucherTier.name} status`);

    // Update vouch counts
    await this.pool.query(`UPDATE reputation_users SET total_vouches_given = total_vouches_given + 1 WHERE user_id = $1`, [voucherId]);
    await this.pool.query(`UPDATE reputation_users SET total_vouches_received = total_vouches_received + 1 WHERE user_id = $1`, [voucheeId]);

    return { success: true, vouchPower, message: `Vouched with ${vouchPower}x power!` };
  }

  async revokeVouch(voucherId, voucheeId) {
    const vouch = await this.pool.query(
      'SELECT * FROM reputation_vouches WHERE voucher_id = $1 AND vouchee_id = $2 AND NOT revoked',
      [voucherId, voucheeId]
    );

    if (vouch.rows.length === 0) {
      return { success: false, message: 'No active vouch found.' };
    }

    const vouchData = vouch.rows[0];

    // Revoke vouch
    await this.pool.query(`
      UPDATE reputation_vouches SET revoked = TRUE WHERE voucher_id = $1 AND vouchee_id = $2
    `, [voucherId, voucheeId]);

    // Remove reputation points
    await this.addReputationEvent(voucheeId, 'trusted', -vouchData.weight, 'system', voucherId, 'Vouch revoked');

    return { success: true, message: 'Vouch revoked.' };
  }

  async getVouches(userId) {
    const received = await this.pool.query(
      'SELECT * FROM reputation_vouches WHERE vouchee_id = $1 AND NOT revoked ORDER BY timestamp DESC',
      [userId]
    );

    const given = await this.pool.query(
      'SELECT * FROM reputation_vouches WHERE voucher_id = $1 AND NOT revoked ORDER BY timestamp DESC',
      [userId]
    );

    return { received: received.rows, given: given.rows };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BAN PROPAGATION
  // ═══════════════════════════════════════════════════════════════════════════════

  async reportBan(userId, serverId, reason, bannedBy, severity = 1, propagate = true) {
    // Record the ban
    await this.pool.query(`
      INSERT INTO reputation_bans (user_id, server_id, reason, banned_by, severity, propagate)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, server_id) DO UPDATE SET
        reason = $3, banned_by = $4, severity = $5, timestamp = NOW()
    `, [userId, serverId, reason, bannedBy, severity, propagate]);

    // Add negative reputation based on severity
    const severityCategory = {
      1: 'toxic',
      2: 'griefer',
      3: 'cheater',
      4: 'harassment',
      5: 'scammer'
    };

    const category = severityCategory[Math.min(severity, 5)] || 'toxic';
    await this.addReputationEvent(userId, category, severity, serverId, bannedBy, reason);

    // If propagate is true, alert other servers
    if (propagate) {
      await this.propagateBanAlert(userId, serverId, reason, severity);
    }

    return { success: true };
  }

  async propagateBanAlert(userId, sourceServer, reason, severity) {
    // Get all servers in the network
    const servers = await this.pool.query('SELECT * FROM reputation_servers WHERE server_id != $1', [sourceServer]);

    const user = await this.client.users.fetch(userId).catch(() => null);
    const userName = user?.tag || userId;

    for (const server of servers.rows) {
      try {
        const guild = this.client.guilds.cache.get(server.server_id);
        if (!guild) continue;

        // Find alert channel
        const alertChannel = guild.channels.cache.find(c => 
          c.name === 'reputation-alerts' || 
          c.name === 'mod-alerts' || 
          c.name === 'nexus-log'
        );

        if (!alertChannel) continue;

        const embed = new EmbedBuilder()
          .setTitle('🚨 Network Ban Alert')
          .setDescription(`A user has been banned from another server in the network.`)
          .addFields(
            { name: 'User', value: `${userName} (${userId})`, inline: true },
            { name: 'Severity', value: `${'🔴'.repeat(severity)}${'⚪'.repeat(5 - severity)}`, inline: true },
            { name: 'Reason', value: reason || 'No reason provided', inline: false }
          )
          .setColor(severity >= 3 ? 0xFF0000 : 0xFFAA00)
          .setTimestamp()
          .setFooter({ text: 'Reputation Network Alert' });

        // Add action buttons based on server settings
        if (server.settings?.auto_action && severity >= 4) {
          embed.addFields({ name: '⚠️ Action Taken', value: 'User has been automatically flagged for review.' });
        }

        await alertChannel.send({ embeds: [embed] });

      } catch (e) {
        console.error(`Failed to send ban alert to ${server.server_id}:`, e);
      }
    }
  }

  async checkUserBans(userId) {
    const bans = await this.pool.query(
      'SELECT * FROM reputation_bans WHERE user_id = $1 ORDER BY timestamp DESC',
      [userId]
    );

    return bans.rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SERVER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  async registerServer(serverId, serverName, ownerId) {
    await this.pool.query(`
      INSERT INTO reputation_servers (server_id, server_name, owner_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (server_id) DO UPDATE SET server_name = $2
    `, [serverId, serverName, ownerId]);

    return { success: true };
  }

  async getNetworkStats() {
    const users = await this.pool.query('SELECT COUNT(*) FROM reputation_users');
    const servers = await this.pool.query('SELECT COUNT(*) FROM reputation_servers');
    const events = await this.pool.query('SELECT COUNT(*) FROM reputation_events');
    const bans = await this.pool.query('SELECT COUNT(*) FROM reputation_bans WHERE propagate = TRUE');
    const vouches = await this.pool.query('SELECT COUNT(*) FROM reputation_vouches WHERE NOT revoked');

    return {
      totalUsers: parseInt(users.rows[0].count),
      totalServers: parseInt(servers.rows[0].count),
      totalEvents: parseInt(events.rows[0].count),
      propagatedBans: parseInt(bans.rows[0].count),
      activeVouches: parseInt(vouches.rows[0].count)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VERIFICATION INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════════

  async checkJoiningUser(userId, serverId) {
    const reputation = await this.getReputation(userId);
    const tier = this.calculateTier(reputation.global_score);
    const bans = await this.checkUserBans(userId);

    const result = {
      userId,
      reputation,
      tier,
      bans,
      recommendation: 'allow',
      flags: []
    };

    // Check for blacklist
    if (tier.id === 'blacklisted') {
      result.recommendation = 'deny';
      result.flags.push('Blacklisted from network');
    }

    // Check for recent bans
    const recentBans = bans.filter(b => {
      const banAge = Date.now() - new Date(b.timestamp).getTime();
      return banAge < 30 * 24 * 60 * 60 * 1000; // 30 days
    });

    if (recentBans.length > 0) {
      if (recentBans.some(b => b.severity >= 4)) {
        result.recommendation = 'deny';
        result.flags.push(`Recent severe ban (severity ${Math.max(...recentBans.map(b => b.severity))})`);
      } else {
        result.recommendation = 'review';
        result.flags.push(`${recentBans.length} recent ban(s) on record`);
      }
    }

    // Check trust tier restrictions
    if (tier.restrictions?.includes('auto_deny')) {
      result.recommendation = 'deny';
    } else if (tier.restrictions?.includes('manual_verify')) {
      result.recommendation = 'review';
      result.flags.push('Low trust score - manual review required');
    } else if (tier.restrictions?.includes('slow_verify')) {
      result.recommendation = 'slow';
      result.flags.push('Suspicious activity - additional verification');
    }

    // Positive indicators
    if (tier.perks?.includes('instant_verify')) {
      result.recommendation = 'instant';
      result.flags.push('Legendary status - instant verification');
    } else if (tier.perks?.includes('fast_verify')) {
      result.recommendation = 'fast';
      result.flags.push('Trusted status - expedited verification');
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMBEDS AND DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════════

  async createReputationEmbed(userId, requestingUser = null) {
    const reputation = await this.getReputation(userId);
    const tier = this.calculateTier(reputation.global_score);
    const bans = await this.checkUserBans(userId);
    const vouches = await this.getVouches(userId);
    
    const user = await this.client.users.fetch(userId).catch(() => null);

    // Get category breakdown
    const categories = reputation.category_scores || {};
    const positiveCategories = Object.entries(categories)
      .filter(([cat,]) => REPUTATION_CATEGORIES[cat]?.weight > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    const negativeCategories = Object.entries(categories)
      .filter(([cat,]) => REPUTATION_CATEGORIES[cat]?.weight < 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3);

    const embed = new EmbedBuilder()
      .setTitle(`${tier.emoji} Reputation: ${user?.tag || userId}`)
      .setThumbnail(user?.displayAvatarURL() || null)
      .setColor(tier.color)
      .addFields(
        { name: '🎯 Trust Score', value: `**${reputation.global_score}** points`, inline: true },
        { name: '🏆 Trust Tier', value: `${tier.emoji} ${tier.name}`, inline: true },
        { name: '🌐 Servers Active', value: `${reputation.servers_active || 1}`, inline: true },
        { name: '✅ Vouches Received', value: `${vouches.received.length}`, inline: true },
        { name: '🤝 Vouches Given', value: `${vouches.given.length}`, inline: true },
        { name: '⚠️ Network Bans', value: `${bans.length}`, inline: true }
      );

    // Positive traits
    if (positiveCategories.length > 0) {
      const positive = positiveCategories
        .map(([cat, score]) => `${REPUTATION_CATEGORIES[cat].emoji} ${REPUTATION_CATEGORIES[cat].name}: +${score}`)
        .join('\n');
      embed.addFields({ name: '👍 Positive Traits', value: positive, inline: true });
    }

    // Negative traits
    if (negativeCategories.length > 0) {
      const negative = negativeCategories
        .map(([cat, score]) => `${REPUTATION_CATEGORIES[cat].emoji} ${REPUTATION_CATEGORIES[cat].name}: ${score}`)
        .join('\n');
      embed.addFields({ name: '👎 Concerns', value: negative, inline: true });
    }

    // Recent bans warning
    if (bans.length > 0) {
      const recentBan = bans[0];
      embed.addFields({ 
        name: '🚨 Most Recent Ban', 
        value: `**Reason:** ${recentBan.reason || 'Not specified'}\n**When:** <t:${Math.floor(new Date(recentBan.timestamp).getTime() / 1000)}:R>`,
        inline: false 
      });
    }

    // Perks or restrictions
    if (tier.perks?.length > 0) {
      embed.addFields({ name: '✨ Perks', value: tier.perks.map(p => `• ${p.replace(/_/g, ' ')}`).join('\n'), inline: false });
    }
    if (tier.restrictions?.length > 0) {
      embed.addFields({ name: '🔒 Restrictions', value: tier.restrictions.map(r => `• ${r.replace(/_/g, ' ')}`).join('\n'), inline: false });
    }

    embed.setFooter({ text: `First seen: ${new Date(reputation.first_seen).toLocaleDateString()} | Network ID: ${this.networkId}` });

    return embed;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMMAND HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════════

  async handleCommand(message, command, args) {
    switch (command) {
      case 'rep':
      case 'reputation':
        const targetUser = message.mentions.users.first() || message.author;
        const embed = await this.createReputationEmbed(targetUser.id, message.author.id);
        return message.reply({ embeds: [embed] });

      case 'vouch':
        if (!args[0]) return message.reply('Usage: `?vouch @user [reason]`');
        const vouchTarget = message.mentions.users.first();
        if (!vouchTarget) return message.reply('Please mention a user to vouch for.');
        const vouchReason = args.slice(1).join(' ') || null;
        const vouchResult = await this.vouch(message.author.id, vouchTarget.id, message.guild.id, vouchReason);
        return message.reply(vouchResult.message);

      case 'unvouch':
        if (!args[0]) return message.reply('Usage: `?unvouch @user`');
        const unvouchTarget = message.mentions.users.first();
        if (!unvouchTarget) return message.reply('Please mention a user.');
        const unvouchResult = await this.revokeVouch(message.author.id, unvouchTarget.id);
        return message.reply(unvouchResult.message);

      case 'networkstats':
        const stats = await this.getNetworkStats();
        const statsEmbed = new EmbedBuilder()
          .setTitle('🌐 Reputation Network Stats')
          .addFields(
            { name: '👥 Total Users', value: stats.totalUsers.toLocaleString(), inline: true },
            { name: '🖥️ Servers', value: stats.totalServers.toLocaleString(), inline: true },
            { name: '📊 Events', value: stats.totalEvents.toLocaleString(), inline: true },
            { name: '🚨 Network Bans', value: stats.propagatedBans.toLocaleString(), inline: true },
            { name: '🤝 Active Vouches', value: stats.activeVouches.toLocaleString(), inline: true }
          )
          .setColor(0x00AAFF);
        return message.reply({ embeds: [statsEmbed] });

      case 'reportuser':
        if (!message.member.permissions.has('ModerateMembers')) {
          return message.reply('You need Moderate Members permission.');
        }
        const reportTarget = message.mentions.users.first();
        if (!reportTarget) return message.reply('Usage: `?reportuser @user [category] [reason]`');
        const category = args[1] || 'toxic';
        const reason = args.slice(2).join(' ') || 'No reason provided';
        if (!REPUTATION_CATEGORIES[category]) {
          return message.reply(`Invalid category. Valid: ${Object.keys(REPUTATION_CATEGORIES).join(', ')}`);
        }
        await this.addReputationEvent(reportTarget.id, category, 1, message.guild.id, message.author.id, reason);
        return message.reply(`Reported ${reportTarget.tag} for ${category}.`);

      default:
        return null;
    }
  }
}

module.exports = { ReputationNetwork, REPUTATION_CATEGORIES, TRUST_TIERS };
