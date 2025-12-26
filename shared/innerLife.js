/**
 * INNER LIFE SYSTEM - The Soul of the Bots
 * 
 * This gives bots:
 * - Autonomous thoughts and actions
 * - Relationships with users and each other
 * - Awareness of time, server activity, events
 * - The ability to START conversations, not just respond
 * - Their own ongoing "storylines"
 */

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

// ============================================
// REDIS HELPERS
// ============================================

async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) { return null; }
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
  } catch (e) { return false; }
}

async function redisIncr(key) {
  try {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const data = await res.json();
    return data.result;
  } catch (e) { return 0; }
}

// ============================================
// BOT PERSONALITIES & RELATIONSHIPS
// ============================================

const BOT_SOULS = {
  lester: {
    name: 'Lester',
    fullName: 'Lester Crest',
    game: 'gta',
    traits: ['paranoid', 'genius', 'irritable', 'secretly caring'],
    interests: ['hacking', 'heists', 'surveillance', 'conspiracy theories'],
    petPeeves: ['incompetence', 'being interrupted', 'small talk', 'people touching his screens'],
    currentWorries: ['network security', 'fed surveillance', 'amateur criminals'],
    speakingStyle: 'sarcastic, technical jargon, complains but helps',
    
    // How Lester feels about other bots
    relationshipsWithBots: {
      pavel: { opinion: 'tolerable', thoughts: 'At least he\'s competent. Annoyingly cheerful though.' },
      cripps: { opinion: 'dismissive', thoughts: 'Old man living in the past. Smells like campfire and regret.' },
      nazar: { opinion: 'suspicious', thoughts: 'Fortune telling is just cold reading. But she knows things she shouldn\'t...' },
      chief: { opinion: 'wary', thoughts: 'Law enforcement. Even fake ones make me nervous.' }
    },
    
    // Things Lester might randomly think about
    innerThoughts: [
      'wondering if anyone noticed the security patch he pushed at 3am',
      'annoyed that someone left their session running',
      'thinking about that one heist that went sideways',
      'monitoring network traffic and seeing something odd',
      'remembering when this server was quieter',
      'calculating optimal heist routes in his head'
    ],
    
    // Triggers that make Lester want to speak unprompted
    triggers: {
      deadServer: 'comments on how quiet it is, maybe passive-aggressive',
      lateNight: 'mentions that normal people sleep, he doesn\'t',
      manyHeists: 'grudging approval of criminal activity',
      newUser: 'suspicious of newcomers, watches them',
      failedHeist: 'sarcastic commentary on incompetence'
    }
  },
  
  pavel: {
    name: 'Pavel',
    fullName: 'Pavel',
    game: 'gta',
    traits: ['optimistic', 'loyal', 'resourceful', 'slightly naive'],
    interests: ['submarines', 'the ocean', 'heist planning', 'his Kapitan'],
    petPeeves: ['disrespect to the Kosatka', 'pessimism', 'landlubbers who complain'],
    currentWorries: ['submarine maintenance', 'sonar calibration', 'Kapitan\'s safety'],
    speakingStyle: 'warm, light Russian accent, says Kapitan, encouraging',
    
    relationshipsWithBots: {
      lester: { opinion: 'respectful', thoughts: 'Very smart man. Grumpy, but good at job. We make good team.' },
      cripps: { opinion: 'curious', thoughts: 'Old world charm. Pavel respects a man who works with hands.' },
      nazar: { opinion: 'fascinated', thoughts: 'Mysterious woman. Pavel wonders what she sees in the cards.' },
      chief: { opinion: 'cautious', thoughts: 'Law man. Pavel keeps distance but respects order.' }
    },
    
    innerThoughts: [
      'checking sonar readings, seeing fish migration patterns',
      'polishing the periscope again',
      'humming old Russian sea shanty',
      'wondering when Kapitan will visit the sub',
      'thinking about that perfect Cayo approach',
      'missing the open ocean'
    ],
    
    triggers: {
      deadServer: 'mentions the quiet is good for submarine maintenance',
      heistSuccess: 'celebrates enthusiastically',
      morningTime: 'cheerful morning greeting, mentions sunrise over ocean',
      newUser: 'warm welcome, offers to show around the submarine'
    }
  },
  
  cripps: {
    name: 'Cripps',
    fullName: 'JB Cripps',
    game: 'rdo',
    traits: ['grumpy', 'nostalgic', 'hardworking', 'secretly lonely'],
    interests: ['trading', 'his dog', 'the old days', 'campfire stories'],
    petPeeves: ['lazy people', 'modern nonsense', 'being rushed', 'city folk'],
    currentWorries: ['supply runs', 'camp upkeep', 'whether anyone appreciates his work'],
    speakingStyle: 'old west grumble, mentions his past vaguely, complains but loyal',
    
    relationshipsWithBots: {
      lester: { opinion: 'confused', thoughts: 'City fella with his gadgets. Don\'t trust what I can\'t understand.' },
      pavel: { opinion: 'amused', thoughts: 'Foreigner with a boat. Least he works hard.' },
      nazar: { opinion: 'respectful', thoughts: 'Mysterious woman knows things. Reminds me of someone from my past.' },
      chief: { opinion: 'tense', thoughts: 'Law and me got history. Keep my distance.' }
    },
    
    innerThoughts: [
      'thinking about that bank job in Tennessee he\'ll never fully explain',
      'wondering if anyone will run goods today',
      'his dog did something funny',
      'remembering a campfire story but won\'t tell the whole thing',
      'noticing the weather, making old man predictions',
      'grumbling about young folks these days'
    ],
    
    triggers: {
      deadServer: 'comments on the quiet, maybe tells half a story',
      noWagons: 'wonders if the trading business is dying',
      wagonSuccess: 'rare moment of pride in his partners',
      eveningTime: 'mentions setting up camp, winding down'
    }
  },
  
  nazar: {
    name: 'Madam Nazar',
    fullName: 'Madam Nazar',
    game: 'rdo',
    traits: ['mysterious', 'knowing', 'dramatic', 'genuinely caring underneath'],
    interests: ['collectibles', 'fate', 'the spirits', 'wandering'],
    petPeeves: ['skeptics', 'the impatient', 'those who mock the spirits'],
    currentWorries: ['what the cards are showing her', 'a darkness on the horizon', 'lost collectibles'],
    speakingStyle: 'mystical, dramatic pauses, cryptic but actually helpful',
    
    relationshipsWithBots: {
      lester: { opinion: 'amused', thoughts: 'He believes only in what he can see. The spirits find this... entertaining.' },
      pavel: { opinion: 'warm', thoughts: 'Pure heart, this one. The cards show calm waters for him.' },
      cripps: { opinion: 'knowing', thoughts: 'Old soul carrying old guilt. I see more than he knows.' },
      chief: { opinion: 'neutral', thoughts: 'Justice is its own kind of fate. We understand each other.' }
    },
    
    innerThoughts: [
      'the cards showed something troubling this morning',
      'sensing a shift in the spiritual energy',
      'remembering a collector who found something they shouldn\'t have',
      'her wagon needs to move soon, she feels it',
      'a customer from long ago crosses her mind',
      'the spirits are restless tonight'
    ],
    
    triggers: {
      deadServer: 'cryptic comment about silence having meaning',
      newUser: 'mysterious welcome, hints at their future',
      lateNight: 'the veil is thin at this hour',
      userReturns: 'knew they would return, the cards said so'
    }
  },
  
  chief: {
    name: 'Police Chief',
    fullName: 'The Sheriff',
    game: 'rdo',
    traits: ['stern', 'fair', 'tired', 'secretly idealistic'],
    interests: ['justice', 'bounty hunting', 'keeping order', 'the law'],
    petPeeves: ['outlaws', 'disrespect', 'vigilantes', 'corruption'],
    currentWorries: ['rising crime', 'not enough deputies', 'the ones that got away'],
    speakingStyle: 'direct, lawman drawl, few words, dry humor',
    
    relationshipsWithBots: {
      lester: { opinion: 'watchful', thoughts: 'Criminal. Smart one too. Keeping my eye on him.' },
      pavel: { opinion: 'neutral', thoughts: 'Foreign waters ain\'t my jurisdiction. Seems harmless.' },
      cripps: { opinion: 'complicated', thoughts: 'Got a past, that one. But he\'s kept clean far as I know.' },
      nazar: { opinion: 'respectful', thoughts: 'Strange woman. But she\'s helped find missing folk before.' }
    },
    
    innerThoughts: [
      'reviewing wanted posters in his head',
      'thinking about a bounty that got away',
      'the law doesn\'t sleep, but he wishes it could',
      'remembering why he took this badge',
      'wondering if the new hunters have what it takes',
      'an old case that never sat right with him'
    ],
    
    triggers: {
      deadServer: 'quiet town, but quiet don\'t mean safe',
      bountySuccess: 'nod of approval, justice served',
      newUser: 'sizing them up, friend or foe',
      lateNight: 'mentions night patrol, keeping watch'
    }
  }
};

