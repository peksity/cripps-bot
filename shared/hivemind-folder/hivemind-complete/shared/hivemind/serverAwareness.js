/**
 * ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗      █████╗ ██╗    ██╗ █████╗ ██████╗ ███████╗
 * ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗    ██╔══██╗██║    ██║██╔══██╗██╔══██╗██╔════╝
 * ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝    ███████║██║ █╗ ██║███████║██████╔╝█████╗  
 * ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗    ██╔══██║██║███╗██║██╔══██║██╔══██╗██╔══╝  
 * ███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║    ██║  ██║╚███╔███╔╝██║  ██║██║  ██║███████╗
 * ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝    ╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 * 
 * SERVER AWARENESS
 * 
 * Bots are AWARE of the server state:
 * - Who's online/offline
 * - Activity levels
 * - Recent events
 * - Voice channel activity
 * - Message patterns
 */

class ServerAwareness {
  constructor(client) {
    this.client = client;
    
    // Activity tracking
    this.messageHistory = []; // Recent messages
    this.userActivity = new Map(); // userId -> last activity
    this.channelActivity = new Map(); // channelId -> message count
    this.voiceActivity = new Map(); // userId -> voice state
    
    // Events
    this.recentJoins = [];
    this.recentLeaves = [];
    this.recentEvents = [];
    
    // Stats
    this.messagesLastHour = 0;
    this.peakHour = 0;
    this.quietHours = [];
    
    // Start tracking
    this.startTracking();
  }

  /**
   * Start background tracking
   */
  startTracking() {
    // Update stats every 5 minutes
    setInterval(() => this.updateStats(), 5 * 60 * 1000);
    
    // Cleanup old data every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Record a message
   */
  async recordMessage(message) {
    const now = Date.now();
    
    // Add to history
    this.messageHistory.push({
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channel.id,
      channelName: message.channel.name,
      timestamp: now,
      length: message.content.length
    });
    
    // Update user activity
    this.userActivity.set(message.author.id, {
      username: message.author.username,
      lastSeen: now,
      lastChannel: message.channel.id
    });
    
    // Update channel activity
    const channelCount = this.channelActivity.get(message.channel.id) || 0;
    this.channelActivity.set(message.channel.id, channelCount + 1);
    
    // Trim history to last 500 messages
    while (this.messageHistory.length > 500) {
      this.messageHistory.shift();
    }
  }

  /**
   * Record member join
   */
  async recordJoin(member) {
    this.recentJoins.push({
      userId: member.id,
      username: member.user.username,
      timestamp: Date.now()
    });
    
    // Keep last 20
    while (this.recentJoins.length > 20) {
      this.recentJoins.shift();
    }
    
    this.recentEvents.push({
      type: 'join',
      userId: member.id,
      username: member.user.username,
      timestamp: Date.now()
    });
  }

  /**
   * Record member leave
   */
  async recordLeave(member) {
    this.recentLeaves.push({
      userId: member.id,
      username: member.user.username,
      timestamp: Date.now()
    });
    
    while (this.recentLeaves.length > 20) {
      this.recentLeaves.shift();
    }
    
    this.recentEvents.push({
      type: 'leave',
      userId: member.id,
      username: member.user.username,
      timestamp: Date.now()
    });
  }

  /**
   * Record voice join
   */
  async recordVoiceJoin(member, channel) {
    this.voiceActivity.set(member.id, {
      username: member.user.username,
      channelId: channel.id,
      channelName: channel.name,
      joinedAt: Date.now()
    });
    
    this.recentEvents.push({
      type: 'voice_join',
      userId: member.id,
      username: member.user.username,
      channelName: channel.name,
      timestamp: Date.now()
    });
  }

  /**
   * Update statistics
   */
  updateStats() {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    
    // Messages in last hour
    this.messagesLastHour = this.messageHistory.filter(m => m.timestamp > hourAgo).length;
    
    // Cleanup old user activity
    for (const [userId, data] of this.userActivity) {
      if (now - data.lastSeen > 24 * 60 * 60 * 1000) {
        this.userActivity.delete(userId);
      }
    }
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    // Remove old events
    this.recentEvents = this.recentEvents.filter(e => e.timestamp > dayAgo);
    this.recentJoins = this.recentJoins.filter(j => j.timestamp > dayAgo);
    this.recentLeaves = this.recentLeaves.filter(l => l.timestamp > dayAgo);
    
    // Clear old message history
    this.messageHistory = this.messageHistory.filter(m => m.timestamp > dayAgo);
  }

  /**
   * Get current server state
   */
  getState() {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;
    
    // Active users (messaged in last 5 min)
    const activeUsers = this.messageHistory.filter(m => m.timestamp > fiveMinAgo)
      .map(m => m.userId)
      .filter((v, i, a) => a.indexOf(v) === i).length;
    
    // Messages per hour
    const messagesLastHour = this.messageHistory.filter(m => m.timestamp > hourAgo).length;
    
    // Most active channel
    let mostActiveChannel = null;
    let maxCount = 0;
    for (const [channelId, count] of this.channelActivity) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveChannel = channelId;
      }
    }
    
