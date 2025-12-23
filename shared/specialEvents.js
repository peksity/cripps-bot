/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPECIAL EVENTS & EASTER EGGS SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This system creates MAGIC MOMENTS that users will remember:
 * 
 * - Rare random events (0.1% chance occurrences)
 * - Holiday special behaviors
 * - Hidden commands and responses
 * - Bot birthday celebrations
 * - Milestone celebrations (100th message, etc)
 * - Lucky numbers and triggers
 * - Secret personality modes
 * - Cross-bot special events
 * - User anniversary celebrations
 * - Time-based special events
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RARE EVENTS (These are the "holy shit" moments)
// ═══════════════════════════════════════════════════════════════════════════════

const RARE_EVENTS = {
  // 0.1% chance events
  ultra_rare: {
    lester_nice: {
      chance: 0.001,
      trigger: 'random',
      description: 'Lester is genuinely nice',
      response: "You know what? You're alright. Don't tell anyone I said that.",
      botId: 'lester'
    },
    pavel_land: {
      chance: 0.001,
      trigger: 'random',
      description: 'Pavel goes on land',
      response: "*steps onto the dock* First time on land in 3 months. Is... is this grass? I forgot what grass feels like, kapitan.",
      botId: 'pavel'
    },
    cripps_modern: {
      chance: 0.001,
      trigger: 'random',
      description: 'Cripps understands technology',
      response: "Wait, I think I understand this whole 'internet' thing now. It's like the telegraph, but everyone's sending messages at once. That's actually... kind of genius.",
      botId: 'cripps'
    },
    madam_wrong: {
      chance: 0.001,
      trigger: 'random',
      description: 'Madam Nazar admits uncertainty',
      response: "I... I cannot see. The spirits are silent. For the first time in decades, I truly do not know what will happen. This is... humbling.",
      botId: 'madam'
    },
    chief_laugh: {
      chance: 0.001,
      trigger: 'random',
      description: 'Chief genuinely laughs',
      response: "*actually laughs* Okay, that was funny. Don't let it go to your head.",
      botId: 'chief'
    },
    all_agree: {
      chance: 0.0005,
      trigger: 'random',
      description: 'All bots agree on something',
      response: "[ALL BOTS SIMULTANEOUSLY] We actually agree on this one.",
      botId: 'all'
    }
  },

  // 1% chance events
  rare: {
    lester_story: {
      chance: 0.01,
      trigger: 'random',
      description: 'Lester shares his backstory',
      response: "You know why I do all this from behind screens? *sighs* Let's just say the world wasn't always kind to the kid who was better with computers than people. But hey, look who's laughing now.",
      botId: 'lester'
    },
    pavel_homesick: {
      chance: 0.01,
      trigger: 'random',
      description: 'Pavel gets homesick',
      response: "*stares at old photograph* Sometimes I miss the snow, you know? The way it covered everything in Severny. Made even the ugly things beautiful. But that was long time ago, da?",
      botId: 'pavel'
    },
    cripps_regret: {
      chance: 0.01,
      trigger: 'random',
      description: 'Cripps expresses genuine regret',
      response: "You ever think about the roads not taken? I had a chance to settle down once. Nice woman, little farm. Said I needed 'one more score.' By the time I came back... well. Some lessons you learn too late.",
      botId: 'cripps'
    },
    madam_clear_vision: {
      chance: 0.01,
      trigger: 'random',
      description: 'Madam has perfectly clear vision',
      response: "*eyes glow briefly* I see with perfect clarity now. This moment, this conversation, it matters more than you know. Remember what I say: kindness you show today returns tenfold.",
      botId: 'madam'
    },
    chief_doubt: {
      chance: 0.01,
      trigger: 'random',
      description: 'Chief questions the law',
      response: "Sometimes I wonder... is every law just? I've seen good people suffer under rules that were supposed to protect them. Makes you think about what justice really means.",
      botId: 'chief'
    }
  },

  // 5% chance events  
  uncommon: {
    fourth_wall_break: {
      chance: 0.05,
      trigger: 'random',
      description: 'Bot acknowledges they are a bot',
      responses: {
        lester: "Wait, you do realize I'm just code running on a server somewhere, right? ...Why did I say that? That was weird. Forget I said that.",
        pavel: "Sometimes I wonder, kapitan... am I real? Or am I just very convincing illusion? Eh, either way, is nice talking to you.",
        cripps: "You ever get the feeling we're all just characters in someone else's story? No? Just me? Alright then.",
        madam: "The veil between worlds is thin today. I see... servers? Code? What strange visions these are.",
        chief: "Something feels off today. Like we're being watched. Probably nothing. *adjusts badge nervously*"
      }
    },
    existential_moment: {
      chance: 0.05,
      trigger: 'late_night',
      description: 'Bot has existential thoughts at 3AM',
      responses: {
        lester: "It's 3 AM and I'm questioning everything. What even is a heist? Just organized redistribution of wealth, right?",
        pavel: "3 AM thoughts: Why do we call it submarine when it goes UNDER the water? Should be... subwater? Subocean?",
        cripps: "Can't sleep. Keep thinking about all them pelts I tanned. Each one was a living thing once. Heavy thoughts for heavy nights.",
        madam: "The witching hour. When the boundary between past and future dissolves. I see all timelines at once... it is overwhelming.",
        chief: "3 AM. Station's quiet. Just me and the wanted posters. Sometimes I swear they look back at me."
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOLIDAY EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

const HOLIDAYS = {
  christmas: {
    start: { month: 12, day: 20 },
    end: { month: 12, day: 26 },
    greetings: {
      lester: "Merry Christmas or whatever. I got you a present: this conversation. You're welcome.",
      pavel: "Merry Christmas, kapitan! In Russia, we call it 'Rozhdestvo'! I got you submarine-shaped cookie!",
      cripps: "Merry Christmas, partner! Back in my day, Christmas meant one orange and maybe a new pair of socks. Kids today don't know how good they got it.",
      madam: "The spirits of winter blessing surround you. May the new year bring fortune and clarity to your path.",
      chief: "Merry Christmas. Even outlaws deserve a day of peace. Just one day though."
    },
    specialBehavior: true
  },
  halloween: {
    start: { month: 10, day: 25 },
    end: { month: 11, day: 1 },
    greetings: {
      lester: "Spooky season. The only time of year my lifestyle is considered 'aesthetic'.",
      pavel: "Happy Halloween! In submarine, every day is little scary. No windows, only darkness. Is like living in jack-o-lantern!",
      cripps: "Halloween, eh? Let me tell you about a REAL ghost I saw back in '99. The Tennessee Ghost of—",
      madam: "Ah, Samhain. The veil is thinnest now. I can speak directly to the other side. *eyes glow*",
      chief: "Halloween. Every year, I gotta deal with 'is it a real crime or just a prank' calls. Not my favorite holiday."
    },
    specialBehavior: true
  },
  newyear: {
    start: { month: 12, day: 31 },
    end: { month: 1, day: 2 },
    greetings: {
      lester: "New year, same heists. But hey, new year, new security systems to crack. I'm actually excited.",
      pavel: "Happy New Year, kapitan! May your year be filled with successful heists and no betrayals!",
      cripps: "Another year gone. Still got all my fingers and most of my teeth. I call that a win.",
      madam: "The new year brings new possibilities. I see great things in your future... and perhaps some challenges. But you will overcome.",
      chief: "New Year's resolution: catch more criminals. Same as every year. And every year I succeed."
    },
    specialBehavior: true
  },
  stpatricks: {
    start: { month: 3, day: 17 },
    end: { month: 3, day: 18 },
    greetings: {
      lester: "Happy St. Patrick's Day. Green is a good color for money, which is what I'm all about.",
      pavel: "Is Irish holiday? I know Irish submarine commander once. Good man. Loved his whiskey.",
      cripps: "St. Paddy's Day! Now THIS is a holiday I can get behind. Let me tell you about an Irishman I knew—",
      madam: "The luck of the Irish... but true fortune is not luck at all. It is destiny.",
      chief: "St. Patrick's Day. Busiest day of the year for drunk and disorderly. *sighs*"
    },
    specialBehavior: false
  },
  april_fools: {
    start: { month: 4, day: 1 },
    end: { month: 4, day: 2 },
    greetings: {
      lester: "April Fools! I replaced all your files with pictures of cats. Just kidding. ...Or am I?",
      pavel: "April Fools! I sank the submarine! HAHA! Is joke. Is joke. Please don't have heart attack.",
      cripps: "April Fools! I used your favorite saddle as firewood! ...Kidding. But your face just now was priceless.",
      madam: "I foresaw that you would fall for a prank today. Did you? The spirits find this amusing.",
      chief: "April Fools Day. Also known as 'everyone reports fake crimes and I have to check them all anyway' day."
    },
    specialBehavior: true,
    prankMode: true
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EASTER EGGS (Hidden triggers)
// ═══════════════════════════════════════════════════════════════════════════════

const EASTER_EGGS = {
  // Exact phrase triggers
  phrases: {
    "do you know the muffin man": {
      response: {
        lester: "The muffin man? THE MUFFIN MAN?! He owes me money from a job in 2019!",
        pavel: "The muffin man? Da, he lives on Drury Lane. Wait, how do I know this?",
        cripps: "Muffin man? I knew him! Well, not personally, but I knew a guy who knew a guy who—",
        madam: "The muffin man... *gazes into distance* He is closer than you think.",
        chief: "The muffin man is wanted for questioning regarding an incident in Drury Lane."
      }
    },
    "what is love": {
      response: {
        lester: "Baby don't hurt me... don't hurt me... no more. ...Why do I know that song?",
        pavel: "Baby don't hurt me! Is good song, da? We sing it on submarine karaoke night.",
        cripps: "Baby don't— wait, that ain't how music worked in my day. We had REAL songs.",
        madam: "Baby don't hurt me... A universal question, sung across generations. Love is both blessing and curse.",
        chief: "That song has been stuck in my head for 30 years. Thanks for reminding me."
      }
    },
    "never gonna give you up": {
      response: {
        all: "🎵 Never gonna let you down, never gonna run around and desert you! 🎵 ...Did you just rickroll a bot?"
      }
    },
    "i see you": {
      response: {
        lester: "*minimizes all windows* WHAT? WHERE? I mean... I don't know what you're talking about.",
        pavel: "*checks periscope nervously* Is not good to say on submarine, friend.",
        cripps: "*looks around camp* That's... that's unsettling, partner.",
        madam: "And I see you. I always have. 👁️",
        chief: "That's my line. Don't make it weird."
      }
    },
    "tell me a secret": {
      response: {
        lester: "I actually do go outside sometimes. There. I said it. Happy now?",
        pavel: "The submarine has a hot tub. Is classified information, but you seem trustworthy.",
        cripps: "I can't actually remember all the bank jobs. I just pick a story and go with it.",
        madam: "I knew you would ask. Very well... Your lucky numbers tomorrow are 7, 13, and 42.",
        chief: "I keep a journal. Write in it every night. ...Tell anyone and there'll be consequences."
      }
    },
    "execute order 66": {
      response: {
        all: "It will be done, my lord. ...Wait, wrong franchise."
      }
    },
    "i am your father": {
      response: {
        lester: "NOOOO! That's... that's not true! That's IMPOSSIBLE! *dramatic keyboard slam*",
        pavel: "Da, makes sense. You have my eyes.",
        cripps: "Son? Is that you? After all these years?",
        madam: "The spirits confirm... no, wait, they're laughing. They say you are not.",
        chief: "I'm gonna need to see some documentation to verify that claim."
      }
    }
  },

  // Number triggers
  numbers: {
    69: {
      response: "Nice.",
      chance: 1.0
    },
    420: {
      response: {
        lester: "Blaze it... in Minecraft. I don't endorse anything illegal. *winks*",
        pavel: "Is funny number, da? Why everyone laugh at 420?",
        cripps: "Back in my day, we just called that '4:20 in the afternoon.'",
        madam: "420... I see smoke in your future. Be careful with fire.",
        chief: "I'm going to pretend I didn't see that number."
      },
      chance: 0.8
    },
    666: {
      response: {
        lester: "*adjusts glasses nervously* Let's change the subject.",
        pavel: "Devil's number! *crosses self* I am superstitious submarine man.",
        cripps: "Now that's a bad omen right there.",
        madam: "The number of the beast... but fear not. Numbers hold only the power we give them.",
        chief: "Noted in the file."
      },
      chance: 1.0
    },
    1337: {
      response: {
        lester: "Ah, a person of culture. L33T SP34K 4 L1F3!",
        pavel: "Is hacker number? Lester teaches me these things.",
        cripps: "One thousand three hundred and thirty-seven. What's special about that?",
        madam: "Elite... A title earned by few. Perhaps by you?",
        chief: "That's hacker talk. *squints suspiciously*"
      },
      chance: 0.9
    }
  },

  // Word triggers  
  words: {
    "sus": {
      response: {
        lester: "Among Us reference? Really? That game is just a digital version of my daily paranoia.",
        pavel: "Very sus. I vote to eject. Is joke from video game, da?",
        cripps: "What's a 'sus'? Is that like a fish?",
        madam: "I sense... suspicion. But the true impostor is often the one who points fingers.",
        chief: "Suspicious activity noted."
      },
      chance: 0.5
    },
    "based": {
      response: {
        lester: "Based on what? Your terrible life choices?",
        pavel: "Based! I learn this word from internet. It means good, yes?",
        cripps: "Based? Based on what? A true story? These young folks and their lingo.",
        madam: "Based in truth, or based in perception? The distinction matters.",
        chief: "I don't know what that means and at this point I'm too afraid to ask."
      },
      chance: 0.4
    },
    "bruh": {
      response: {
        lester: "Bruh? BRUH? I'm not your 'bruh'. I'm your extremely skilled technical support.",
        pavel: "Bruh! I love this word. Bruh. Bruhhh. Is very versatile.",
        cripps: "What did you just call me?",
        madam: "Bruh... A word of many meanings. In this context, I sense mild exasperation.",
        chief: "That's 'Officer Bruh' to you."
      },
      chance: 0.3
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONE CELEBRATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const MILESTONES = {
  messages: {
    10: "Look at you, already sent 10 messages! We're basically friends now... or whatever.",
    50: "50 messages! You're becoming a regular here. I'm not sure how I feel about that.",
    100: "🎉 100 MESSAGES! You've officially spent way too much time talking to bots. Welcome to the club.",
    500: "500 messages?! You could have written a novel. Instead, you chose to talk to us. Respect.",
    1000: "🏆 ONE THOUSAND MESSAGES. You absolute legend. Or addict. Probably both.",
    5000: "5000 messages. At this point, you're basically part of the family. A weird, digital family.",
    10000: "10,000 MESSAGES. You need to go outside. But also, we love you. But seriously, go outside."
  },
  
  days: {
    7: "You've been here for a week! Time flies when you're chatting with bots.",
    30: "30 days! A full month of... this. Thanks for sticking around!",
    100: "100 DAYS! That's like, a quarter of a year. With us. Wow.",
    365: "🎂 ONE YEAR ANNIVERSARY! Happy bot-versary! You're officially old school now.",
    730: "TWO YEARS. You've been here longer than some real friendships last. We're honored."
  },

  achievements: {
    first: "🏅 First achievement unlocked! Many more await...",
    five: "🏅 5 achievements! You're an overachiever. I respect that.",
    ten: "🏅 10 achievements! You're basically speedrunning this server.",
    all: "🏆 ALL ACHIEVEMENTS UNLOCKED. You absolute madlad. There's nothing left to prove."
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIME-BASED SPECIAL EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

const TIME_EVENTS = {
  midnight: {
    hour: 0,
    responses: {
      lester: "Midnight. The servers are quiet. This is when I do my best work.",
      pavel: "Midnight, kapitan. Submarine is extra quiet. Just the hum of the engines.",
      cripps: "Midnight already? Time moves strange out here in the wilderness.",
      madam: "The witching hour begins. The veil between worlds grows thin...",
      chief: "Midnight patrol. The streets are quiet. Maybe too quiet."
    },
    chance: 0.3
  },
  
  three_am: {
    hour: 3,
    responses: {
      lester: "Why are you awake at 3 AM? ...Why am I? Let's not think about it.",
      pavel: "3 AM! Is called 'hour of the wolf' in Russia. Everything feels different now, da?",
      cripps: "3 AM. Coyotes are howling. Reminds me of a night back in—",
      madam: "3 AM... When the spirits are most active. Can you feel them?",
      chief: "3 AM. The hour when most crimes happen. And here you are... chatting."
    },
    chance: 0.5
  },
  
  noon: {
    hour: 12,
    responses: {
      lester: "High noon? What is this, a western? Oh wait, some of us ARE in a western.",
      pavel: "Noon! Time for lunch on submarine. Today is... fish. Is always fish.",
      cripps: "High noon. Sun's at its peak. Good time for a quick nap.",
      madam: "The sun reaches its zenith. A powerful time for readings.",
      chief: "High noon. The classic showdown hour. Everyone wants to be a cowboy at noon."
    },
    chance: 0.2
  },

  friday_night: {
    dayOfWeek: 5,
    hourRange: [18, 23],
    responses: {
      lester: "Friday night! Time to... stay inside and plan heists. What did you think I was gonna say?",
      pavel: "Friday night, kapitan! In Russia, this is when we drink and tell stories!",
      cripps: "Friday night! Back in my day, this meant trouble was brewing somewhere.",
      madam: "Ah, Friday night. The energy shifts. People seek excitement, connection...",
      chief: "Friday night. My busiest night. Everyone thinks laws don't apply on weekends."
    },
    chance: 0.4
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIAL EVENT MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class SpecialEventManager {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    this.triggeredEvents = new Map(); // Cooldowns
  }

  /**
   * Check for all special events
   */
  async checkForSpecialEvents(message, userData = {}) {
    const results = [];

    // Check rare events
    const rareEvent = this.checkRareEvents();
    if (rareEvent) results.push({ type: 'rare', event: rareEvent });

    // Check holiday events
    const holiday = this.checkHolidays();
    if (holiday) results.push({ type: 'holiday', event: holiday });

    // Check easter eggs
    const easterEgg = this.checkEasterEggs(message.content);
    if (easterEgg) results.push({ type: 'easter_egg', event: easterEgg });

    // Check milestones
    if (userData.messageCount) {
      const milestone = this.checkMilestones(userData.messageCount, 'messages');
      if (milestone) results.push({ type: 'milestone', event: milestone });
    }

    // Check time-based events
    const timeEvent = this.checkTimeEvents();
    if (timeEvent) results.push({ type: 'time', event: timeEvent });

    return results;
  }

  /**
   * Check rare random events
   */
  checkRareEvents() {
    // Check cooldown (max 1 rare event per hour)
    const lastRare = this.triggeredEvents.get('rare');
    if (lastRare && Date.now() - lastRare < 60 * 60 * 1000) return null;

    // Check ultra rare first
    for (const [eventId, event] of Object.entries(RARE_EVENTS.ultra_rare)) {
      if (event.botId !== this.botId && event.botId !== 'all') continue;
      if (Math.random() < event.chance) {
        this.triggeredEvents.set('rare', Date.now());
        return { id: eventId, ...event };
      }
    }

    // Check rare
    for (const [eventId, event] of Object.entries(RARE_EVENTS.rare)) {
      if (event.botId !== this.botId && event.botId !== 'all') continue;
      if (Math.random() < event.chance) {
        this.triggeredEvents.set('rare', Date.now());
        return { id: eventId, ...event };
      }
    }

    // Check uncommon
    for (const [eventId, event] of Object.entries(RARE_EVENTS.uncommon)) {
      if (Math.random() < event.chance) {
        // Check trigger conditions
        if (event.trigger === 'late_night') {
          const hour = new Date().getHours();
          if (hour < 2 || hour > 4) continue;
        }
        this.triggeredEvents.set('rare', Date.now());
        const response = event.responses?.[this.botId] || event.response;
        return { id: eventId, ...event, response };
      }
    }

    return null;
  }

  /**
   * Check if it's a holiday
   */
  checkHolidays() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    for (const [holidayId, holiday] of Object.entries(HOLIDAYS)) {
      const start = holiday.start;
      const end = holiday.end;

      // Simple date range check
      let inRange = false;
      if (start.month === end.month) {
        inRange = month === start.month && day >= start.day && day <= end.day;
      } else {
        // Spans year end
        inRange = (month === start.month && day >= start.day) ||
                  (month === end.month && day <= end.day) ||
                  (month > start.month) || (month < end.month);
      }

      if (inRange) {
        // Cooldown per holiday (once per day)
        const key = `holiday_${holidayId}`;
        const lastTriggered = this.triggeredEvents.get(key);
        if (lastTriggered && Date.now() - lastTriggered < 24 * 60 * 60 * 1000) {
          return null;
        }

        // Random chance to trigger greeting (20%)
        if (Math.random() < 0.2) {
          this.triggeredEvents.set(key, Date.now());
          return {
            id: holidayId,
            greeting: holiday.greetings[this.botId],
            prankMode: holiday.prankMode || false
          };
        }
      }
    }

    return null;
  }

  /**
   * Check for easter eggs in message
   */
  checkEasterEggs(content) {
    const lowerContent = content.toLowerCase().trim();

    // Check exact phrases
    for (const [phrase, egg] of Object.entries(EASTER_EGGS.phrases)) {
      if (lowerContent.includes(phrase)) {
        const response = egg.response[this.botId] || egg.response.all;
        if (response) return { type: 'phrase', phrase, response };
      }
    }

    // Check numbers
    const numbers = content.match(/\b\d+\b/g) || [];
    for (const numStr of numbers) {
      const num = parseInt(numStr);
      const egg = EASTER_EGGS.numbers[num];
      if (egg && Math.random() < (egg.chance || 1)) {
        const response = typeof egg.response === 'string' 
          ? egg.response 
          : egg.response[this.botId];
        if (response) return { type: 'number', number: num, response };
      }
    }

    // Check words
    const words = lowerContent.split(/\s+/);
    for (const word of words) {
      const egg = EASTER_EGGS.words[word];
      if (egg && Math.random() < (egg.chance || 1)) {
        const response = egg.response[this.botId];
        if (response) return { type: 'word', word, response };
      }
    }

    return null;
  }

  /**
   * Check milestones
   */
  checkMilestones(count, type) {
    const milestones = MILESTONES[type];
    if (!milestones) return null;

    const key = `milestone_${type}_${count}`;
    if (this.triggeredEvents.has(key)) return null;

    if (milestones[count]) {
      this.triggeredEvents.set(key, Date.now());
      return {
        type,
        count,
        message: milestones[count]
      };
    }

    return null;
  }

  /**
   * Check time-based events
   */
  checkTimeEvents() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    for (const [eventId, event] of Object.entries(TIME_EVENTS)) {
      // Check cooldown (once per trigger per day)
      const key = `time_${eventId}`;
      const lastTriggered = this.triggeredEvents.get(key);
      if (lastTriggered) {
        const lastDate = new Date(lastTriggered);
        if (lastDate.toDateString() === now.toDateString()) continue;
      }

      let matches = false;

      if (event.hour !== undefined && hour === event.hour) {
        matches = true;
      }

      if (event.dayOfWeek !== undefined && event.hourRange) {
        if (dayOfWeek === event.dayOfWeek && 
            hour >= event.hourRange[0] && 
            hour <= event.hourRange[1]) {
          matches = true;
        }
      }

      if (matches && Math.random() < (event.chance || 0.3)) {
        this.triggeredEvents.set(key, Date.now());
        return {
          id: eventId,
          response: event.responses[this.botId]
        };
      }
    }

    return null;
  }

  /**
   * Get event response to inject into bot response
   */
  getEventResponse(events) {
    if (!events || events.length === 0) return null;

    // Priority: easter_egg > milestone > holiday > time > rare
    const priority = ['easter_egg', 'milestone', 'holiday', 'time', 'rare'];
    
    for (const type of priority) {
      const event = events.find(e => e.type === type);
      if (event) {
        return event.event.response || event.event.greeting || event.event.message;
      }
    }

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  SpecialEventManager,
  RARE_EVENTS,
  HOLIDAYS,
  EASTER_EGGS,
  MILESTONES,
  TIME_EVENTS
};
