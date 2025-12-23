// ============================================
// FREEROAM SYSTEM V2 - HUMAN-LIKE BOT BEHAVIOR
// ============================================
// Makes bots act like real humans in the server
// Smart context detection, natural conversation flow

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic();

class FreeRoamSystem {
  constructor(botName, botId, systemPrompt, pool) {
    this.botName = botName;
    this.botId = botId;
    this.systemPrompt = systemPrompt;
    this.pool = pool;
    
    // Conversation tracking
    this.recentMessages = new Map(); // channelId -> messages[]
    this.lastResponse = new Map(); // channelId -> timestamp
    this.conversationContext = new Map(); // channelId -> context
    
    // Bot state - changes over time like a real person
    this.mood = this.generateMood();
    this.energy = 50 + Math.random() * 50; // 50-100
    this.lastMoodChange = Date.now();
    this.currentInterest = null; // What topic they're currently engaged with
    
    // Relationship tracking
    this.userFamiliarity = new Map(); // oderId -> how well bot knows them
    
    // Timing - prevents spam
    this.minResponseGap = 5000; // 5 seconds between responses
    this.maxMessagesPerMinute = 4;
    this.messageCount = 0;
    this.lastMinuteReset = Date.now();
    
    // Topic keywords - but we'll check CONTEXT not just keywords
    this.topicKeywords = this.getTopicKeywords();
  }

  getTopicKeywords() {
    // These are TOPIC AREAS not trigger words
    // Bot will check if conversation is ABOUT these topics, not just mentions them
    const topics = {
      lester: {
        primary: ['heist', 'cayo', 'casino', 'setup', 'finale', 'hacking', 'vault', 'diamonds', 'gold'],
        secondary: ['gta', 'online', 'glitch', 'money', 'business', 'nightclub', 'bunker'],
        characters: ['michael', 'trevor', 'franklin', 'pavel', 'georgina']
      },
      cripps: {
        primary: ['trader', 'wagon', 'delivery', 'camp', 'goods', 'materials', 'hunting', 'pelt'],
        secondary: ['rdo', 'red dead', 'frontier', 'animal'],
        characters: ['harriet', 'gus', 'nazar']
      },
      pavel: {
        primary: ['cayo', 'perico', 'submarine', 'kosatka', 'el rubio', 'drainage', 'compound'],
        secondary: ['heist', 'approach', 'target', 'stealth'],
        characters: ['kapitan', 'rubio', 'lester']
      },
      madam: {
        primary: ['collector', 'collectible', 'tarot', 'cards', 'coin', 'arrowhead', 'flower'],
        secondary: ['cycle', 'location', 'fortune', 'spirits'],
        characters: ['cripps', 'harriet', 'gus']
      },
      chief: {
        primary: ['bounty', 'bounties', 'legendary bounty', 'wanted', 'outlaw', 'warrant', 'bounty hunt'],
        secondary: ['law', 'justice', 'capture', 'reward', 'posse', 'bounty hunter'],
        targets: ['yukon', 'owlhoot', 'etta doyle', 'wolfman', 'sergio', 'cecil', 'tobin', 'carmela', 'philip', 'virgil']
      }
    };
    return topics[this.botName.toLowerCase()] || topics.lester;
  }

  generateMood() {
    const moods = [
      { name: 'chill', talkative: 0.5, responseLength: 'medium' },
      { name: 'bored', talkative: 0.7, responseLength: 'varies' },
      { name: 'annoyed', talkative: 0.3, responseLength: 'short' },
      { name: 'talkative', talkative: 0.8, responseLength: 'long' },
      { name: 'tired', talkative: 0.2, responseLength: 'short' },
      { name: 'engaged', talkative: 0.9, responseLength: 'medium' },
      { name: 'grumpy', talkative: 0.4, responseLength: 'short' },
      { name: 'curious', talkative: 0.6, responseLength: 'medium' }
    ];
    return moods[Math.floor(Math.random() * moods.length)];
  }

  updateMood() {
    // Mood changes every 5-15 minutes randomly
    const timeSinceChange = Date.now() - this.lastMoodChange;
    const changeThreshold = (5 + Math.random() * 10) * 60 * 1000;
    
    if (timeSinceChange > changeThreshold) {
      this.mood = this.generateMood();
      this.energy = Math.min(100, this.energy + 20 + Math.random() * 20);
      this.lastMoodChange = Date.now();
    }
  }

  trackMessage(message) {
    const channelId = message.channel.id;
    
    if (!this.recentMessages.has(channelId)) {
      this.recentMessages.set(channelId, []);
    }
    
    const messages = this.recentMessages.get(channelId);
    messages.push({
      id: message.id,
      author: message.author.username,
      authorId: message.author.id,
      content: message.content,
      timestamp: Date.now(),
      isBot: message.author.bot
    });
    
    // Keep last 30 messages per channel
    if (messages.length > 30) {
      messages.shift();
    }
    
    // Track familiarity with user
    const familiarity = this.userFamiliarity.get(message.author.id) || 0;
    this.userFamiliarity.set(message.author.id, Math.min(familiarity + 1, 100));
  }

