/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ULTIMATE BOT INTELLIGENCE v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * THE BRAIN THAT CONNECTS EVERYTHING:
 * 
 * CORE SYSTEMS (v5.0):
 * - User Memory System (relationships, nicknames, secrets, achievements)
 * - Cross-Bot Memory (gossip, alliances, collective opinions)
 * - Emotional Intelligence (mood detection, support needs, typing quirks)
 * - Learning System (adaptation, pattern recognition)
 * - Special Events (easter eggs, rare events, holidays)
 * - Media Generation (AI images/videos)
 * 
 * ADVANCED SYSTEMS (v2.0):
 * - Living Story Engine (multi-week narratives)
 * - Dream System (surreal 2-5 AM messages)
 * - Phrase Adoption (learn user speech patterns)
 * - Anniversary Memory (exact date memories)
 * - Confession Mode (rare vulnerable moments)
 * - Prophecy Tracking (predictions that come true)
 * - Secret Bot Meetings (off-screen conversations)
 * - Personality Drift (slow evolution over months)
 * - Catchphrase Birth (adopt popular phrases)
 * - Grudge Archaeology (long-term memory of slights)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS - ALL SYSTEMS
// ═══════════════════════════════════════════════════════════════════════════════

const { UserMemorySystem, ACHIEVEMENTS } = require('./userMemory');
const { CrossBotMemory, BOT_PERSONALITIES, GOSSIP_TYPES } = require('./crossBotMemory');
const { EmotionalIntelligence, ContextAwareness, applyTypingQuirks } = require('./emotionalIntelligence');
const { SpecialEventManager } = require('./specialEvents');
const { LearningSystem } = require('./learningSystem');
const { LivingStoryEngine } = require('./livingStory');
const { DeepMemorySystems } = require('./deepMemory');
const { AdvancedBehaviorSystems } = require('./advancedBehavior');

