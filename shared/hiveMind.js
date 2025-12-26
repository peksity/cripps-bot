/**
 * HIVEMIND - Shared Intelligence System for The Unpatched Method Bots
 * 
 * This module provides:
 * - Redis: Real-time coordination between bots (who spoke, cooldowns, moods)
 * - Pinecone: Long-term memory (user history, events, relationships)
 * 
 * All 5 bots share this single brain.
 */

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST = process.env.PINECONE_HOST;

// ============================================
// REDIS HELPER FUNCTIONS
// ============================================

async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) {
    console.error('[HIVEMIND] Redis GET error:', e.message);
    return null;
  }
}

async function redisSet(key, value, exSeconds = null) {
  try {
    const body = exSeconds 
      ? ['SET', key, JSON.stringify(value), 'EX', exSeconds]
      : ['SET', key, JSON.stringify(value)];
    await fetch(`${UPSTASH_REDIS_REST_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return true;
  } catch (e) {
    console.error('[HIVEMIND] Redis SET error:', e.message);
    return false;
  }
}

async function redisIncr(key) {
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    return data.result;
  } catch (e) {
    return 0;
  }
}

// ============================================
// PINECONE HELPER FUNCTIONS
// ============================================

async function pineconeUpsert(id, text, metadata = {}) {
  try {
    const res = await fetch(`${PINECONE_HOST}/records/namespaces/memories/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2025-01'
      },
      body: JSON.stringify({
        id,
        text,
        ...metadata
      })
    });
    return res.ok;
  } catch (e) {
    console.error('[HIVEMIND] Pinecone upsert error:', e.message);
    return false;
  }
}

async function pineconeSearch(query, topK = 5, filter = {}) {
  try {
    const body = {
      query: { top_k: topK, inputs: { text: query } }
    };
    if (Object.keys(filter).length > 0) {
      body.query.filter = filter;
    }
    
    const res = await fetch(`${PINECONE_HOST}/records/namespaces/memories/search`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2025-01'
      },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) return [];
    const data = await res.json();
    return data.result?.hits || [];
  } catch (e) {
    console.error('[HIVEMIND] Pinecone search error:', e.message);
    return [];
  }
}

// ============================================
// BOT COORDINATION
// ============================================

const BOT_NAMES = {
  lester: { name: 'Lester', keywords: ['lester', 'mastermind', 'hacker'], game: 'gta' },
  pavel: { name: 'Pavel', keywords: ['pavel', 'kapitan', 'submarine', 'kosatka', 'cayo'], game: 'gta' },
  cripps: { name: 'Cripps', keywords: ['cripps', 'trader', 'camp', 'wagon'], game: 'rdo' },
  nazar: { name: 'Madam Nazar', keywords: ['nazar', 'madam', 'collector', 'fortune', 'tarot'], game: 'rdo' },
  chief: { name: 'Police Chief', keywords: ['chief', 'sheriff', 'law', 'bounty', 'wanted'], game: 'rdo' }
};

const MOODS = ['neutral', 'grumpy', 'cheerful', 'tired', 'sarcastic', 'helpful', 'distracted'];

/**
 * Check if this bot should respond to a message
 * Returns: { shouldRespond: boolean, reason: string, context: object }
 */
