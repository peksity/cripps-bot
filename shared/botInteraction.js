/**
 * ADVANCED BOT INTERACTION SYSTEM v2
 * - GTA bots stay in GTA channels
 * - RDO bots stay in RDO channels
 * - Bots only talk to each other in general-chat
 * - Each talk-to channel is exclusive
 * - No responding to embeds or read-only channels
 * - Human-like message lengths
 */

// ═══════════════════════════════════════════════════════════════
// BOT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const BOT_CONFIG = {
  lester: {
    name: 'Lester',
    game: 'gta',
    talkChannel: 'talk-to-lester',
    triggers: ['lester', 'mastermind', 'heist', 'plan'],
    canTalkIn: ['general-chat', 'gta-chat', 'talk-to-lester']
  },
  pavel: {
    name: 'Pavel',
    game: 'gta',
    talkChannel: 'talk-to-pavel',
    triggers: ['pavel', 'kapitan', 'submarine', 'cayo', 'kosatka'],
    canTalkIn: ['general-chat', 'gta-chat', 'talk-to-pavel']
  },
  cripps: {
    name: 'Cripps',
    game: 'rdo',
    talkChannel: 'talk-to-cripps',
    triggers: ['cripps', 'wagon', 'trader', 'camp'],
    canTalkIn: ['general-chat', 'rdo-chat', 'talk-to-cripps']
  },
  madam: {
    name: 'Madam Nazar',
    game: 'rdo',
    talkChannel: 'talk-to-madam',
    triggers: ['madam', 'nazar', 'collector', 'collectible'],
    canTalkIn: ['general-chat', 'rdo-chat', 'talk-to-madam']
  },
  chief: {
    name: 'Police Chief',
    game: 'rdo',
    talkChannel: 'talk-to-police-chief',
    triggers: ['chief', 'sheriff', 'bounty', 'law'],
    canTalkIn: ['general-chat', 'rdo-chat', 'talk-to-police-chief']
  }
};

// Channels where bots should NEVER talk
const SILENT_CHANNELS = [
  'gun-van',
  'madam-nazar', 
  'counting',
  'rules',
  'welcome',
  'roles',
  'get-roles',
  'role-select',
  'nexus-log',
  'mod-actions',
  'message-logs',
  'bot-actions',
  'join-leave',
  'voice-logs',
  'role-changes',
  'nickname-logs',
  'invite-logs',
  'scam-detection',
  'channel-logs',
  'audit-log',
  'staff-chat',
  'staff-commands',
  'modmail',
  'transcripts'
];

// LFG channels - only for commands, no chatting
const LFG_CHANNELS = ['cayo-lfg', 'wagon-lfg', 'bounty-lfg'];

// Cooldowns
const botCooldowns = new Map();

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if message is an embed or has only embeds
 */
function isEmbedOnly(message) {
  if (message.embeds.length > 0 && (!message.content || message.content.trim() === '')) {
    return true;
  }
  return false;
}

/**
 * Identify which bot sent a message
 */
function identifyBot(message) {
  if (!message.author.bot) return null;
  const name = message.author.username.toLowerCase();
  
  if (name.includes('lester')) return 'lester';
  if (name.includes('pavel')) return 'pavel';
  if (name.includes('cripps')) return 'cripps';
  if (name.includes('madam') || name.includes('nazar')) return 'madam';
  if (name.includes('police') || name.includes('chief')) return 'chief';
  return null;
}

/**
 * Check if this is one of our bots
 */
function isOurBot(message) {
  return identifyBot(message) !== null;
}

/**
 * Check if channel is in silent list
 */
function isSilentChannel(channelName) {
  return SILENT_CHANNELS.includes(channelName);
}

/**
 * Check if channel is LFG
 */
function isLFGChannel(channelName) {
  return LFG_CHANNELS.includes(channelName);
}

/**
 * Check if this bot can talk in this channel
 */
function canTalkInChannel(myBotId, channelName) {
  const config = BOT_CONFIG[myBotId];
  if (!config) return false;
  return config.canTalkIn.includes(channelName);
}

/**
 * Check cooldown for bot responses
 */
function checkCooldown(key, cooldownMs) {
  const lastTime = botCooldowns.get(key);
  if (lastTime && Date.now() - lastTime < cooldownMs) {
    return false;
  }
  return true;
}

/**
 * Set cooldown
 */
function setCooldown(key) {
  botCooldowns.set(key, Date.now());
}

// ═══════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Should this bot respond to another bot's message?
 * ONLY in general-chat
 */
