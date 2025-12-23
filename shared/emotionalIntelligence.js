/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMOTIONAL INTELLIGENCE & CONTEXT AWARENESS SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This system gives bots EMOTIONAL INTELLIGENCE:
 * - Detect chat mood (happy, sad, frustrated, excited, bored)
 * - Sense tension or conflict
 * - Recognize when someone needs support
 * - Adapt response tone to match/improve mood
 * - Track emotional patterns over time
 * 
 * CONTEXT AWARENESS:
 * - Server activity levels
 * - Time-based behavior
 * - Voice channel awareness
 * - Recent channel topics
 * - User absence detection
 * - Event awareness (new members, role changes)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EMOTION DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const EMOTION_PATTERNS = {
  happy: {
    keywords: ['lol', 'lmao', 'haha', 'nice', 'awesome', 'great', 'love', 'amazing', 'perfect', 'yes', 'yay', 'woo', 'lets go', 'poggers', 'pog', 'w', 'dub'],
    emojis: ['😂', '🤣', '😊', '😄', '🎉', '🔥', '💯', '😁', '🙌', '❤️', '💪', '👏'],
    patterns: [/!+$/, /\bw+\b/i, /\bgg\b/i]
  },
  sad: {
    keywords: ['sad', 'depressed', 'upset', 'crying', 'miss', 'lonely', 'hurt', 'disappointed', 'sucks', 'terrible', 'awful', 'worst'],
    emojis: ['😢', '😭', '😔', '💔', '😞', '🥺', '😿'],
    patterns: [/\.\.\.+/, /;-;/, /:\(/]
  },
  angry: {
    keywords: ['angry', 'mad', 'furious', 'hate', 'annoyed', 'pissed', 'stupid', 'dumb', 'trash', 'garbage', 'bullshit', 'wtf', 'fuck'],
    emojis: ['😠', '😡', '🤬', '💢', '👿'],
    patterns: [/!{2,}/, /\bffs\b/i, /caps lock sentences/]
  },
  frustrated: {
    keywords: ['frustrated', 'stuck', 'cant', 'won\'t work', 'broken', 'bug', 'error', 'crash', 'lag', 'why', 'help', 'ugh', 'bruh'],
    emojis: ['😤', '😩', '🙄', '😫', '💀'],
    patterns: [/\?{2,}/, /why (won't|doesn't|isn't|can't)/i]
  },
  excited: {
    keywords: ['excited', 'hype', 'hyped', 'can\'t wait', 'finally', 'omg', 'holy', 'insane', 'crazy', 'epic', 'legendary'],
    emojis: ['🤩', '😱', '🥳', '🎊', '⚡', '🚀'],
    patterns: [/!{3,}/, /all caps/]
  },
  bored: {
    keywords: ['bored', 'boring', 'nothing', 'dead', 'slow', 'meh', 'whatever', 'idk', 'eh'],
    emojis: ['😐', '😑', '🥱', '😴'],
    patterns: [/^\.+$/, /^\s*\.\s*$/]
  },
  anxious: {
    keywords: ['worried', 'nervous', 'anxious', 'scared', 'afraid', 'hope', 'hopefully', 'fingers crossed', 'pray'],
    emojis: ['😰', '😨', '😟', '🤞', '🙏'],
    patterns: [/\?\s*\?/, /idk\s*(if|what)/i]
  },
  sarcastic: {
    keywords: ['sure', 'totally', 'definitely', 'obviously', 'wow', 'great', 'thanks'],
    emojis: ['🙃', '😏', '🤡'],
    patterns: [/suuure/i, /riiight/i, /yeahhh/i]
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SENTIMENT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

const SENTIMENT_WORDS = {
  positive: [
    'good', 'great', 'awesome', 'amazing', 'excellent', 'perfect', 'love', 'like',
    'best', 'wonderful', 'fantastic', 'brilliant', 'cool', 'nice', 'thanks',
    'thank', 'appreciate', 'happy', 'glad', 'excited', 'fun', 'enjoy', 'beautiful',
    'helpful', 'kind', 'friendly', 'sweet', 'lovely', 'incredible', 'outstanding'
  ],
  negative: [
    'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'dislike', 'annoying',
    'stupid', 'dumb', 'broken', 'sucks', 'useless', 'trash', 'garbage', 'ugly',
    'boring', 'frustrating', 'angry', 'sad', 'disappointed', 'fail', 'wrong',
    'problem', 'issue', 'error', 'bug', 'crash', 'laggy', 'slow', 'unfair'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPORT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const SUPPORT_INDICATORS = {
  needsHelp: [
    'help', 'stuck', 'can\'t', 'won\'t', 'doesn\'t work', 'how do', 'how to',
    'anyone know', 'please', 'need', 'issue', 'problem'
  ],
  needsSupport: [
    'feeling', 'stressed', 'overwhelmed', 'tired', 'exhausted', 'done',
    'give up', 'can\'t anymore', 'not okay', 'bad day', 'rough'
  ],
  celebratory: [
    'finally', 'did it', 'made it', 'finished', 'completed', 'won', 'beat',
    'got it', 'success', 'achieved', 'unlocked'
  ],
  venting: [
    'rant', 'vent', 'just need to', 'let me just', 'so sick of', 'tired of',
    'can\'t believe', 'ridiculous'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// EMOTIONAL INTELLIGENCE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class EmotionalIntelligence {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.channelMoods = new Map();      // Track mood per channel
    this.userMoods = new Map();          // Track mood per user
    this.recentMessages = new Map();     // Recent messages per channel
    this.activityLevels = new Map();     // Activity per channel
  }

  /**
   * Analyze emotion in a message
   */
  analyzeEmotion(content) {
    const lowerContent = content.toLowerCase();
    const scores = {};

    for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
      let score = 0;

      // Check keywords
      for (const keyword of patterns.keywords) {
        if (lowerContent.includes(keyword)) {
          score += 2;
        }
      }

      // Check emojis
      for (const emoji of patterns.emojis) {
        if (content.includes(emoji)) {
          score += 3;
        }
      }

      // Check patterns
      for (const pattern of patterns.patterns) {
        if (pattern.test(content)) {
          score += 2;
        }
      }

      if (score > 0) {
        scores[emotion] = score;
      }
    }

    // Find dominant emotion
    let dominant = 'neutral';
    let maxScore = 0;
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emotion;
      }
    }

    return {
      dominant,
      scores,
      intensity: Math.min(maxScore / 10, 1) // 0-1 intensity
    };
  }

  /**
   * Analyze overall sentiment
   */
  analyzeSentiment(content) {
    const words = content.toLowerCase().split(/\s+/);
    let positive = 0;
    let negative = 0;

    for (const word of words) {
      if (SENTIMENT_WORDS.positive.includes(word)) positive++;
      if (SENTIMENT_WORDS.negative.includes(word)) negative++;
    }

    const total = positive + negative;
    if (total === 0) return { sentiment: 'neutral', score: 0 };

    const score = (positive - negative) / total;
    const sentiment = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    return { sentiment, score, positive, negative };
  }

  /**
   * Detect if user needs support
   */
  detectSupportNeed(content) {
    const lowerContent = content.toLowerCase();
    const needs = {
      help: false,
      emotional: false,
      celebration: false,
      venting: false
    };

    for (const indicator of SUPPORT_INDICATORS.needsHelp) {
      if (lowerContent.includes(indicator)) {
        needs.help = true;
        break;
      }
    }

    for (const indicator of SUPPORT_INDICATORS.needsSupport) {
      if (lowerContent.includes(indicator)) {
        needs.emotional = true;
        break;
      }
    }

    for (const indicator of SUPPORT_INDICATORS.celebratory) {
      if (lowerContent.includes(indicator)) {
        needs.celebration = true;
        break;
      }
    }

    for (const indicator of SUPPORT_INDICATORS.venting) {
      if (lowerContent.includes(indicator)) {
        needs.venting = true;
        break;
      }
    }

    return needs;
  }

  /**
   * Update channel mood based on recent messages
   */
  updateChannelMood(channelId, message) {
    // Get or create channel history
    let history = this.recentMessages.get(channelId) || [];
    
    // Add new message emotion
    const emotion = this.analyzeEmotion(message.content);
    history.push({
      emotion: emotion.dominant,
      intensity: emotion.intensity,
      timestamp: Date.now(),
      userId: message.author.id
    });

    // Keep only last 20 messages (last ~5 minutes worth)
    while (history.length > 20) history.shift();
    this.recentMessages.set(channelId, history);

    // Calculate overall mood
    const moodCounts = {};
    let totalIntensity = 0;
    for (const msg of history) {
      moodCounts[msg.emotion] = (moodCounts[msg.emotion] || 0) + 1;
      totalIntensity += msg.intensity;
    }

    // Find dominant mood
    let dominantMood = 'neutral';
    let maxCount = 0;
    for (const [mood, count] of Object.entries(moodCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantMood = mood;
      }
    }

    const avgIntensity = totalIntensity / history.length;

    this.channelMoods.set(channelId, {
      mood: dominantMood,
      intensity: avgIntensity,
      lastUpdate: Date.now()
    });

    return { mood: dominantMood, intensity: avgIntensity };
  }

  /**
   * Get channel mood
   */
  getChannelMood(channelId) {
    const mood = this.channelMoods.get(channelId);
    if (!mood || Date.now() - mood.lastUpdate > 10 * 60 * 1000) {
      return { mood: 'neutral', intensity: 0 };
    }
    return mood;
  }

  /**
   * Update user mood
   */
  updateUserMood(userId, content) {
    const emotion = this.analyzeEmotion(content);
    const sentiment = this.analyzeSentiment(content);

    let userHistory = this.userMoods.get(userId) || {
      recentEmotions: [],
      overallSentiment: 0,
      lastSeen: null
    };

    userHistory.recentEmotions.push({
      emotion: emotion.dominant,
      intensity: emotion.intensity,
      timestamp: Date.now()
    });

    // Keep last 10
    while (userHistory.recentEmotions.length > 10) {
      userHistory.recentEmotions.shift();
    }

    // Update overall sentiment (rolling average)
    userHistory.overallSentiment = 
      userHistory.overallSentiment * 0.7 + sentiment.score * 0.3;

    userHistory.lastSeen = Date.now();
    this.userMoods.set(userId, userHistory);

    return emotion;
  }

  /**
   * Get user mood
   */
  getUserMood(userId) {
    return this.userMoods.get(userId) || null;
  }

  /**
   * Suggest response tone based on context
   */
  suggestResponseTone(channelId, userId, content) {
    const emotion = this.analyzeEmotion(content);
    const sentiment = this.analyzeSentiment(content);
    const supportNeed = this.detectSupportNeed(content);
    const channelMood = this.getChannelMood(channelId);
    const userMood = this.getUserMood(userId);

    let suggestedTone = 'normal';
    let notes = [];

    // Immediate emotional responses
    if (supportNeed.emotional) {
      suggestedTone = 'supportive';
      notes.push('User may need emotional support');
    } else if (supportNeed.celebration) {
      suggestedTone = 'celebratory';
      notes.push('User is celebrating something');
    } else if (supportNeed.venting) {
      suggestedTone = 'understanding';
      notes.push('User is venting, be understanding');
    } else if (supportNeed.help) {
      suggestedTone = 'helpful';
      notes.push('User needs help');
    }

    // Emotion-based adjustments
    if (emotion.dominant === 'sad' && emotion.intensity > 0.5) {
      suggestedTone = 'gentle';
      notes.push('User seems sad');
    } else if (emotion.dominant === 'angry' && emotion.intensity > 0.5) {
      suggestedTone = 'calm';
      notes.push('User seems angry, stay calm');
    } else if (emotion.dominant === 'frustrated') {
      suggestedTone = 'patient';
      notes.push('User is frustrated');
    } else if (emotion.dominant === 'excited') {
      suggestedTone = 'enthusiastic';
      notes.push('User is excited, match energy');
    } else if (emotion.dominant === 'happy') {
      suggestedTone = 'cheerful';
      notes.push('Positive vibes');
    } else if (emotion.dominant === 'bored') {
      suggestedTone = 'engaging';
      notes.push('Try to be more engaging');
    }

    // Channel mood influence
    if (channelMood.mood === 'happy' && channelMood.intensity > 0.5) {
      notes.push('Channel is in a good mood');
    } else if (channelMood.mood === 'angry' || channelMood.mood === 'frustrated') {
      notes.push('Channel mood is tense');
    }

    return {
      suggestedTone,
      emotion,
      sentiment,
      supportNeed,
      channelMood,
      notes
    };
  }

  /**
   * Track channel activity
   */
  trackActivity(channelId) {
    let activity = this.activityLevels.get(channelId) || {
      messagesLastHour: 0,
      messagesLastMinute: 0,
      lastMessage: null,
      timestamps: []
    };

    const now = Date.now();
    activity.timestamps.push(now);
    activity.lastMessage = now;

    // Clean old timestamps
    activity.timestamps = activity.timestamps.filter(t => now - t < 60 * 60 * 1000);
    
    activity.messagesLastHour = activity.timestamps.length;
    activity.messagesLastMinute = activity.timestamps.filter(t => now - t < 60 * 1000).length;

    this.activityLevels.set(channelId, activity);

    return activity;
  }

  /**
   * Get activity level description
   */
  getActivityLevel(channelId) {
    const activity = this.activityLevels.get(channelId);
    if (!activity) return 'unknown';

    if (activity.messagesLastMinute > 10) return 'very_active';
    if (activity.messagesLastMinute > 5) return 'active';
    if (activity.messagesLastHour > 30) return 'moderate';
    if (activity.messagesLastHour > 10) return 'slow';
    return 'dead';
  }

  /**
   * Detect if channel needs energy
   */
  channelNeedsEnergy(channelId) {
    const activity = this.activityLevels.get(channelId);
    if (!activity) return false;

    const timeSinceLastMessage = Date.now() - (activity.lastMessage || 0);
    
    // Dead for more than 10 minutes
    if (timeSinceLastMessage > 10 * 60 * 1000) return true;
    
    // Very slow activity
    if (activity.messagesLastHour < 5) return true;

    return false;
  }

  /**
   * Build emotional context for AI prompt
   */
  buildEmotionalContext(channelId, userId, content) {
    const analysis = this.suggestResponseTone(channelId, userId, content);
    
    let context = '\n[EMOTIONAL CONTEXT]\n';
    
    context += `User emotion: ${analysis.emotion.dominant}`;
    if (analysis.emotion.intensity > 0.5) {
      context += ` (strong)`;
    }
    context += '\n';

    context += `Sentiment: ${analysis.sentiment.sentiment}\n`;

    if (analysis.notes.length > 0) {
      context += `Notes: ${analysis.notes.join(', ')}\n`;
    }

    context += `Suggested tone: ${analysis.suggestedTone}\n`;

    const activityLevel = this.getActivityLevel(channelId);
    context += `Channel activity: ${activityLevel}\n`;

    context += '[END EMOTIONAL CONTEXT]\n';
    
    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT AWARENESS CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ContextAwareness {
  constructor(client, botId) {
    this.client = client;
    this.botId = botId;
    this.voiceStates = new Map();
    this.recentEvents = [];
    this.userAbsences = new Map();
    this.lastSeenUsers = new Map();
  }

  /**
   * Get current time context
   */
  getTimeContext() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday
    const isWeekend = day === 0 || day === 6;

    let timeOfDay;
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    let activity;
    if (hour >= 2 && hour < 6) activity = 'dead_hours';
    else if (hour >= 18 && hour < 23) activity = 'peak_hours';
    else if (isWeekend) activity = 'weekend';
    else activity = 'normal';

    return {
      hour,
      timeOfDay,
      isWeekend,
      activity,
      isLateNight: hour >= 0 && hour < 5,
      timestamp: now.toISOString()
    };
  }

  /**
   * Track voice channel activity
   */
  updateVoiceState(guildId, voiceState) {
    if (!voiceState.channel) {
      this.voiceStates.delete(voiceState.member.id);
    } else {
      this.voiceStates.set(voiceState.member.id, {
        channelId: voiceState.channel.id,
        channelName: voiceState.channel.name,
        guildId,
        since: Date.now()
      });
    }
  }

  /**
   * Get who's in voice
   */
  getVoiceUsers(guildId) {
    const users = [];
    for (const [userId, state] of this.voiceStates) {
      if (state.guildId === guildId) {
        users.push({ userId, ...state });
      }
    }
    return users;
  }

  /**
   * Track events
   */
  recordEvent(eventType, data) {
    this.recentEvents.push({
      type: eventType,
      data,
      timestamp: Date.now()
    });

    // Keep last 50 events
    while (this.recentEvents.length > 50) {
      this.recentEvents.shift();
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(maxAge = 60 * 60 * 1000) { // Last hour
    const cutoff = Date.now() - maxAge;
    return this.recentEvents.filter(e => e.timestamp > cutoff);
  }

  /**
   * Track user last seen
   */
  updateLastSeen(userId, username) {
    const prev = this.lastSeenUsers.get(userId);
    this.lastSeenUsers.set(userId, {
      username,
      lastSeen: Date.now(),
      previousLastSeen: prev?.lastSeen
    });
  }

  /**
   * Check for returning users (been gone for a while)
   */
  checkReturningUser(userId) {
    const user = this.lastSeenUsers.get(userId);
    if (!user || !user.previousLastSeen) return null;

    const absence = user.lastSeen - user.previousLastSeen;
    
    // Gone for more than 24 hours
    if (absence > 24 * 60 * 60 * 1000) {
      const days = Math.floor(absence / (24 * 60 * 60 * 1000));
      return { days, wasGone: true };
    }

    return null;
  }

  /**
   * Get server stats
   */
  async getServerStats(guildId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return null;

      const online = guild.members.cache.filter(m => 
        m.presence?.status !== 'offline'
      ).size;

      return {
        totalMembers: guild.memberCount,
        onlineMembers: online,
        voiceUsers: this.getVoiceUsers(guildId).length,
        boostLevel: guild.premiumTier,
        boostCount: guild.premiumSubscriptionCount
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build context awareness string
   */
  async buildContextString(guildId, channelId) {
    let context = '\n[CONTEXT AWARENESS]\n';

    // Time context
    const time = this.getTimeContext();
    context += `Time: ${time.timeOfDay} (${time.hour}:00)\n`;
    if (time.isLateNight) context += 'Note: It\'s late night, be chill\n';
    if (time.isWeekend) context += 'Note: It\'s the weekend\n';

    // Server stats
    const stats = await this.getServerStats(guildId);
    if (stats) {
      context += `Server: ${stats.onlineMembers} online, ${stats.voiceUsers} in voice\n`;
    }

    // Voice users
    const voiceUsers = this.getVoiceUsers(guildId);
    if (voiceUsers.length > 0) {
      context += `In voice: ${voiceUsers.length} users\n`;
    }

    // Recent events
    const events = this.getRecentEvents(30 * 60 * 1000); // Last 30 mins
    if (events.length > 0) {
      const eventTypes = [...new Set(events.map(e => e.type))];
      context += `Recent activity: ${eventTypes.join(', ')}\n`;
    }

    context += '[END CONTEXT AWARENESS]\n';
    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING QUIRKS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const TYPING_QUIRKS = {
  lester: {
    // Lester makes typos when frustrated, types fast
    typoChance: 0.15,
    capsWhenAngry: true,
    commonTypos: {
      'the': ['teh', 'hte'],
      'you': ['yuo', 'yu'],
      'just': ['jsut', 'juts'],
      'with': ['wiht', 'wtih'],
      'what': ['waht', 'wht']
    },
    frustrationIndicators: ['ugh', 'ffs', 'god', 'seriously'],
    typingSpeed: 'fast',
    punctuationStyle: 'minimal' // Doesn't bother with periods
  },
  pavel: {
    // Pavel has Russian-influenced patterns
    typoChance: 0.05,
    accentPatterns: {
      'the': ['ze', 'the'],
      'this': ['zis', 'this'],
      'think': ['zink', 'think'],
      'yes': ['da', 'yes'],
      'no': ['nyet', 'no'],
      'friend': ['friend', 'comrade'],
      'my': ['my', 'my dear']
    },
    addedPhrases: ['da?', 'yes?', 'is good', 'how you say'],
    typingSpeed: 'medium',
    punctuationStyle: 'proper'
  },
  cripps: {
    // Cripps rambles, old-timey speech
    typoChance: 0.02,
    oldTimeyReplacements: {
      'yes': ['yessir', 'that\'s right'],
      'no': ['nope', 'no siree'],
      'you': ['ya', 'you'],
      'going to': ['gonna', 'fixin\' to'],
      'want to': ['wanna', 'care to']
    },
    rambleChance: 0.3, // Chance to add tangent
    tangents: [
      'reminds me of the time',
      'speaking of which',
      'now that I think about it',
      'you know what'
    ],
    typingSpeed: 'slow',
    punctuationStyle: 'excessive' // Uses ... a lot
  },
  madam: {
    // Madam is cryptic, mystical speech
    typoChance: 0.01,
    mysticalReplacements: {
      'I see': ['the spirits reveal', 'I sense'],
      'you will': ['fate decrees you shall', 'destiny shows'],
      'maybe': ['the mists are unclear', 'perhaps the stars know'],
      'yes': ['it is written', 'the cards confirm'],
      'no': ['the spirits say otherwise', 'fate forbids']
    },
    addedMysticism: ['...', '*gazes into crystal ball*', 'the spirits whisper'],
    typingSpeed: 'slow',
    punctuationStyle: 'dramatic' // Lots of ...
  },
  chief: {
    // Chief is curt, uses police lingo occasionally
    typoChance: 0.02,
    policeLingo: {
      'suspect': ['perp', 'suspect'],
      'understood': ['10-4', 'copy that', 'understood'],
      'okay': ['affirmative', 'okay'],
      'no': ['negative', 'no'],
      'be careful': ['watch your six', 'stay frosty']
    },
    curtness: true, // Tends to be brief
    typingSpeed: 'medium',
    punctuationStyle: 'minimal'
  }
};

/**
 * Apply typing quirks to a message
 */
function applyTypingQuirks(botId, message, emotionalState = 'neutral') {
  const quirks = TYPING_QUIRKS[botId];
  if (!quirks) return message;

  let modified = message;

  // Apply typos based on emotional state
  let typoChance = quirks.typoChance;
  if (emotionalState === 'frustrated' || emotionalState === 'angry') {
    typoChance *= 2;
  }

  // Random typos
  if (quirks.commonTypos && Math.random() < typoChance) {
    for (const [word, replacements] of Object.entries(quirks.commonTypos)) {
      if (modified.toLowerCase().includes(word) && Math.random() < 0.5) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        modified = modified.replace(new RegExp(`\\b${word}\\b`, 'i'), replacement);
        break; // Only one typo per message
      }
    }
  }

  // Caps when angry (Lester)
  if (quirks.capsWhenAngry && emotionalState === 'angry' && Math.random() < 0.3) {
    // Capitalize random words
    const words = modified.split(' ');
    const idx = Math.floor(Math.random() * words.length);
    words[idx] = words[idx].toUpperCase();
    modified = words.join(' ');
  }

  // Accent patterns (Pavel)
  if (quirks.accentPatterns && Math.random() < 0.3) {
    for (const [word, replacements] of Object.entries(quirks.accentPatterns)) {
      if (modified.toLowerCase().includes(word)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        modified = modified.replace(new RegExp(`\\b${word}\\b`, 'i'), replacement);
        break;
      }
    }
  }

  // Old-timey replacements (Cripps)
  if (quirks.oldTimeyReplacements && Math.random() < 0.3) {
    for (const [phrase, replacements] of Object.entries(quirks.oldTimeyReplacements)) {
      if (modified.toLowerCase().includes(phrase)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        modified = modified.replace(new RegExp(phrase, 'i'), replacement);
      }
    }
  }

  // Mystical replacements (Madam)
  if (quirks.mysticalReplacements && Math.random() < 0.4) {
    for (const [phrase, replacements] of Object.entries(quirks.mysticalReplacements)) {
      if (modified.toLowerCase().includes(phrase)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        modified = modified.replace(new RegExp(phrase, 'i'), replacement);
        break;
      }
    }
  }

  // Police lingo (Chief)
  if (quirks.policeLingo && Math.random() < 0.25) {
    for (const [word, replacements] of Object.entries(quirks.policeLingo)) {
      if (modified.toLowerCase().includes(word)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        modified = modified.replace(new RegExp(`\\b${word}\\b`, 'i'), replacement);
        break;
      }
    }
  }

  return modified;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  EmotionalIntelligence,
  ContextAwareness,
  EMOTION_PATTERNS,
  SENTIMENT_WORDS,
  SUPPORT_INDICATORS,
  TYPING_QUIRKS,
  applyTypingQuirks
};