async function shouldBotRespond(botId, message, client) {
  const channelName = message.channel.name || '';
  const content = message.content.toLowerCase();
  const authorId = message.author.id;
  const isBot = message.author.bot;
  
  // Get bot info
  const botInfo = BOT_NAMES[botId];
  if (!botInfo) return { shouldRespond: false, reason: 'unknown_bot' };
  
  // NEVER respond in these channels
  if (channelName === 'counting') return { shouldRespond: false, reason: 'counting_channel' };
  if (channelName.includes('lfg')) return { shouldRespond: false, reason: 'lfg_channel' };
  if (channelName.includes('log') || channelName.includes('staff') || channelName.includes('admin')) {
    return { shouldRespond: false, reason: 'restricted_channel' };
  }
  
  // NEVER respond in other bots' talk-to channels
  if (channelName.startsWith('talk-to-') && !channelName.includes(botId) && !channelName.includes(botInfo.name.toLowerCase().split(' ')[0])) {
    return { shouldRespond: false, reason: 'other_bot_channel' };
  }
  
  // ALWAYS respond in own talk-to channel
  const myChannelNames = [`talk-to-${botId}`, `talk-to-${botInfo.name.toLowerCase().replace(' ', '-')}`];
  if (myChannelNames.some(n => channelName.includes(n.replace('talk-to-', '')))) {
    return { shouldRespond: true, reason: 'dedicated_channel', context: {} };
  }
  
  // ALWAYS respond if @mentioned
  if (message.mentions.has(client.user)) {
    return { shouldRespond: true, reason: 'direct_mention', context: {} };
  }
  
  // Check if name/keywords mentioned
  const keywordMentioned = botInfo.keywords.some(kw => content.includes(kw));
  
  // Get coordination state from Redis
  const channelState = await redisGet(`channel:${message.channel.id}`) || {};
  const lastSpeaker = channelState.lastBot;
  const lastSpeakTime = channelState.lastTime || 0;
  const timeSinceLastBot = Date.now() - lastSpeakTime;
  
  // Check bot's personal cooldown
  const botCooldown = await redisGet(`cooldown:${botId}:${message.channel.id}`);
  if (botCooldown && Date.now() < botCooldown) {
    return { shouldRespond: false, reason: 'on_cooldown' };
  }
  
  // If another bot just spoke (within 30 seconds), don't respond unless directly mentioned
  if (isBot && timeSinceLastBot < 30000) {
    if (!keywordMentioned) {
      return { shouldRespond: false, reason: 'recent_bot_activity' };
    }
  }
  
  // In general-chat, be very selective
  if (channelName === 'general-chat') {
    // If keyword mentioned, 60% chance
    if (keywordMentioned) {
      const chance = Math.random() < 0.6;
      if (!chance) return { shouldRespond: false, reason: 'keyword_rng_fail' };
      return { shouldRespond: true, reason: 'keyword_trigger', context: {} };
    }
    
    // If it's a bot, ignore completely
    if (isBot) {
      return { shouldRespond: false, reason: 'ignore_bot_in_general' };
    }
    
    // Random chance to engage (very low - 2%)
    if (Math.random() < 0.02) {
      // Additional check: was there recent activity? Don't pile on
      if (timeSinceLastBot < 120000) { // 2 minutes
        return { shouldRespond: false, reason: 'recent_activity' };
      }
      return { shouldRespond: true, reason: 'random_engagement', context: {} };
    }
    
    return { shouldRespond: false, reason: 'no_trigger' };
  }
  
  // Default: don't respond
  return { shouldRespond: false, reason: 'default_no' };
}

/**
 * Record that a bot just spoke (updates coordination state)
 */
async function recordBotSpoke(botId, channelId) {
  // Update channel state
  await redisSet(`channel:${channelId}`, {
    lastBot: botId,
    lastTime: Date.now()
  }, 300); // Expires in 5 minutes
  
  // Set personal cooldown (2-4 minutes random)
  const cooldownMs = (120 + Math.random() * 120) * 1000;
  await redisSet(`cooldown:${botId}:${channelId}`, Date.now() + cooldownMs, 300);
}

// ============================================
// MOOD SYSTEM
// ============================================

/**
 * Get or generate bot's current mood
 */
async function getBotMood(botId) {
  const mood = await redisGet(`mood:${botId}`);
  if (mood) return mood;
  
  // Generate new mood (lasts 2-4 hours)
  const newMood = MOODS[Math.floor(Math.random() * MOODS.length)];
  const ttl = (7200 + Math.random() * 7200); // 2-4 hours in seconds
  await redisSet(`mood:${botId}`, newMood, Math.floor(ttl));
  return newMood;
}

/**
 * Get mood modifier for system prompt
 */
function getMoodPrompt(mood) {
  const moodPrompts = {
    neutral: '',
    grumpy: 'You\'re in a bad mood today. More irritable than usual, shorter responses, easily annoyed.',
    cheerful: 'You\'re in a good mood! More friendly, might crack jokes, genuinely helpful.',
    tired: 'You\'re exhausted. Responses are slower, might yawn, less patience for nonsense.',
    sarcastic: 'Extra sarcastic today. Everything gets a witty or dry comment.',
    helpful: 'Feeling generous and helpful. Going above and beyond, offering extra info.',
    distracted: 'Something\'s on your mind. Might trail off, change subjects, seem preoccupied.'
  };
  return moodPrompts[mood] || '';
}

// ============================================
// MEMORY SYSTEM
// ============================================

/**
 * Store a memory about a user or event
 */
async function storeMemory(type, content, metadata = {}) {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullMetadata = {
    type,
    timestamp: Date.now(),
    ...metadata
  };
  
  await pineconeUpsert(id, content, fullMetadata);
  return id;
}

