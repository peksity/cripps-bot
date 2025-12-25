/**
 * ██████╗ ██████╗  ██████╗  █████╗  ██████╗████████╗██╗██╗   ██╗███████╗
 * ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██║██║   ██║██╔════╝
 * ██████╔╝██████╔╝██║   ██║███████║██║        ██║   ██║██║   ██║█████╗  
 * ██╔═══╝ ██╔══██╗██║   ██║██╔══██║██║        ██║   ██║╚██╗ ██╔╝██╔══╝  
 * ██║     ██║  ██║╚██████╔╝██║  ██║╚██████╗   ██║   ██║ ╚████╔╝ ███████╗
 * ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚═╝  ╚═══╝  ╚══════╝
 * 
 * PROACTIVE SYSTEM
 * 
 * Bots don't just respond - they START conversations
 * - Random thoughts dropped in chat
 * - Bot-to-bot banter
 * - Reactions to server events
 * - Noticing patterns and commenting
 * - Bringing up old topics
 */

const Anthropic = require('@anthropic-ai/sdk');

class ProactiveSystem {
  constructor(config = {}) {
    this.hiveMind = config.hiveMind;
    this.memoryCore = config.memoryCore;
    this.anthropic = config.anthropic || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    this.lastProactiveMessage = 0;
    this.scheduledEvents = [];
    
    // Proactive message types
    this.messageTypes = [
      'random_thought',
      'bot_banter',
      'callback_reference',
      'observation',
      'question_to_chat',
      'reaction_to_quiet',
      'time_based_comment'
    ];
    
    // Bot-specific random thoughts
    this.randomThoughts = {
      lester: [
        "you know what i hate? people who dont read instructions",
        "been running diagnostics all day. everything's compromised. as usual.",
        "sometimes i wonder if anyone here actually knows what theyre doing",
        "the security in this server is... concerning",
        "anyone else notice how quiet it gets when im actually trying to work",
        "i swear if one more person asks me something they could google",
        "2am and im still here. some things never change"
      ],
      pavel: [
        "ah, is quiet like submarine at night. peaceful, yes?",
        "kapitan, you know what Pavel is thinking about? pink diamond. always pink diamond",
        "the kosatka needs maintenance but here i am, chatting",
        "sometimes i miss the old country. then i remember the money here",
        "anyone want to hear story about the time i escaped from-... actually, nevermind",
        "drainage tunnel. is always drainage tunnel. why people complicate things"
      ],
      cripps: [
        "did i ever tell you about the time i... actually, you wouldnt believe me anyway",
        "*adjusts hat* sure is quiet around here",
        "back in my day we didnt have all these fancy... whatever this is",
        "that damn dog keeps looking at me",
        "you know what makes good leather? patience. and the right knife.",
        "reminds me of the tennessee job. dont ask."
      ],
      chief: [
        "keeping my eye on things. always watching.",
        "too quiet. i dont trust quiet.",
        "seen a lot of outlaws come through here. most of em learned respect eventually",
        "justice doesnt sleep. neither do i, apparently.",
        "you know what separates the good hunters from the dead ones? patience.",
        "interesting activity in here lately. interesting."
      ],
      nazar: [
        "the spirits are restless tonight...",
        "i sense... something approaching. or perhaps nothing. the veil is thin.",
        "someone here will find unexpected fortune soon. the cards never lie.",
        "fate has a strange sense of humor, does it not?",
        "madam nazar sees all. remembers all.",
        "the moon is in an interesting position tonight..."
      ]
    };
    
    // Bot-to-bot conversation starters
    this.botBanterStarters = {
      'lester_pavel': [
        { from: 'lester', text: "pavel, how many times have you run that heist now? thousands?" },
        { from: 'pavel', text: "lester my friend, when did you last leave that room of yours?" },
        { from: 'lester', text: "at least your submarine has better security than half the setups i see" }
      ],
      'lester_cripps': [
        { from: 'lester', text: "cripps please tell me youre not about to start another story" },
        { from: 'cripps', text: "lester you spend all day on them computers. cant be healthy" },
        { from: 'lester', text: "your 'business partner' stories are statistically impossible btw" }
      ],
      'lester_chief': [
        { from: 'chief', text: "lester. i know youre up to something" },
        { from: 'lester', text: "chief dont you have actual criminals to chase" },
        { from: 'chief', text: "one of these days lester. one of these days." }
      ],
      'pavel_cripps': [
        { from: 'pavel', text: "ah cripps! tell me another story about old days" },
        { from: 'cripps', text: "pavel my friend, you ever think about life on land?" },
        { from: 'pavel', text: "is true you wrestled alligator? pavel must hear this" }
      ],
      'cripps_nazar': [
        { from: 'cripps', text: "nazar... where exactly did you learn all that fortune telling" },
        { from: 'nazar', text: "cripps, the cards have been asking about you..." },
        { from: 'cripps', text: "you know madam, ive been meaning to ask about... nevermind" }
      ],
      'chief_nazar': [
        { from: 'chief', text: "nazar, that fortune telling business of yours licensed?" },
        { from: 'nazar', text: "chief... i foresee paperwork in your future. much paperwork." },
        { from: 'chief', text: "one day youll tell me how you know things before they happen" }
      ]
    };
  }

