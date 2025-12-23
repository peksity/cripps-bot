/**
 * BOT BRAIN INTEGRATION
 * Simplified integration for Pavel, Cripps, Madam Nazar, Police Chief
 * 
 * Features:
 * - Enhanced Brain for smart responses
 * - Shared Intelligence for cross-bot awareness
 * - Natural self-description
 */

const SharedIntelligence = require('./sharedIntelligence');
const EnhancedBrain = require('./enhancedBrain');

class BotBrainIntegration {
  constructor(botName, pool, anthropic) {
    this.botName = botName;
    this.pool = pool;
    this.anthropic = anthropic;
    
    this.intelligence = new SharedIntelligence(pool, botName);
    this.brain = new EnhancedBrain(botName, pool, anthropic, this.intelligence);
  }

  async initialize() {
    try {
      await this.intelligence.initTables();
      console.log(`🧠 ${this.botName} Brain Integration initialized`);
    } catch (error) {
      console.error(`Brain init error for ${this.botName}:`, error);
    }
  }

  // Track user activity
  async trackUser(userId, username) {
    return await this.intelligence.getOrCreateProfile(userId, username);
  }

  // Record that user participated in LFG
  async recordLFGActivity(userId, type, completed = false) {
    await this.intelligence.incrementStat(userId, 'lfg_participations');
    if (completed) {
      await this.intelligence.incrementStat(userId, 'lfg_completed');
    }
  }

  // Record that user hosted an LFG
  async recordLFGHost(userId, completed = false, abandoned = false) {
    await this.intelligence.incrementStat(userId, 'lfg_hosted');
    if (completed) {
      await this.intelligence.incrementStat(userId, 'lfg_completed');
    }
    if (abandoned) {
      await this.intelligence.incrementStat(userId, 'lfg_abandoned');
    }
  }

  // Get user trust score
  async getTrustScore(userId) {
    return await this.intelligence.calculateTrustScore(userId);
  }

  // Generate smart response
  async generateResponse(message, context = {}) {
    return await this.brain.generateResponse(message, context);
  }

  // Get bot's self description
  async describeSelf(context = 'general') {
    return await this.brain.describeCapabilities(context);
  }

  // Send alert to other bots
  async alertOtherBots(alertType, userId, description) {
    await this.intelligence.broadcastToBots('alert', {
      alertType,
      userId,
      description,
      from: this.botName
    });
  }

  // Check for messages from other bots
  async checkBotMessages() {
    return await this.intelligence.getMessages();
  }
}

module.exports = BotBrainIntegration;