/**
 * Store interaction memory (user said X, bot said Y)
 */
async function storeInteraction(userId, username, userMessage, botId, botResponse, channelId) {
  const content = `User ${username} said: "${userMessage}" and ${BOT_NAMES[botId]?.name || botId} replied: "${botResponse}"`;
  await storeMemory('interaction', content, {
    userId,
    username,
    botId,
    channelId,
    userMessage: userMessage.slice(0, 500),
    botResponse: botResponse.slice(0, 500)
  });
}

/**
 * Recall relevant memories for context
 */
async function recallMemories(query, options = {}) {
  const { userId, botId, limit = 3 } = options;
  
  const filter = {};
  if (userId) filter.userId = { '$eq': userId };
  if (botId) filter.botId = { '$eq': botId };
  
  const results = await pineconeSearch(query, limit, filter);
  
  return results.map(hit => ({
    content: hit.fields?.text || '',
    score: hit.score,
    metadata: hit.metadata || {}
  }));
}

/**
 * Get memories about a specific user
 */
async function getUserMemories(userId, limit = 5) {
  return recallMemories('interactions and conversations', { userId, limit });
}

/**
 * Build context string from memories for system prompt
 */
async function buildMemoryContext(message, botId) {
  try {
    // Search for relevant memories
    const memories = await recallMemories(message.content, { 
      userId: message.author.id,
      limit: 3 
    });
    
    if (memories.length === 0) return '';
    
    let context = '\n\nRELEVANT MEMORIES (use naturally, don\'t quote directly):\n';
    memories.forEach((mem, i) => {
      if (mem.content && mem.score > 0.5) {
        context += `- ${mem.content.slice(0, 200)}\n`;
      }
    });
    
    return context;
  } catch (e) {
    console.error('[HIVEMIND] Memory context error:', e.message);
    return '';
  }
}

// ============================================
// USER TRACKING
// ============================================

/**
 * Track user activity
 */
async function trackUserActivity(userId, username, guildId, activity = 'message') {
  const key = `user:${userId}`;
  const existing = await redisGet(key) || {
    userId,
    username,
    firstSeen: Date.now(),
    messageCount: 0,
    lastActive: 0,
    guilds: []
  };
  
  existing.username = username;
  existing.messageCount++;
  existing.lastActive = Date.now();
  if (!existing.guilds.includes(guildId)) existing.guilds.push(guildId);
  
  await redisSet(key, existing, 86400 * 7); // 7 days TTL
  return existing;
}

/**
 * Get user info
 */
async function getUserInfo(userId) {
  return await redisGet(`user:${userId}`);
}

/**
 * Check if user is a "regular" (lots of activity)
 */
async function isRegularUser(userId) {
  const user = await getUserInfo(userId);
  if (!user) return false;
  return user.messageCount > 50;
}

// ============================================
// SERVER STATE
// ============================================

/**
 * Track server activity level
 */
async function updateServerActivity(guildId) {
  const key = `server:${guildId}:activity`;
  const count = await redisIncr(key);
  
  // Reset every hour
  if (count === 1) {
    await fetch(`${UPSTASH_REDIS_REST_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EXPIRE', key, 3600])
    });
  }
  
  return count;
}

/**
 * Check if server is currently active
 */
async function isServerActive(guildId) {
  const activity = await redisGet(`server:${guildId}:activity`);
  return (activity || 0) > 10; // More than 10 messages in the last hour
}

// ============================================
// CONVERSATION QUALITY
// ============================================

/**
 * Check if a message is worth responding to
 */
function isQualityMessage(content) {
  // Too short
  if (content.length < 3) return false;
  
  // Just emojis
  if (/^[\p{Emoji}\s]+$/u.test(content)) return false;
  
  // Just a link
  if (/^https?:\/\/\S+$/.test(content)) return false;
  
  // Spam-like
  if (/(.)\1{5,}/.test(content)) return false;
  
  return true;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Coordination
  shouldBotRespond,
  recordBotSpoke,
  
  // Mood
  getBotMood,
  getMoodPrompt,
  
  // Memory
  storeMemory,
  storeInteraction,
  recallMemories,
  getUserMemories,
  buildMemoryContext,
  
  // User tracking
  trackUserActivity,
  getUserInfo,
  isRegularUser,
  
  // Server state
  updateServerActivity,
  isServerActive,
  
  // Utilities
  isQualityMessage,
  
  // Constants
  BOT_NAMES,
  MOODS
};