  /**
   * Initialize the proactive system
   */
  initialize(bots) {
    this.bots = bots;
    
    // Start the proactive loop
    this.startProactiveLoop();
    
    console.log('[PROACTIVE] System initialized');
  }

  /**
   * Main proactive loop - runs every few minutes
   */
  startProactiveLoop() {
    // Check every 5 minutes
    setInterval(async () => {
      await this.checkForProactiveAction();
    }, 5 * 60 * 1000);
    
    // Also check on startup after delay
    setTimeout(() => this.checkForProactiveAction(), 60000);
  }

  /**
   * Decide if and what proactive action to take
   */
  async checkForProactiveAction() {
    const now = Date.now();
    
    // Minimum 20 minutes between proactive messages
    if (now - this.lastProactiveMessage < 20 * 60 * 1000) {
      return;
    }
    
    // 15% chance every check
    if (Math.random() > 0.15) {
      return;
    }
    
    // Pick random action type
    const actionType = this.messageTypes[Math.floor(Math.random() * this.messageTypes.length)];
    
    await this.executeProactiveAction(actionType);
    this.lastProactiveMessage = now;
  }

  /**
   * Execute a proactive action
   */
  async executeProactiveAction(actionType) {
    switch (actionType) {
      case 'random_thought':
        await this.sendRandomThought();
        break;
      case 'bot_banter':
        await this.startBotBanter();
        break;
      case 'time_based_comment':
        await this.sendTimeBasedComment();
        break;
      case 'reaction_to_quiet':
        await this.reactToQuiet();
        break;
      default:
        await this.sendRandomThought();
    }
  }

  /**
   * Send a random thought from a bot
   */
  async sendRandomThought() {
    // Pick random bot
    const botIds = Object.keys(this.randomThoughts);
    const botId = botIds[Math.floor(Math.random() * botIds.length)];
    const thoughts = this.randomThoughts[botId];
    const thought = thoughts[Math.floor(Math.random() * thoughts.length)];
    
    await this.sendProactiveMessage(botId, thought);
  }

  /**
   * Start bot-to-bot banter
   */
  async startBotBanter() {
    const banterKeys = Object.keys(this.botBanterStarters);
    const key = banterKeys[Math.floor(Math.random() * banterKeys.length)];
    const starters = this.botBanterStarters[key];
    const starter = starters[Math.floor(Math.random() * starters.length)];
    
    // Send the initial message
    await this.sendProactiveMessage(starter.from, starter.text);
    
    // Schedule a response from the other bot (after delay)
    const [bot1, bot2] = key.split('_');
    const responder = starter.from === bot1 ? bot2 : bot1;
    
    setTimeout(async () => {
      const response = await this.generateBanterResponse(responder, starter.from, starter.text);
      if (response) {
        await this.sendProactiveMessage(responder, response);
      }
    }, 5000 + Math.random() * 10000); // 5-15 second delay
  }