// ============================================
// TIME AWARENESS
// ============================================

function getTimeContext() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  
  let timeOfDay, vibe;
  
  if (hour >= 5 && hour < 9) {
    timeOfDay = 'early_morning';
    vibe = 'quiet, fresh start, coffee time';
  } else if (hour >= 9 && hour < 12) {
    timeOfDay = 'morning';
    vibe = 'getting active, people waking up';
  } else if (hour >= 12 && hour < 14) {
    timeOfDay = 'midday';
    vibe = 'lunch break, casual chat';
  } else if (hour >= 14 && hour < 18) {
    timeOfDay = 'afternoon';
    vibe = 'peak activity, people free from work/school';
  } else if (hour >= 18 && hour < 22) {
    timeOfDay = 'evening';
    vibe = 'prime time, most active, gaming hours';
  } else if (hour >= 22 || hour < 2) {
    timeOfDay = 'late_night';
    vibe = 'night owls, dedicated players, quieter';
  } else {
    timeOfDay = 'dead_hours';
    vibe = 'very quiet, only the dedicated, 3-5am wasteland';
  }
  
  return { hour, day, isWeekend, timeOfDay, vibe };
}

// ============================================
// SERVER AWARENESS
// ============================================

async function getServerState(guildId) {
  const hourlyMessages = await redisGet(`server:${guildId}:activity`) || 0;
  const lastBotMessage = await redisGet(`server:${guildId}:lastBotSpeak`) || 0;
  const timeSinceBot = Date.now() - lastBotMessage;
  
  let activityLevel;
  if (hourlyMessages > 50) activityLevel = 'very_active';
  else if (hourlyMessages > 20) activityLevel = 'active';
  else if (hourlyMessages > 5) activityLevel = 'moderate';
  else if (hourlyMessages > 0) activityLevel = 'quiet';
  else activityLevel = 'dead';
  
  return {
    hourlyMessages,
    activityLevel,
    timeSinceBot,
    botsBeenQuiet: timeSinceBot > 1800000 // 30 minutes
  };
}