  getConversationContext(channelId) {
    const messages = this.recentMessages.get(channelId) || [];
    const last15 = messages.slice(-15);
    return last15.map(m => `${m.author}: ${m.content}`).join('\n');
  }

  // SMART TOPIC DETECTION - checks if conversation is ABOUT the topic
  isTopicRelevant(content, recentContext) {
    const lower = content.toLowerCase();
    const contextLower = recentContext.toLowerCase();
    const combined = lower + ' ' + contextLower;
    
    // Check primary keywords - need at least 2 matches OR 1 strong match in recent context
    const primaryMatches = this.topicKeywords.primary.filter(k => combined.includes(k));
    if (primaryMatches.length >= 2) return { relevant: true, strength: 'high', topics: primaryMatches };
    
    // Single primary match in the actual message (not just context)
    const directMatch = this.topicKeywords.primary.filter(k => lower.includes(k));
    if (directMatch.length >= 1) return { relevant: true, strength: 'medium', topics: directMatch };
    
    // Check for character mentions specific to this bot
    if (this.topicKeywords.characters) {
      const charMatches = this.topicKeywords.characters.filter(c => lower.includes(c));
      if (charMatches.length >= 1) return { relevant: true, strength: 'medium', topics: charMatches };
    }
    
    // Check legendary bounty targets for chief
    if (this.topicKeywords.targets) {
      const targetMatches = this.topicKeywords.targets.filter(t => lower.includes(t));
      if (targetMatches.length >= 1) return { relevant: true, strength: 'high', topics: targetMatches };
    }
    
    // Secondary keywords need more matches
    const secondaryMatches = this.topicKeywords.secondary.filter(k => lower.includes(k));
    if (secondaryMatches.length >= 2) return { relevant: true, strength: 'low', topics: secondaryMatches };
    
    return { relevant: false, strength: 'none', topics: [] };
  }

  // Check if bot's name was mentioned - MORE SPECIFIC now
  wasNameMentioned(content) {
    const lower = content.toLowerCase();
    const names = {
      lester: ['lester'],
      cripps: ['cripps'],
      pavel: ['pavel'],
      madam: ['madam nazar', 'madam', 'nazar'],
      chief: ['police chief', 'chief'] // NOT just "police"
    };
    
    const botNames = names[this.botName.toLowerCase()] || [this.botName.toLowerCase()];
    
    // For "chief", make sure it's actually referring to the bot
    if (this.botName.toLowerCase() === 'chief') {
      // Check for "police chief" or "the chief" or "hey chief"
      if (lower.includes('police chief')) return true;
      if (lower.includes('the chief')) return true;
      if (lower.includes('hey chief')) return true;
      if (lower.includes('yo chief')) return true;
      // Avoid triggering on just "chief" in random contexts
      if (lower.match(/\bchief\b/) && (lower.includes('bounty') || lower.includes('law') || lower.includes('sheriff'))) return true;
      return false;
    }
    
    return botNames.some(name => lower.includes(name));
  }

  // Check if addressed to another bot
  isAddressedToOtherBot(message) {
    const otherBots = ['lester', 'cripps', 'pavel', 'madam', 'nazar', 'police chief'];
    const content = message.content.toLowerCase();
    const botName = this.botName.toLowerCase();
    
    // Remove own name from check
    const others = otherBots.filter(b => !b.includes(botName) && !botName.includes(b));
    
    // Check if starts with another bot's name
    for (const bot of others) {
      if (content.startsWith(bot) || content.startsWith(`hey ${bot}`) || content.startsWith(`yo ${bot}`)) {
        return true;
      }
    }
    
    // Check @mentions
    if (message.mentions.users.size > 0) {
      for (const [id, user] of message.mentions.users) {
        if (user.bot && id !== this.botId) return true;
      }
    }
    
    return false;
  }

  // Rate limiting
  canRespond(channelId) {
    if (Date.now() - this.lastMinuteReset > 60000) {
      this.messageCount = 0;
      this.lastMinuteReset = Date.now();
    }
    
    if (this.messageCount >= this.maxMessagesPerMinute) return false;
    
    const lastTime = this.lastResponse.get(channelId) || 0;
    if (Date.now() - lastTime < this.minResponseGap) return false;
    
    return true;
  }

  recordResponse(channelId) {
    this.lastResponse.set(channelId, Date.now());
    this.messageCount++;
    this.energy = Math.max(10, this.energy - 8);
  }