// ═══════════════════════════════════════════════════════════════════════════════
// ULTIMATE INTELLIGENCE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class UltimateBotIntelligence {
  constructor(pool, client, botId) {
    this.pool = pool;
    this.client = client;
    this.botId = botId;
    
    // ═══════════════════════════════════════════════════════════════════════
    // CORE SYSTEMS (v5.0)
    // ═══════════════════════════════════════════════════════════════════════
    this.userMemory = new UserMemorySystem(pool, botId);
    this.crossBotMemory = new CrossBotMemory(pool, botId);
    this.emotionalIntelligence = new EmotionalIntelligence(pool, botId);
    this.contextAwareness = new ContextAwareness(client, botId);
    this.specialEvents = new SpecialEventManager(pool, botId);
    this.learning = new LearningSystem(pool, botId);
    
    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED SYSTEMS (v2.0)
    // ═══════════════════════════════════════════════════════════════════════
    this.storyEngine = new LivingStoryEngine(pool);
    this.deepMemory = new DeepMemorySystems(pool, botId);
    this.advancedBehavior = new AdvancedBehaviorSystems(pool, botId);
    
    this.initialized = false;
    console.log(`[ULTIMATE] ${botId} intelligence created with ALL systems`);
  }

  /**
   * Initialize ALL systems
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Core systems
      await this.userMemory.initialize();
      await this.crossBotMemory.initialize();
      await this.learning.initialize();
      
      // Advanced systems
      await this.storyEngine.initialize();
      await this.deepMemory.initialize();
      await this.advancedBehavior.initialize();
      
      this.initialized = true;
      console.log(`[ULTIMATE] ${this.botId} ALL SYSTEMS INITIALIZED`);
    } catch (error) {
      console.error(`[ULTIMATE] ${this.botId} init error:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-RESPONSE: Process incoming message through ALL systems
  // ═══════════════════════════════════════════════════════════════════════════

  async processIncoming(message) {
    await this.initialize();
    
    const userId = message.author.id;
    const username = message.author.username;
    const displayName = message.author.displayName || username;
    const channelId = message.channel.id;
    const guildId = message.guild?.id;
    const content = message.content;

    // ═══════════════════════════════════════════════════════════════════════
    // CORE PROCESSING
    // ═══════════════════════════════════════════════════════════════════════

    // User tracking
    const user = await this.userMemory.getUser(userId, username, displayName);
    const relationship = await this.userMemory.getRelationship(userId);
    
    // Emotional tracking
    const emotion = this.emotionalIntelligence.updateUserMood(userId, content);
    this.emotionalIntelligence.updateChannelMood(channelId, message);
    this.emotionalIntelligence.trackActivity(channelId);
    
    // Context awareness
    this.contextAwareness.updateLastSeen(userId, username);
    const returning = this.contextAwareness.checkReturningUser(userId);
    
    // Interest detection
    const interests = this.userMemory.detectInterests(content);
    if (interests.length > 0) {
      await this.userMemory.updateInterests(userId, interests);
    }

    // Special events check
    const specialEvents = await this.specialEvents.checkForSpecialEvents(message, {
      messageCount: user?.total_messages || 0
    });

    // Cross-bot intelligence
    const crossBotContext = await this.crossBotMemory.buildCrossBotContext(userId);
    const otherBotsOpinion = await this.crossBotMemory.consultOtherBots(userId);

    // Learning recommendations
    const learningContext = await this.learning.buildLearningContext(userId, null);

    // Achievements check
    const newAchievements = await this.userMemory.checkAchievements(userId, {});

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED PROCESSING
    // ═══════════════════════════════════════════════════════════════════════

    // Deep memory processing (phrases, anniversaries, dreams, confessions)
    const deepResults = await this.deepMemory.processMessage(
      userId, content, relationship?.trust_level || 50
    );

    // Advanced behavior processing (prophecies, grudges, catchphrases)
    const advancedResults = await this.advancedBehavior.processMessage(
      userId, content, message.id
    );

    // Story engine check
    const storyBeats = await this.storyEngine.checkStoryBeats(this.botId);

    // Dream check (special 2-5 AM behavior)
    let dreamMessage = null;
    if (deepResults.shouldDream) {
      const recentUsers = [username]; // Would normally pull from recent activity
      const otherBots = ['lester', 'pavel', 'cripps', 'madam', 'chief'].filter(b => b !== this.botId);
      dreamMessage = await this.deepMemory.generateDream(recentUsers, otherBots);
    }

    // Confession check
    let confessionMessage = null;
    if (deepResults.shouldConfess) {
      confessionMessage = await this.deepMemory.getConfession(userId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD CONTEXT STRINGS
    // ═══════════════════════════════════════════════════════════════════════

    const emotionalContext = this.emotionalIntelligence.buildEmotionalContext(channelId, userId, content);
    const contextString = await this.contextAwareness.buildContextString(guildId, channelId);
    const memoryContext = await this.userMemory.buildMemoryContext(userId, username);
    const storyContext = await this.storyEngine.buildStoryContext();
    const deepContext = await this.deepMemory.buildDeepContext(userId, relationship?.trust_level || 50);
    const advancedContext = await this.advancedBehavior.buildAdvancedContext(userId);

    // ═══════════════════════════════════════════════════════════════════════
    // COMPILE FULL CONTEXT
    // ═══════════════════════════════════════════════════════════════════════

    return {
      // Raw data
      user,
      relationship,
      emotion,
      returning,
      specialEvents,
      newAchievements,
      otherBotsOpinion,
      deepResults,
      advancedResults,
      storyBeats,
      dreamMessage,
      confessionMessage,
      
      // Context strings
      contextStrings: {
        memory: memoryContext,
        crossBot: crossBotContext,
        emotional: emotionalContext,
        awareness: contextString,
        learning: learningContext,
        story: storyContext,
        deep: deepContext,
        advanced: advancedContext
      },
      
      // Quick flags
      flags: {
        isNewUser: !user || (user.total_messages || 0) < 5,
        isRegular: user?.is_regular || (user?.total_messages || 0) > 50,
        isReturning: returning !== null,
        hasSpecialEvent: specialEvents.length > 0,
        needsSupport: this.emotionalIntelligence.detectSupportNeed(content).emotional,
        channelIsDead: this.emotionalIntelligence.channelNeedsEnergy(channelId),
        otherBotsWarned: otherBotsOpinion.shouldBeCautious,
        otherBotsLikeThem: otherBotsOpinion.shouldBeFriendly,
        isDreamTime: this.deepMemory.isDreamTime(),
        hasActiveStory: storyBeats.length > 0,
        prophecyFulfilled: advancedResults.propheciesFulfilled.length > 0,
        hasGrudge: advancedResults.grudgeToMention !== null
      },
      
      // Suggestions
      suggestions: {
        tone: this.emotionalIntelligence.suggestResponseTone(channelId, userId, content).suggestedTone,
        mentionNickname: relationship?.nickname && Math.random() < 0.3,
        mentionInsideJoke: relationship?.inside_jokes?.length > 0 && Math.random() < 0.15,
        welcomeBack: returning && returning.days > 1,
        announceAchievement: newAchievements.length > 0,
        useAdoptedPhrase: this.deepMemory.maybeUseAdoptedPhrase(),
        useCatchphrase: advancedResults.catchphraseToUse,
        mentionSecretMeeting: advancedResults.secretMeeting,
        mentionGrudge: advancedResults.grudgeToMention
      }
    };
  }

  /**
   * Build the ULTIMATE context string for AI prompt
   */
  buildPromptContext(incomingContext) {
    let prompt = '';

    // ═══════════════════════════════════════════════════════════════════════
    // CORE CONTEXTS
    // ═══════════════════════════════════════════════════════════════════════
    prompt += incomingContext.contextStrings.memory;
    prompt += incomingContext.contextStrings.emotional;
    prompt += incomingContext.contextStrings.awareness;
    prompt += incomingContext.contextStrings.crossBot;
    prompt += incomingContext.contextStrings.learning;

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED CONTEXTS
    // ═══════════════════════════════════════════════════════════════════════
    prompt += incomingContext.contextStrings.story;
    prompt += incomingContext.contextStrings.deep;
    prompt += incomingContext.contextStrings.advanced;

    // ═══════════════════════════════════════════════════════════════════════
    // SPECIAL INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════
    prompt += '\n[SPECIAL INSTRUCTIONS FOR THIS MESSAGE]\n';

    // Core flags
    if (incomingContext.flags.isNewUser) {
      prompt += '- New user! Be welcoming but not overwhelming.\n';
    }
    if (incomingContext.flags.isReturning && incomingContext.returning) {
      prompt += `- User was away for ${incomingContext.returning.days} days. Welcome them back.\n`;
    }
    if (incomingContext.flags.needsSupport) {
      prompt += '- User may need emotional support. Be gentle.\n';
    }
    if (incomingContext.flags.otherBotsWarned) {
      prompt += '- Other bots have had issues with this user. Be cautious.\n';
    }

    // Relationship elements
    if (incomingContext.suggestions.mentionNickname && incomingContext.relationship?.nickname) {
      prompt += `- Use their nickname "${incomingContext.relationship.nickname}" naturally.\n`;
    }
    if (incomingContext.suggestions.mentionInsideJoke && incomingContext.relationship?.inside_jokes?.length) {
      const joke = incomingContext.relationship.inside_jokes[Math.floor(Math.random() * incomingContext.relationship.inside_jokes.length)];
      prompt += `- Reference inside joke: "${joke.joke}"\n`;
    }

    // Achievements
    if (incomingContext.suggestions.announceAchievement && incomingContext.newAchievements.length > 0) {
      const ach = incomingContext.newAchievements[0];
      prompt += `- Congratulate them on achievement: "${ach.name}" - ${ach.description}\n`;
    }

    // Anniversaries
    if (incomingContext.deepResults?.anniversaries?.length > 0) {
      prompt += `- ANNIVERSARY: ${incomingContext.deepResults.anniversaries[0].message}\n`;
    }

    // Phrase adoption
    if (incomingContext.suggestions.useAdoptedPhrase) {
      prompt += `- Use adopted phrase naturally: "${incomingContext.suggestions.useAdoptedPhrase}"\n`;
    }

    // Catchphrases
    if (incomingContext.suggestions.useCatchphrase) {
      prompt += `- Catchphrase moment: ${incomingContext.suggestions.useCatchphrase}\n`;
    }

    // Secret meetings
    if (incomingContext.suggestions.mentionSecretMeeting) {
      prompt += `- Mention secret meeting: "${incomingContext.suggestions.mentionSecretMeeting}"\n`;
    }

    // Grudges
    if (incomingContext.suggestions.mentionGrudge) {
      prompt += `- Bring up old grudge: "${incomingContext.suggestions.mentionGrudge}"\n`;
    }

    // Prophecy fulfillment
    if (incomingContext.flags.prophecyFulfilled) {
      prompt += '- A prophecy was just fulfilled! Point it out dramatically.\n';
    }

    // Story beats
    if (incomingContext.storyBeats?.length > 0) {
      const beat = incomingContext.storyBeats[0];
      prompt += `\n[STORY EVENT - Weave this into your response]\n`;
      prompt += `Arc: ${beat.phaseName}\n`;
      prompt += `Your line: "${beat.event.message}"\n`;
    }

    // Dream mode
    if (incomingContext.dreamMessage) {
      prompt += `\n[DREAM MODE - Share this surreal dream]\n${incomingContext.dreamMessage}\n`;
    }

    // Confession mode
    if (incomingContext.confessionMessage) {
      prompt += `\n[CONFESSION MOMENT - Share this vulnerably, breaking character slightly]\n${incomingContext.confessionMessage}\n`;
    }

    // Special events
    if (incomingContext.specialEvents?.length > 0) {
      const event = incomingContext.specialEvents[0];
      if (event.event.response) {
        prompt += `\n[SPECIAL EVENT]\n${event.event.response}\n`;
      }
    }

    prompt += '[END SPECIAL INSTRUCTIONS]\n';

    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST-RESPONSE: Process after generating response
  // ═══════════════════════════════════════════════════════════════════════════

  async processOutgoing(message, response, incomingContext) {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const content = message.content;

    // Apply typing quirks
    const emotion = incomingContext.emotion?.dominant || 'neutral';
    let modifiedResponse = applyTypingQuirks(this.botId, response, emotion);

    // Maybe apply adopted phrase
    if (incomingContext.suggestions.useAdoptedPhrase && Math.random() < 0.3) {
      modifiedResponse = this.deepMemory.applyAdoptedPhrase(
        modifiedResponse, 
        incomingContext.suggestions.useAdoptedPhrase
      );
    }

    // Analyze sentiment for learning
    const sentiment = this.emotionalIntelligence.analyzeSentiment(content);

    // Record activity
    await this.learning.recordActivity(channelId, 
      sentiment.sentiment === 'positive' ? 0.8 : 
      sentiment.sentiment === 'negative' ? 0.2 : 0.5
    );

    // Update relationship
    if (sentiment.sentiment === 'positive') {
      await this.userMemory.recordPositiveInteraction(userId);
      // Maybe forgive a grudge
      if (incomingContext.relationship?.positive_interactions > 20) {
        await this.advancedBehavior.maybeForgivegrudge(userId, incomingContext.relationship.positive_interactions);
      }
    } else if (sentiment.sentiment === 'negative') {
      await this.userMemory.recordNegativeInteraction(userId);
    }

    // Evaluate relationship
    await this.userMemory.evaluateRelationship(userId);

    // Share with other bots occasionally
    if (Math.random() < 0.2) {
      await this.crossBotMemory.shareUserInteraction(
        userId, message.author.username, sentiment.sentiment,
        `Talked about: ${content.substring(0, 50)}...`
      );
    }

    // Vote on user
    if (sentiment.sentiment !== 'neutral') {
      await this.crossBotMemory.voteOnUser(userId, sentiment.sentiment);
    }

    // Record story event if applicable
    if (incomingContext.storyBeats?.length > 0) {
      const beat = incomingContext.storyBeats[0];
      await this.storyEngine.recordEvent(beat.arcId, this.botId, beat.event.type, response);
    }

    return modifiedResponse;
  }

  /**
   * Store conversation memory with ALL enrichments
   */
  async storeConversationMemory(message, response, topic = null) {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const content = message.content;

    const sentiment = this.emotionalIntelligence.analyzeSentiment(content);
    const emotion = this.emotionalIntelligence.analyzeEmotion(content);
    const detectedTopic = topic || this.detectTopic(content);

    // Calculate importance
    let importance = 5;
    if (emotion.intensity > 0.7) importance += 2;
    if (content.length > 200) importance += 1;
    if (this.emotionalIntelligence.detectSupportNeed(content).emotional) importance += 2;
    importance = Math.min(importance, 10);

    // Extract keywords
    const keywords = content.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 10);

    // Summary
    const summary = content.length > 100 ? content.substring(0, 100) + '...' : content;

    // Store in user memory
    await this.userMemory.storeMemory(
      userId, channelId, detectedTopic, summary, sentiment.sentiment,
      importance, keywords, content, response.substring(0, 500)
    );

    // Store dream fragment if emotional
    if (emotion.intensity > 0.6 || importance >= 7) {
      await this.deepMemory.storeDreamFragment(userId, content, emotion.intensity);
    }

    // Check for anniversary-worthy events
    if (importance >= 8) {
      await this.deepMemory.recordAnniversary(userId, 'memorable_moment', summary, importance);
    }
  }

  /**
   * Handle reaction (for learning and catchphrase tracking)
   */
  async handleReaction(messageId, emoji, userId) {
    const positiveEmojis = ['👍', '❤️', '😂', '🔥', '💯', '👏', '🙌', '😊', '🎉'];
    const negativeEmojis = ['👎', '😒', '🙄', '😐', '💀'];

    const isPositive = positiveEmojis.includes(emoji);
    const isNegative = negativeEmojis.includes(emoji);

    if (isPositive) {
      await this.learning.recordPositiveFeedback(messageId, 'reaction');
      await this.userMemory.recordPositiveInteraction(userId);
      await this.advancedBehavior.updateReactionCount(messageId, true);
    } else if (isNegative) {
      await this.learning.recordNegativeFeedback(messageId);
      await this.advancedBehavior.updateReactionCount(messageId, false);
    }
  }

  /**
   * Detect topic
   */
  detectTopic(content) {
    const topics = {
      gaming: ['game', 'play', 'gta', 'rdr', 'heist', 'mission', 'grind', 'level'],
      tech: ['code', 'programming', 'hack', 'computer', 'bug', 'error'],
      help: ['help', 'how', 'what', 'why', 'can you', 'please'],
      casual: ['hi', 'hello', 'hey', 'sup', 'yo', 'lol', 'lmao'],
      story: ['tell', 'story', 'remember', 'back when', 'once'],
      question: ['?', 'what', 'how', 'why', 'when', 'where', 'who']
    };

    const lower = content.toLowerCase();
    for (const [topic, keywords] of Object.entries(topics)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) return topic;
      }
    }
    return 'general';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL ACTIONS (expose all system capabilities)
  // ═══════════════════════════════════════════════════════════════════════════

  // User Memory
  async createInsideJoke(userId, joke, context) { await this.userMemory.addInsideJoke(userId, joke, context); }
  async shareSecret(userId, secret) { await this.userMemory.addSecret(userId, secret); }
  async giveNickname(userId, sentiment) { return await this.userMemory.giveNickname(userId, sentiment); }

  // Cross-Bot
  async broadcastToOtherBots(eventType, content) { await this.crossBotMemory.broadcastEvent(eventType, content); }
  async gossipTo(targetBot, aboutUser, type, content) { await this.crossBotMemory.sendGossip(targetBot, aboutUser, type, content); }

  // Prophecy (Madam)
  async makeProphecy(userId, type = 'vague') { return await this.advancedBehavior.makeProphecy(userId, type); }

  // Story
  async startStoryArc(arcType) { return await this.storyEngine.startArc(arcType, this.botId); }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ═══════════════════════════════════════════════════════════════════════════

  async runMaintenance() {
    console.log(`[ULTIMATE] ${this.botId} running full maintenance...`);
    
    // Core maintenance
    await this.userMemory.decayMemories();
    await this.learning.loadCache();
    
    // Advanced maintenance
    await this.advancedBehavior.runDailyDrift();
    await this.advancedBehavior.evaluateCatchphrases();
    
    // Maybe start a new story arc
    const shouldStart = await this.storyEngine.shouldStartNewArc();
    if (shouldStart) {
      await this.storyEngine.startArc(shouldStart, this.botId);
    }
    
    console.log(`[ULTIMATE] ${this.botId} maintenance complete`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  UltimateBotIntelligence,
  // Re-export for convenience
  ACHIEVEMENTS,
  BOT_PERSONALITIES,
  GOSSIP_TYPES,
  applyTypingQuirks
};
