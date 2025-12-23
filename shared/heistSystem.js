/**
 * HEIST SYSTEM v1.0 - Full game inside Discord
 * 
 * - Crew formation with specific roles
 * - Planning phases with AI-generated intel
 * - Real-time coordination challenges
 * - AI-generated obstacles and plot twists
 * - Success/failure affects reputation and story
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const HEISTS = {
  fleeca: { id: 'fleeca', name: 'Fleeca Bank Job', tier: 1, minCrew: 2, maxCrew: 4, requiredRoles: ['hacker', 'driver'], basePayout: 50000, difficulty: 1, duration: 15, phases: ['planning', 'approach', 'hack', 'getaway'], image: '🏦' },
  store_robbery: { id: 'store_robbery', name: 'Store Sweep', tier: 1, minCrew: 2, maxCrew: 3, requiredRoles: ['driver', 'muscle'], basePayout: 25000, difficulty: 1, duration: 10, phases: ['planning', 'execution', 'getaway'], image: '🏪' },
  pacific_standard: { id: 'pacific_standard', name: 'Pacific Standard', tier: 2, minCrew: 4, maxCrew: 6, requiredRoles: ['hacker', 'driver', 'demolitions', 'crowd_control'], basePayout: 400000, difficulty: 3, duration: 30, phases: ['planning', 'infiltration', 'hack', 'vault', 'escape'], image: '🏛️' },
  humane_labs: { id: 'humane_labs', name: 'Humane Labs Raid', tier: 2, minCrew: 4, maxCrew: 6, requiredRoles: ['hacker', 'pilot', 'ground_team'], basePayout: 350000, difficulty: 3, duration: 35, phases: ['planning', 'insertion', 'infiltration', 'extraction'], image: '🔬' },
  casino: { id: 'casino', name: 'Diamond Casino Heist', tier: 3, minCrew: 4, maxCrew: 6, requiredRoles: ['hacker', 'driver', 'disguise', 'safecracker'], basePayout: 1500000, difficulty: 5, duration: 45, phases: ['scope', 'planning', 'prep', 'approach', 'vault', 'escape'], approaches: ['stealth', 'aggressive', 'con'], image: '🎰' },
  cayo_perico: { id: 'cayo_perico', name: 'Cayo Perico', tier: 4, minCrew: 1, maxCrew: 4, requiredRoles: ['leader'], basePayout: 2500000, difficulty: 6, duration: 60, phases: ['intel', 'planning', 'prep', 'infiltration', 'compound', 'escape'], approaches: ['stealth', 'aggressive', 'drainage'], image: '🏝️' },
  union_depository: { id: 'union_depository', name: 'Union Depository', tier: 4, minCrew: 6, maxCrew: 8, requiredRoles: ['mastermind', 'hacker', 'driver', 'pilot', 'demolitions', 'muscle'], basePayout: 5000000, difficulty: 7, duration: 90, phases: ['planning', 'prep_1', 'prep_2', 'execution', 'escape'], legendary: true, image: '🏆' }
};

const ROLES = {
  mastermind: { name: 'Mastermind', icon: '🧠', skills: ['planning', 'adaptation'] },
  hacker: { name: 'Hacker', icon: '💻', skills: ['security_bypass', 'camera_loop'] },
  driver: { name: 'Driver', icon: '🚗', skills: ['getaway', 'pursuit_evasion'] },
  pilot: { name: 'Pilot', icon: '🚁', skills: ['air_extraction', 'surveillance'] },
  demolitions: { name: 'Demolitions', icon: '💥', skills: ['vault_breach', 'distraction'] },
  muscle: { name: 'Muscle', icon: '💪', skills: ['combat', 'intimidation'] },
  lookout: { name: 'Lookout', icon: '👁️', skills: ['surveillance', 'warning'] },
  crowd_control: { name: 'Crowd Control', icon: '📢', skills: ['hostages', 'communication'] },
  safecracker: { name: 'Safecracker', icon: '🔐', skills: ['vault_silent', 'lockpicking'] },
  disguise: { name: 'Disguise', icon: '🎭', skills: ['impersonation', 'social_engineering'] },
  sniper: { name: 'Sniper', icon: '🎯', skills: ['overwatch', 'precision'] },
  ground_team: { name: 'Ground Team', icon: '🎖️', skills: ['combat', 'objectives'] },
  leader: { name: 'Heist Leader', icon: '⭐', skills: ['leadership', 'planning'] }
};

const COMPLICATIONS = {
  planning: [
    { id: 'intel_leak', description: 'Your intel was leaked!', severity: 2 },
    { id: 'schedule_change', description: 'Target changed schedule!', severity: 2 }
  ],
  approach: [
    { id: 'extra_guards', description: '⚠️ Extra security today!', severity: 2 },
    { id: 'traffic_jam', description: 'Route blocked!', severity: 1 }
  ],
  infiltration: [
    { id: 'alarm_triggered', description: '🚨 ALARM! 60 seconds!', severity: 3, urgent: true },
    { id: 'guard_patrol', description: 'Guard incoming!', severity: 2 }
  ],
  vault: [
    { id: 'vault_upgraded', description: 'Vault upgraded!', severity: 3 },
    { id: 'silent_alarm', description: 'Silent alarm triggered!', severity: 3 }
  ],
  escape: [
    { id: 'roadblock', description: '🚔 Roadblock ahead!', severity: 2 },
    { id: 'helicopter', description: '🚁 Police chopper!', severity: 3 },
    { id: 'crew_injured', description: 'Crew member hit!', severity: 3, moral: true }
  ],
  general: [
    { id: 'betrayal', description: '💀 BETRAYAL!', severity: 5, rare: true },
    { id: 'rival_crew', description: 'Another crew here!', severity: 4, rare: true }
  ]
};

class HeistSession {
  constructor(id, heistType, leaderId, leaderName, guildId) {
    this.id = id;
    this.heistType = heistType;
    this.heistData = HEISTS[heistType];
    this.leaderId = leaderId;
    this.leaderName = leaderName;
    this.guildId = guildId;
    this.crew = new Map();
    this.status = 'recruiting';
    this.currentPhase = 0;
    this.complications = [];
    this.startTime = null;
    this.payout = this.heistData.basePayout;
    this.successChance = 70;
    this.crew.set(leaderId, { name: leaderName, role: 'leader', ready: true });
  }

  canStart() {
    if (this.crew.size < this.heistData.minCrew) return { can: false, reason: `Need ${this.heistData.minCrew}+ crew` };
    const roles = [...this.crew.values()].map(c => c.role);
    for (const req of this.heistData.requiredRoles) {
      if (!roles.includes(req) && req !== 'leader') return { can: false, reason: `Missing: ${ROLES[req]?.name}` };
    }
    if ([...this.crew.values()].some(c => !c.ready)) return { can: false, reason: 'Not everyone ready' };
    return { can: true };
  }

  addMember(userId, userName, role) {
    if (this.crew.size >= this.heistData.maxCrew) return false;
    this.crew.set(userId, { name: userName, role, ready: false });
    return true;
  }

  removeMember(userId) {
    if (userId === this.leaderId) return false;
    return this.crew.delete(userId);
  }

  setReady(userId) {
    const m = this.crew.get(userId);
    if (m && m.role) { m.ready = true; return true; }
    return false;
  }

  setRole(userId, role) {
    const m = this.crew.get(userId);
    if (m && ROLES[role]) { m.role = role; return true; }
    return false;
  }

  calculateSuccess() {
    let chance = 70;
    chance += (this.crew.size - this.heistData.minCrew) * 5;
    chance -= this.heistData.difficulty * 3;
    chance -= this.complications.length * 5;
    this.successChance = Math.max(10, Math.min(95, chance));
    return this.successChance;
  }

  rollComplication(phase) {
    const pool = COMPLICATIONS[phase] || COMPLICATIONS.general;
    if (Math.random() < 0.2 + this.heistData.tier * 0.1) {
      const comp = pool[Math.floor(Math.random() * pool.length)];
      this.complications.push({ ...comp, phase, time: new Date() });
      return comp;
    }
    return null;
  }

  complete(success) {
    this.status = success ? 'completed' : 'failed';
    if (success) {
      const perPerson = Math.floor(this.payout / this.crew.size);
      return { success: true, total: this.payout, perPerson };
    }
    return { success: false, total: 0, perPerson: 0 };
  }

  toEmbed() {
    const h = this.heistData;
    const statusEmoji = { recruiting: '📋', planning: '🗺️', active: '🔥', completed: '✅', failed: '❌' };
    const embed = new EmbedBuilder()
      .setTitle(`${h.image} ${h.name}`)
      .setColor(this.status === 'completed' ? 0x00FF00 : this.status === 'failed' ? 0xFF0000 : 0xFFD700)
      .addFields(
        { name: 'Status', value: `${statusEmoji[this.status]} ${this.status.toUpperCase()}`, inline: true },
        { name: 'Tier', value: '⭐'.repeat(h.tier), inline: true },
        { name: 'Crew', value: `${this.crew.size}/${h.maxCrew}`, inline: true },
        { name: 'Payout', value: `$${h.basePayout.toLocaleString()}`, inline: true }
      );
    const crewList = [...this.crew.entries()].map(([id, d]) => {
      const icon = ROLES[d.role]?.icon || '❓';
      return `${d.ready ? '✅' : '⏳'} ${icon} **${d.name}** - ${ROLES[d.role]?.name || 'Unassigned'}`;
    }).join('\n');
    embed.addFields({ name: 'Crew', value: crewList || 'Empty', inline: false });
    embed.setFooter({ text: `ID: ${this.id} | Leader: ${this.leaderName}` });
    return embed;
  }

  getButtons() {
    if (this.status === 'recruiting') {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`heist_join_${this.id}`).setLabel('Join').setStyle(ButtonStyle.Primary).setEmoji('👥'),
        new ButtonBuilder().setCustomId(`heist_ready_${this.id}`).setLabel('Ready').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`heist_leave_${this.id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`heist_start_${this.id}`).setLabel('START').setStyle(ButtonStyle.Danger).setEmoji('🔥')
      );
    }
    return null;
  }

  getRoleSelect() {
    const opts = Object.entries(ROLES).slice(0, 25).map(([id, r]) => ({ label: r.name, value: id, emoji: r.icon }));
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`heist_role_${this.id}`).setPlaceholder('Select role...').addOptions(opts)
    );
  }
}

class HeistSystem {
  constructor(pool, anthropic, client) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.client = client;
    this.sessions = new Map();
  }

  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS heist_sessions (id TEXT PRIMARY KEY, heist_type TEXT, leader_id TEXT, guild_id TEXT, status TEXT DEFAULT 'recruiting', crew JSONB, payout INTEGER DEFAULT 0, success BOOLEAN, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS heist_stats (user_id TEXT PRIMARY KEY, total INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, earnings BIGINT DEFAULT 0, streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS heist_leaderboard (user_id TEXT PRIMARY KEY, username TEXT, earnings BIGINT DEFAULT 0, heists INTEGER DEFAULT 0, win_rate FLOAT DEFAULT 0)`);
    console.log('✅ Heist System ready');
  }

  genId() { return `HEIST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`; }

  async create(heistType, leaderId, leaderName, guildId) {
    if (!HEISTS[heistType]) return null;
    const s = new HeistSession(this.genId(), heistType, leaderId, leaderName, guildId);
    this.sessions.set(s.id, s);
    await this.pool.query(`INSERT INTO heist_sessions (id, heist_type, leader_id, guild_id, crew) VALUES ($1, $2, $3, $4, $5)`,
      [s.id, heistType, leaderId, guildId, JSON.stringify([...s.crew.entries()])]);
    return s;
  }

  get(id) { return this.sessions.get(id); }

  async join(id, userId, userName) {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'recruiting') return { ok: false, reason: 'Not available' };
    if (s.crew.has(userId)) return { ok: false, reason: 'Already in crew' };
    if (!s.addMember(userId, userName, null)) return { ok: false, reason: 'Full' };
    return { ok: true, session: s };
  }

  async leave(id, userId) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false };
    if (!s.removeMember(userId)) return { ok: false, reason: 'Cannot leave' };
    return { ok: true, session: s };
  }

  async setRole(id, userId, role) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false };
    s.setRole(userId, role);
    return { ok: true, session: s };
  }

  async ready(id, userId) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false };
    if (!s.setReady(userId)) return { ok: false, reason: 'Select role first' };
    return { ok: true, session: s };
  }

  async start(id, userId) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, reason: 'Not found' };
    if (userId !== s.leaderId) return { ok: false, reason: 'Leader only' };
    const can = s.canStart();
    if (!can.can) return { ok: false, reason: can.reason };
    s.status = 'active';
    s.startTime = new Date();
    s.calculateSuccess();
    return { ok: true, session: s };
  }

  async processPhase(id) {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'active') return null;
    const phase = s.heistData.phases[s.currentPhase];
    const comp = s.rollComplication(phase);
    s.currentPhase++;
    if (s.currentPhase >= s.heistData.phases.length) {
      const success = Math.random() * 100 < s.successChance;
      const result = s.complete(success);
      for (const [uid, d] of s.crew) await this.updateStats(uid, d.name, success, result.perPerson);
      return { done: true, success, result, comp };
    }
    return { done: false, phase, comp, chance: s.successChance };
  }

  async updateStats(userId, username, win, earnings) {
    await this.pool.query(`INSERT INTO heist_stats (user_id, total, wins, earnings, streak, best_streak) VALUES ($1, 1, $2, $3, $4, $4)
      ON CONFLICT (user_id) DO UPDATE SET total = heist_stats.total + 1, wins = heist_stats.wins + $2, earnings = heist_stats.earnings + $3,
      streak = CASE WHEN $2 = 1 THEN heist_stats.streak + 1 ELSE 0 END,
      best_streak = GREATEST(heist_stats.best_streak, CASE WHEN $2 = 1 THEN heist_stats.streak + 1 ELSE heist_stats.best_streak END)`,
      [userId, win ? 1 : 0, earnings, win ? 1 : 0]);
    await this.pool.query(`INSERT INTO heist_leaderboard (user_id, username, earnings, heists, win_rate) VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (user_id) DO UPDATE SET username = $2, earnings = heist_leaderboard.earnings + $3, heists = heist_leaderboard.heists + 1`,
      [userId, username, earnings, win ? 1 : 0]);
  }

  async leaderboard(limit = 10) {
    const r = await this.pool.query('SELECT * FROM heist_leaderboard ORDER BY earnings DESC LIMIT $1', [limit]);
    return r.rows;
  }

  async stats(userId) {
    const r = await this.pool.query('SELECT * FROM heist_stats WHERE user_id = $1', [userId]);
    return r.rows[0] || null;
  }

  listEmbed() {
    const embed = new EmbedBuilder().setTitle('🎯 Available Heists').setColor(0xFFD700);
    for (let t = 1; t <= 4; t++) {
      const heists = Object.values(HEISTS).filter(h => h.tier === t);
      const names = ['Beginner', 'Intermediate', 'Expert', 'Legendary'];
      const list = heists.map(h => `${h.image} **${h.name}** - $${h.basePayout.toLocaleString()} (${h.minCrew}-${h.maxCrew})`).join('\n');
      if (list) embed.addFields({ name: `${'⭐'.repeat(t)} ${names[t-1]}`, value: list });
    }
    embed.setFooter({ text: 'Use ?heist <name> to start' });
    return embed;
  }
}

module.exports = { HeistSystem, HeistSession, HEISTS, ROLES, COMPLICATIONS };