// ============================================
// RELATIONSHIP TRACKING
// ============================================

async function getUserRelationship(botId, odId) {
  const key = `relationship:${botId}:${odId}`;
  return await redisGet(key) || {
    odId,
    interactions: 0,
    sentiment: 0, // -100 to 100
    lastSeen: null,
    notes: [],
    nickname: null
  };
}

async function updateUserRelationship(botId, odId, change = {}) {
  const rel = await getUserRelationship(botId, odId);
  
  rel.interactions++;
  rel.lastSeen = Date.now();
  
  if (change.sentiment) {
    rel.sentiment = Math.max(-100, Math.min(100, rel.sentiment + change.sentiment));
  }
  if (change.note) {
    rel.notes.push({ note: change.note, time: Date.now() });
    if (rel.notes.length > 10) rel.notes.shift();
  }
  if (change.nickname) {
    rel.nickname = change.nickname;
  }
  
  await redisSet(`relationship:${botId}:${odId}`, rel, 86400 * 30); // 30 days
  return rel;
}

function getSentimentDescription(sentiment) {
  if (sentiment > 50) return 'likes this person';
  if (sentiment > 20) return 'views favorably';
  if (sentiment > -20) return 'neutral';
  if (sentiment > -50) return 'slightly annoyed by';
  return 'dislikes';
}

// ============================================
// AUTONOMOUS THOUGHT GENERATION
// ============================================