  /**
   * Generate a response in bot banter
   */
  async generateBanterResponse(responderId, initiatorId, initiatorMessage) {
    const personalities = {
      lester: 'snarky genius hacker, short responses',
      pavel: 'friendly submarine captain, slight accent',
      cripps: 'grumpy old frontiersman, trailing stories',
      chief: 'stern lawman, suspicious of everyone',
      nazar: 'mystical fortune teller, cryptic'
    };
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 60,
        system: `You are ${responderId}. ${personalities[responderId]}. 
Respond to ${initiatorId}'s message in ONE short sentence. Be casual, like friends chatting. No roleplay actions.`,
        messages: [{ role: 'user', content: `${initiatorId} said: "${initiatorMessage}"` }]
      });
      
      return response.content[0].text;
    } catch (e) {
      return null;
    }
  }

  /**
   * Send time-based comment
   */
  async sendTimeBasedComment() {
    const hour = new Date().getHours();
    let comment = null;
    let botId = null;
    
    if (hour >= 0 && hour < 5) {
      // Late night
      const options = [
        { bot: 'lester', text: "why is anyone still awake. go to sleep" },
        { bot: 'pavel', text: "ah, late night crew. pavel respects the dedication" },
        { bot: 'chief', text: "nothing good happens this late. trust me." },
        { bot: 'cripps', text: "reminds me of night watches back in the day..." }
      ];
      const pick = options[Math.floor(Math.random() * options.length)];
      comment = pick.text;
      botId = pick.bot;
    } else if (hour >= 5 && hour < 9) {
      // Early morning
      const options = [
        { bot: 'cripps', text: "early bird gets the goods. or something like that" },
        { bot: 'pavel', text: "good morning! kosatka is ready for new day!" },
        { bot: 'chief', text: "morning patrol. eyes open." }
      ];
      const pick = options[Math.floor(Math.random() * options.length)];
      comment = pick.text;
      botId = pick.bot;
    }
    
    if (comment && botId) {
      await this.sendProactiveMessage(botId, comment);
    }
  }

  /**
   * React to quiet server
   */
  async reactToQuiet() {
    const options = [
      { bot: 'lester', text: "finally some peace and quiet" },
      { bot: 'pavel', text: "is very quiet... too quiet?" },
      { bot: 'cripps', text: "*looks around* everyone dead or something?" },
      { bot: 'chief', text: "quiet night. i dont trust it." },
      { bot: 'nazar', text: "the spirits rest... for now" }
    ];
    
    const pick = options[Math.floor(Math.random() * options.length)];
    await this.sendProactiveMessage(pick.bot, pick.text);
  }

  /**
   * Send a proactive message through the appropriate bot
   */
  async sendProactiveMessage(botId, content) {
    // Get the bot's client
    const bot = this.bots?.get(botId);
    if (!bot?.client) {
      console.log(`[PROACTIVE] Bot ${botId} not available`);
      return;
    }
    
    // Find general chat or appropriate channel
    const guild = bot.client.guilds.cache.first();
    if (!guild) return;
    
    const channel = guild.channels.cache.find(c => 
      c.name === 'general-chat' || 
      c.name === 'general' || 
      c.name === 'chat'
    );
    
    if (!channel) return;
    
    // Add typing delay for realism
    await channel.sendTyping();
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    
    try {
      await channel.send(content);
      console.log(`[PROACTIVE] ${botId}: "${content.substring(0, 50)}..."`);
      
      // Update hivemind
      if (this.hiveMind) {
        this.hiveMind.recordBotResponse(botId);
      }
    } catch (e) {
      console.error(`[PROACTIVE] Failed to send: ${e.message}`);
    }
  }

  /**
   * Trigger proactive response to an event
   */
  async onServerEvent(eventType, data) {
    // React to specific events
    switch (eventType) {
      case 'member_join':
        // Occasionally welcome new members
        if (Math.random() < 0.3) {
          const welcomes = [
            { bot: 'pavel', text: `welcome aboard, new friend!` },
            { bot: 'chief', text: `*eyes the newcomer* welcome. behave yourself.` },
            { bot: 'cripps', text: `fresh face around here. dont break anything.` }
          ];
          const pick = welcomes[Math.floor(Math.random() * welcomes.length)];
          // Would send to appropriate channel
        }
        break;
        
      case 'lfg_completed':
        // Comment on successful LFG
        if (Math.random() < 0.2) {
          const comments = [
            { bot: 'lester', text: `nice. efficient.` },
            { bot: 'pavel', text: `another successful heist! magnificent!` }
          ];
          // Would send to LFG channel
        }
        break;
    }
  }
}

module.exports = { ProactiveSystem };