  // THE MAIN DECISION
  async shouldRespond(message) {
    if (message.author.id === this.botId) return { respond: false };
    if (message.author.bot) return { respond: false };
    if (!this.canRespond(message.channel.id)) return { respond: false };
    
    this.trackMessage(message);
    this.updateMood();
    
    const content = message.content;
    const context = this.getConversationContext(message.channel.id);
    
    // ALWAYS respond if directly @mentioned
    if (message.mentions.has(this.botId)) {
      return { respond: true, reason: 'direct_mention', priority: 'high' };
    }
    
    // Check if name was mentioned
    if (this.wasNameMentioned(content)) {
      if (this.isAddressedToOtherBot(message)) {
        // Small chance to butt in anyway
        if (Math.random() < 0.1) {
          return { respond: true, reason: 'overheard_name', priority: 'low' };
        }
        return { respond: false };
      }
      return { respond: true, reason: 'name_mentioned', priority: 'high' };
    }
    
    // If addressed to another bot, stay quiet
    if (this.isAddressedToOtherBot(message)) {
      return { respond: false };
    }
    
    // Check topic relevance with CONTEXT
    const topicCheck = this.isTopicRelevant(content, context);
    
    // Base probability based on mood
    let probability = this.mood.talkative * 0.12; // Max ~10% base
    
    // Boost for relevant topics
    if (topicCheck.relevant) {
      if (topicCheck.strength === 'high') probability += 0.30;
      else if (topicCheck.strength === 'medium') probability += 0.18;
      else probability += 0.08;
    }
    
    // Questions are more engaging
    if (content.includes('?')) probability += 0.08;
    
    // Energy affects engagement
    probability *= (this.energy / 100);
    
    // Familiarity with user
    const familiarity = this.userFamiliarity.get(message.author.id) || 0;
    if (familiarity > 20) probability += 0.04;
    
    // Active conversation boost
    const recentMessages = this.recentMessages.get(message.channel.id) || [];
    const lastFiveMin = recentMessages.filter(m => Date.now() - m.timestamp < 5 * 60 * 1000);
    if (lastFiveMin.length > 8) probability += 0.08;
    
    // Cap it
    probability = Math.min(probability, 0.5);
    
    // Roll
    if (Math.random() < probability) {
      return {
        respond: true,
        reason: topicCheck.relevant ? 'relevant_topic' : 'random_chat',
        priority: topicCheck.strength === 'high' ? 'high' : 'medium',
        topics: topicCheck.topics
      };
    }
    
    return { respond: false };
  }

  // Generate response with full context
  async generateResponse(message, reason, priority, topics = []) {
    const conversationContext = this.getConversationContext(message.channel.id);
    const familiarity = this.userFamiliarity.get(message.author.id) || 0;
    
    // Determine response style based on mood
    let lengthGuidance = '';
    if (this.mood.responseLength === 'short') {
      lengthGuidance = 'Keep it SHORT. One line, maybe two. Like texting.';
    } else if (this.mood.responseLength === 'long') {
      lengthGuidance = 'You can be more detailed if you want, but stay natural.';
    } else {
      lengthGuidance = 'Natural length - could be one word, could be a few sentences. Whatever fits.';
    }

    const contextPrompt = `
CURRENT STATE:
- Channel: #${message.channel.name}
- Your mood: ${this.mood.name}
- Energy: ${Math.round(this.energy)}%
- Why responding: ${reason}
- Relevant topics detected: ${topics.join(', ') || 'general chat'}
- How well you know ${message.author.username}: ${familiarity > 50 ? 'pretty well' : familiarity > 20 ? 'a bit' : 'not really'}

RECENT CHAT:
${conversationContext || '[No recent messages]'}

MESSAGE YOU'RE RESPONDING TO:
${message.author.username}: ${message.content}

RESPONSE GUIDELINES:
- ${lengthGuidance}
- Sound like a REAL PERSON, not a bot
- DON'T start with their name unless it's natural
- DON'T be overly helpful or customer-service-y
- You can be short, you can be longer, you can just react
- Match the energy of the conversation
- If it's casual chat, be casual
- If someone asked something specific, answer it
- You don't HAVE to help - you're just hanging out

${reason === 'random_chat' ? "You're just jumping into chat because you felt like it. Keep it natural." : ''}
${reason === 'overheard_name' ? "You overheard your name but they weren't talking to you. React naturally." : ''}
`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: this.systemPrompt,
        messages: [{ role: 'user', content: contextPrompt }]
      });

      let text = response.content[0].text;
      
      // Clean up any AI-isms
      text = text.replace(/^(I |As |Since |Well, |Hmm, let me |Let me )/i, '');
      text = text.replace(/\*adjusts\*/gi, '');
      text = text.replace(/\*clears throat\*/gi, '');
      
      return text;
    } catch (error) {
      console.error('FreeRoam response error:', error);
      return null;
    }
  }

  async sendResponse(message, text) {
    if (!text) return;
    
    // Realistic typing delay - faster for short messages
    const baseDelay = Math.min(text.length * 25, 4000);
    const variance = Math.random() * 1000;
    const typingDelay = Math.max(baseDelay + variance, 800);
    
    await message.channel.sendTyping();
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    
    // Split long messages
    if (text.length > 2000) {
      const chunks = text.match(/[\s\S]{1,1900}/g);
      for (const chunk of chunks) {
        await message.channel.send(chunk);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } else {
      await message.channel.send(text);
    }
    
    this.recordResponse(message.channel.id);
  }
}

module.exports = FreeRoamSystem;