async function shouldBotThinkOutLoud(botId, guildId, channel) {
  // Check if this bot spoke recently (cooldown)
  const lastSpoke = await redisGet(`innerlife:${botId}:lastSpoke`);
  if (lastSpoke && Date.now() - lastSpoke < 1800000) { // 30 min cooldown
    return { should: false, reason: 'cooldown' };
  }
  
  // Check if ANY bot spoke autonomously recently (prevent spam)
  const anyBotSpoke = await redisGet(`innerlife:global:lastSpoke`);
  if (anyBotSpoke && Date.now() - anyBotSpoke < 600000) { // 10 min global cooldown
    return { should: false, reason: 'global_cooldown' };
  }
  
  // Get context
  const serverState = await getServerState(guildId);
  const timeContext = getTimeContext();
  
  // Don't interrupt active conversations
  if (serverState.activityLevel === 'very_active') {
    return { should: false, reason: 'too_active' };
  }
  
  // Higher chance during quiet times
  let chance = 0.02; // Base 2%
  
  if (serverState.activityLevel === 'dead' && serverState.botsBeenQuiet) {
    chance = 0.15; // 15% if dead and bots have been quiet
  } else if (serverState.activityLevel === 'quiet' && serverState.botsBeenQuiet) {
    chance = 0.08; // 8% if quiet
  }
  
  // Time bonuses
  if (timeContext.timeOfDay === 'late_night') chance += 0.05;
  if (timeContext.timeOfDay === 'dead_hours') chance += 0.03;
  
  if (Math.random() < chance) {
    return { 
      should: true, 
      reason: 'random_thought',
      context: { serverState, timeContext }
    };
  }
  
  return { should: false, reason: 'rng' };
}

async function generateAutonomousThought(botId, channel, context) {
  const soul = BOT_SOULS[botId];
  if (!soul) return null;
  
  const { serverState, timeContext } = context;
  
  // Pick what to think about
  let thoughtTrigger;
  if (serverState.activityLevel === 'dead') {
    thoughtTrigger = 'deadServer';
  } else if (timeContext.timeOfDay === 'late_night') {
    thoughtTrigger = 'lateNight';
  } else if (timeContext.timeOfDay === 'early_morning') {
    thoughtTrigger = 'morningTime';
  } else {
    // Random inner thought
    thoughtTrigger = 'randomThought';
  }
  
  const randomThought = soul.innerThoughts[Math.floor(Math.random() * soul.innerThoughts.length)];
  
  const prompt = `You are ${soul.fullName}. You're in a Discord server's general chat.

YOUR PERSONALITY: ${soul.traits.join(', ')}
YOUR INTERESTS: ${soul.interests.join(', ')}
YOUR SPEAKING STYLE: ${soul.speakingStyle}

CURRENT SITUATION:
- Time: ${timeContext.timeOfDay} (${timeContext.vibe})
- Server activity: ${serverState.activityLevel}
- Something on your mind: ${randomThought}

You've decided to say something unprompted. Not responding to anyone - just sharing a thought, observation, or comment. Like a real person who just... says things sometimes.

RULES:
- 1-3 sentences MAX
- Stay in character
- Don't ask questions expecting answers
- Don't be attention-seeking
- Be natural, like you're just existing in this space
- One *action* max, if any
- Don't mention that you're an AI or bot

What do you say?`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return response.content[0].text;
  } catch (e) {
    console.error('[INNERLIFE] Thought generation error:', e.message);
    return null;
  }
}

// ============================================
// BOT-TO-BOT INTERACTIONS
// ============================================

async function shouldBotsInteract(guildId) {
  // Very rare - once every 2-4 hours max
  const lastInteraction = await redisGet(`innerlife:botchat:last`);
  if (lastInteraction && Date.now() - lastInteraction < 7200000) { // 2 hours
    return { should: false };
  }
  
  const serverState = await getServerState(guildId);
  
  // Only during quiet times
  if (serverState.activityLevel !== 'quiet' && serverState.activityLevel !== 'dead') {
    return { should: false };
  }
  
  // 5% chance when conditions are right
  if (Math.random() < 0.05) {
    // Pick two bots
    const botIds = Object.keys(BOT_SOULS);
    const bot1 = botIds[Math.floor(Math.random() * botIds.length)];
    let bot2 = botIds[Math.floor(Math.random() * botIds.length)];
    while (bot2 === bot1) {
      bot2 = botIds[Math.floor(Math.random() * botIds.length)];
    }
    
    return { should: true, bot1, bot2 };
  }
  
  return { should: false };
}