function shouldRespondToBot(myBotId, message) {
  const otherBot = identifyBot(message);
  if (!otherBot || otherBot === myBotId) return false;
  
  // ONLY respond to other bots in general-chat
  const channelName = message.channel.name;
  if (channelName !== 'general-chat') return false;
  
  // Don't respond to embeds
  if (isEmbedOnly(message)) return false;
  
  // Check cooldown (90 seconds between bot-to-bot)
  const cooldownKey = `${message.channel.id}-${myBotId}-bot`;
  if (!checkCooldown(cooldownKey, 90000)) return false;
  
  // 20% chance to respond to another bot
  if (Math.random() > 0.20) return false;
  
  return true;
}

/**
 * Should this bot respond to a user's message?
 */
function shouldRespondToUser(myBotId, message, options = {}) {
  const channelName = message.channel.name;
  const config = BOT_CONFIG[myBotId];
  
  if (!config) return { respond: false };
  
  // Never respond in silent channels
  if (isSilentChannel(channelName)) return { respond: false };
  
  // Never respond in LFG channels (handled separately)
  if (isLFGChannel(channelName)) return { respond: false };
  
  // Don't respond to embeds
  if (isEmbedOnly(message)) return { respond: false };
  
  // ALWAYS respond in our talk-to channel
  if (channelName === config.talkChannel) {
    return { respond: true, type: 'talk-to', shouldReply: true };
  }
  
  // Check if we can talk in this channel
  if (!canTalkInChannel(myBotId, channelName)) return { respond: false };
  
  // Check if mentioned
  if (options.client && message.mentions.has(options.client.user)) {
    return { respond: true, type: 'mention', shouldReply: true };
  }
  
  // Check if name called
  const content = message.content.toLowerCase();
  for (const trigger of config.triggers) {
    if (content.includes(trigger)) {
      return { respond: true, type: 'name-called', shouldReply: false };
    }
  }
  
  // Random participation in allowed chat channels (very low chance)
  if (channelName === 'general-chat' || channelName === 'gta-chat' || channelName === 'rdo-chat') {
    const cooldownKey = `${message.channel.id}-${myBotId}-chat`;
    if (!checkCooldown(cooldownKey, 60000)) return { respond: false };
    
    // 3-5% chance for random participation
    const chance = channelName === 'general-chat' ? 0.03 : 0.05;
    if (Math.random() < chance) {
      return { respond: true, type: 'free-roam', shouldReply: false };
    }
  }
  
  return { respond: false };
}

/**
 * Record that bot responded
 */
function recordResponse(myBotId, channelId, type) {
  const cooldownKey = `${channelId}-${myBotId}-${type === 'bot-talk' ? 'bot' : 'chat'}`;
  setCooldown(cooldownKey);
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDING
// ═══════════════════════════════════════════════════════════════

/**
 * Get recent channel context for better responses
 */
async function getChannelContext(message, limit = 5) {
  try {
    const messages = await message.channel.messages.fetch({ limit });
    const sorted = [...messages.values()].reverse();
    
    let context = '\nRECENT:';
    for (const msg of sorted) {
      if (msg.id === message.id) continue;
      if (isEmbedOnly(msg)) continue;
      
      const speaker = msg.author.bot ? `[${msg.author.username}]` : msg.author.username;
      const text = msg.content.substring(0, 80);
      if (text) context += `\n${speaker}: ${text}`;
    }
    
    return context;
  } catch (e) {
    return '';
  }
}

/**
 * Get human-like response guidelines
 */
function getHumanGuidelines() {
  return `

BE HUMAN - THIS IS CRITICAL:
- Keep messages SHORT. 1-2 sentences max usually.
- Vary your message length. Sometimes one word. Sometimes a sentence.
- Use casual language: "lol", "ngl", "fr", "bet", "damn"
- lowercase is fine. dont always capitalize.
- Abbreviate sometimes: "u", "rn", "idk", "nah"
- Don't overexplain. Real people don't lecture.
- Match the vibe. If they're chill, be chill.
- React naturally: "nice", "facts", "true", "lmao"
- NO bullet points. NO lists. NO formatting.
- Sound like texting, not writing.
- Don't repeat yourself across messages.
- Don't always end with a question.`;
}

module.exports = {
  BOT_CONFIG,
  SILENT_CHANNELS,
  LFG_CHANNELS,
  isEmbedOnly,
  identifyBot,
  isOurBot,
  isSilentChannel,
  isLFGChannel,
  canTalkInChannel,
  shouldRespondToBot,
  shouldRespondToUser,
  recordResponse,
  getChannelContext,
  getHumanGuidelines
};