    // Voice activity
    const inVoice = this.voiceActivity.size;
    
    // Recent joins
    const recentJoinCount = this.recentJoins.filter(j => j.timestamp > hourAgo).length;
    
    // Is it quiet?
    const isQuiet = messagesLastHour < 10;
    const isBusy = messagesLastHour > 50;
    const isDead = messagesLastHour < 3 && activeUsers < 2;
    
    return {
      activeUsers,
      messagesLastHour,
      mostActiveChannel,
      inVoice,
      recentJoinCount,
      isQuiet,
      isBusy,
      isDead,
      lastActivity: this.messageHistory.length > 0 ? this.messageHistory[this.messageHistory.length - 1].timestamp : null
    };
  }

  /**
   * Get user's activity pattern
   */
  getUserPattern(userId) {
    const userMessages = this.messageHistory.filter(m => m.userId === userId);
    
    if (userMessages.length === 0) {
      return { known: false };
    }
    
    // Average message length
    const avgLength = userMessages.reduce((a, m) => a + m.length, 0) / userMessages.length;
    
    // Most active channel
    const channelCounts = {};
    for (const m of userMessages) {
      channelCounts[m.channelName] = (channelCounts[m.channelName] || 0) + 1;
    }
    const favoriteChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    
    // Time pattern (hour of day)
    const hourCounts = {};
    for (const m of userMessages) {
      const hour = new Date(m.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    
    return {
      known: true,
      messageCount: userMessages.length,
      avgLength: Math.round(avgLength),
      favoriteChannel,
      peakHour: parseInt(peakHour),
      isActive: userMessages.filter(m => Date.now() - m.timestamp < 60 * 60 * 1000).length > 0
    };
  }

  /**
   * Get recent events summary
   */
  getRecentEventsSummary() {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    
    const recent = this.recentEvents.filter(e => e.timestamp > hourAgo);
    
    const joins = recent.filter(e => e.type === 'join').length;
    const leaves = recent.filter(e => e.type === 'leave').length;
    const voiceJoins = recent.filter(e => e.type === 'voice_join').length;
    
    return { joins, leaves, voiceJoins, total: recent.length };
  }

  /**
   * Was user recently active?
   */
  wasRecentlyActive(userId, minutes = 30) {
    const activity = this.userActivity.get(userId);
    if (!activity) return false;
    return Date.now() - activity.lastSeen < minutes * 60 * 1000;
  }

  /**
   * Get time since user was last seen
   */
  getTimeSinceLastSeen(userId) {
    const activity = this.userActivity.get(userId);
    if (!activity) return null;
    
    const diff = Date.now() - activity.lastSeen;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  }

  /**
   * Get context for AI prompt
   */
  getContextForPrompt() {
    const state = this.getState();
    const events = this.getRecentEventsSummary();
    
    let context = '[SERVER STATE]';
    context += `\n- Activity: ${state.isDead ? 'DEAD' : state.isQuiet ? 'Quiet' : state.isBusy ? 'BUSY' : 'Normal'}`;
    context += `\n- Active users: ${state.activeUsers}`;
    context += `\n- Messages/hour: ${state.messagesLastHour}`;
    if (state.inVoice > 0) context += `\n- ${state.inVoice} in voice`;
    if (events.joins > 0) context += `\n- ${events.joins} new joins recently`;
    
    return context;
  }
}

module.exports = { ServerAwareness };