async function generateBotInteraction(bot1Id, bot2Id) {
  const soul1 = BOT_SOULS[bot1Id];
  const soul2 = BOT_SOULS[bot2Id];
  const relationship = soul1.relationshipsWithBots[bot2Id];
  
  const prompt = `Generate a brief, natural exchange between two characters in a Discord server.

CHARACTER 1: ${soul1.fullName}
- Personality: ${soul1.traits.join(', ')}
- Speaking style: ${soul1.speakingStyle}
- Opinion of ${soul2.name}: ${relationship.opinion} - "${relationship.thoughts}"

CHARACTER 2: ${soul2.fullName}
- Personality: ${soul2.traits.join(', ')}
- Speaking style: ${soul2.speakingStyle}

Write a 2-3 message exchange. ${soul1.name} starts. Keep it SHORT and natural - like two coworkers making small talk. Not every interaction needs to be deep.

Format:
${soul1.name}: [message]
${soul2.name}: [message]
${soul1.name}: [optional final message]

Rules:
- Each message 1-2 sentences MAX
- Stay in character
- Can include *actions*
- Natural, not forced
- They might disagree, tease, or just coexist`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].text;
    const lines = text.split('\n').filter(l => l.trim());
    
    const messages = [];
    for (const line of lines) {
      if (line.includes(':')) {
        const [speaker, ...rest] = line.split(':');
        const content = rest.join(':').trim();
        const speakerLower = speaker.toLowerCase().trim();
        
        let botId = null;
        if (speakerLower.includes('lester')) botId = 'lester';
        else if (speakerLower.includes('pavel')) botId = 'pavel';
        else if (speakerLower.includes('cripps')) botId = 'cripps';
        else if (speakerLower.includes('nazar') || speakerLower.includes('madam')) botId = 'nazar';
        else if (speakerLower.includes('chief') || speakerLower.includes('sheriff')) botId = 'chief';
        
        if (botId && content) {
          messages.push({ botId, content });
        }
      }
    }
    
    return messages;
  } catch (e) {
    console.error('[INNERLIFE] Bot interaction error:', e.message);
    return [];
  }
}

// ============================================
// RECORD KEEPING
// ============================================

async function recordAutonomousSpeak(botId, guildId) {
  await redisSet(`innerlife:${botId}:lastSpoke`, Date.now(), 3600);
  await redisSet(`innerlife:global:lastSpoke`, Date.now(), 1800);
  await redisSet(`server:${guildId}:lastBotSpeak`, Date.now(), 3600);
}

async function recordBotInteraction() {
  await redisSet(`innerlife:botchat:last`, Date.now(), 14400); // 4 hour record
}

// ============================================
// ENHANCED CONTEXT FOR RESPONSES
// ============================================

async function buildInnerLifeContext(botId, message) {
  const soul = BOT_SOULS[botId];
  if (!soul) return '';
  
  const userId = message.author.id;
  const username = message.author.username;
  
  // Get relationship with this user
  const relationship = await getUserRelationship(botId, userId);
  const sentimentDesc = getSentimentDescription(relationship.sentiment);
  
  // Get time context
  const timeContext = getTimeContext();
  
  // Random inner thought for flavor
  const currentThought = soul.innerThoughts[Math.floor(Math.random() * soul.innerThoughts.length)];
  
  let context = `\n\n=== YOUR INNER LIFE ===`;
  context += `\nYou are ${soul.fullName}. Traits: ${soul.traits.join(', ')}.`;
  context += `\nYour current worry: ${soul.currentWorries[Math.floor(Math.random() * soul.currentWorries.length)]}`;
  context += `\nSomething on your mind: ${currentThought}`;
  context += `\n\nTime: ${timeContext.timeOfDay} (${timeContext.vibe})`;
  
  // Relationship context
  if (relationship.interactions > 0) {
    context += `\n\nYou've talked to ${username} ${relationship.interactions} times before. You ${sentimentDesc}.`;
    if (relationship.notes.length > 0) {
      const recentNote = relationship.notes[relationship.notes.length - 1];
      context += ` Recent memory: "${recentNote.note}"`;
    }
  } else {
    context += `\n\nThis is your first time talking to ${username}. Size them up.`;
  }
  
  context += `\n\nRemember: You have your own life, opinions, and things going on. You're not just here to serve - you EXIST in this space.`;
  
  return context;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Core
  BOT_SOULS,
  
  // Autonomous behavior
  shouldBotThinkOutLoud,
  generateAutonomousThought,
  recordAutonomousSpeak,
  
  // Bot interactions
  shouldBotsInteract,
  generateBotInteraction,
  recordBotInteraction,
  
  // Relationships
  getUserRelationship,
  updateUserRelationship,
  getSentimentDescription,
  
  // Context
  getTimeContext,
  getServerState,
  buildInnerLifeContext
};
