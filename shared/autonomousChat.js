/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADVANCED AUTONOMOUS CHAT SYSTEM v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Makes bots feel ALIVE:
 * - Time-based moods (morning grumpy, night chill)
 * - Activity awareness (quiet server = more active bots)
 * - Topic chains (bots continue conversations)
 * - Bot debates and disagreements
 * - Inside jokes between bots
 * - Memory of recent discussions
 * - Event reactions (voice joins, new roles, etc.)
 * - Seasonal/time awareness
 * - Server activity monitoring
 * - Relationship dynamics between bots
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKING SYSTEMS
// ═══════════════════════════════════════════════════════════════════════════════

const lastBotMessage = new Map(); // channelId -> { timestamp, botId, content }
const lastAutonomousChat = new Map(); // botId -> timestamp
const recentTopics = new Map(); // channelId -> [{ topic, botId, timestamp }]
const botMoods = new Map(); // botId -> { mood, intensity, since }
const ongoingConversations = new Map(); // channelId -> { participants: [], topic, messageCount, lastMessage }
const serverActivity = new Map(); // guildId -> { messagesLastHour, activeUsers, lastUpdate }
const botRelationships = new Map(); // `${bot1}-${bot2}` -> { friendliness, recentInteractions, lastTopic }

// ═══════════════════════════════════════════════════════════════════════════════
// TIME & MOOD SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const TIME_PERIODS = {
  EARLY_MORNING: { start: 5, end: 8, mood: 'groggy', energy: 0.3 },
  MORNING: { start: 8, end: 12, mood: 'alert', energy: 0.7 },
  AFTERNOON: { start: 12, end: 17, mood: 'productive', energy: 0.8 },
  EVENING: { start: 17, end: 21, mood: 'relaxed', energy: 0.6 },
  NIGHT: { start: 21, end: 24, mood: 'chill', energy: 0.4 },
  LATE_NIGHT: { start: 0, end: 5, mood: 'tired', energy: 0.2 }
};

const BOT_MOOD_MODIFIERS = {
  lester: {
    groggy: { irritability: 0.8, helpfulness: 0.3, sarcasm: 0.9 },
    alert: { irritability: 0.5, helpfulness: 0.7, sarcasm: 0.6 },
    productive: { irritability: 0.3, helpfulness: 0.9, sarcasm: 0.4 },
    relaxed: { irritability: 0.4, helpfulness: 0.6, sarcasm: 0.7 },
    chill: { irritability: 0.2, helpfulness: 0.5, sarcasm: 0.8 },
    tired: { irritability: 0.9, helpfulness: 0.2, sarcasm: 0.5 }
  },
  pavel: {
    groggy: { optimism: 0.4, enthusiasm: 0.3, helpfulness: 0.5 },
    alert: { optimism: 0.8, enthusiasm: 0.7, helpfulness: 0.9 },
    productive: { optimism: 0.9, enthusiasm: 0.9, helpfulness: 1.0 },
    relaxed: { optimism: 0.7, enthusiasm: 0.5, helpfulness: 0.7 },
    chill: { optimism: 0.6, enthusiasm: 0.4, helpfulness: 0.6 },
    tired: { optimism: 0.3, enthusiasm: 0.2, helpfulness: 0.4 }
  },
  cripps: {
    groggy: { grumpiness: 0.9, storytelling: 0.3, nostalgia: 0.5 },
    alert: { grumpiness: 0.5, storytelling: 0.6, nostalgia: 0.7 },
    productive: { grumpiness: 0.3, storytelling: 0.4, nostalgia: 0.5 },
    relaxed: { grumpiness: 0.4, storytelling: 0.9, nostalgia: 0.8 },
    chill: { grumpiness: 0.3, storytelling: 0.8, nostalgia: 0.9 },
    tired: { grumpiness: 0.8, storytelling: 0.2, nostalgia: 0.4 }
  },
  madam: {
    groggy: { mysticism: 0.5, clarity: 0.3, warmth: 0.4 },
    alert: { mysticism: 0.7, clarity: 0.8, warmth: 0.6 },
    productive: { mysticism: 0.6, clarity: 0.9, warmth: 0.7 },
    relaxed: { mysticism: 0.9, clarity: 0.6, warmth: 0.8 },
    chill: { mysticism: 0.8, clarity: 0.5, warmth: 0.9 },
    tired: { mysticism: 0.4, clarity: 0.2, warmth: 0.3 }
  },
  chief: {
    groggy: { sternness: 0.9, patience: 0.2, authority: 0.7 },
    alert: { sternness: 0.7, patience: 0.6, authority: 0.9 },
    productive: { sternness: 0.6, patience: 0.8, authority: 0.8 },
    relaxed: { sternness: 0.4, patience: 0.7, authority: 0.6 },
    chill: { sternness: 0.3, patience: 0.8, authority: 0.5 },
    tired: { sternness: 0.8, patience: 0.3, authority: 0.6 }
  }
};

function getCurrentTimePeriod() {
  const hour = new Date().getHours();
  for (const [period, config] of Object.entries(TIME_PERIODS)) {
    if (config.start <= hour && hour < config.end) {
      return { period, ...config };
    }
    if (config.start > config.end && (hour >= config.start || hour < config.end)) {
      return { period, ...config };
    }
  }
  return { period: 'AFTERNOON', mood: 'productive', energy: 0.8 };
}

function getBotMood(botId) {
  const timePeriod = getCurrentTimePeriod();
  const modifiers = BOT_MOOD_MODIFIERS[botId] || BOT_MOOD_MODIFIERS.lester;
  const moodConfig = modifiers[timePeriod.mood] || {};
  
  return {
    period: timePeriod.period,
    baseMood: timePeriod.mood,
    energy: timePeriod.energy,
    ...moodConfig
  };
}

function getMoodDescription(botId) {
  const mood = getBotMood(botId);
  const descriptions = {
    lester: {
      groggy: "barely functioning, extra irritable",
      alert: "sharp and focused, moderate sarcasm",
      productive: "actually helpful for once",
      relaxed: "laid back but still sarcastic",
      chill: "surprisingly mellow",
      tired: "done with everyone's nonsense"
    },
    pavel: {
      groggy: "still waking up, quieter than usual",
      alert: "bright and enthusiastic",
      productive: "ready for any heist, maximum energy",
      relaxed: "calm seas, peaceful mood",
      chill: "enjoying the quiet moments",
      tired: "needs sleep but still friendly"
    },
    cripps: {
      groggy: "grumpier than usual, avoid if possible",
      alert: "moderately sociable",
      productive: "focused on camp duties",
      relaxed: "story time mode activated",
      chill: "reminiscing about the old days",
      tired: "complaining more than usual"
    },
    madam: {
      groggy: "visions are cloudy",
      alert: "spirits are clear",
      productive: "the cards reveal much",
      relaxed: "at peace with the cosmos",
      chill: "mystical energy flows freely",
      tired: "the spirits rest"
    },
    chief: {
      groggy: "short temper, stay in line",
      alert: "vigilant and watchful",
      productive: "justice never sleeps",
      relaxed: "slightly less stern",
      chill: "off-duty energy",
      tired: "still watching, just quietly"
    }
  };
  
  return descriptions[botId]?.[mood.baseMood] || "neutral";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASSIVE CONVERSATION STARTERS BY BOT AND MOOD
// ═══════════════════════════════════════════════════════════════════════════════

const CONVERSATION_STARTERS = {
  lester: {
    groggy: [
      "ugh... anyone got coffee",
      "why am i awake",
      "whoever's making noise, stop",
      "i swear if someone asks me about a heist right now",
      "my head hurts just looking at this chat",
      "five more minutes...",
      "the screens are too bright",
      "don't talk to me yet"
    ],
    alert: [
      "alright, let's see what disasters need fixing today",
      "anyone actually making money or just wasting time",
      "i've got eyes on everything, just so you know",
      "the markets are moving... interesting",
      "so who needs my expertise today",
      "i've been running the numbers",
      "something's off... i can feel it",
      "check your equipment, people"
    ],
    productive: [
      "okay here's the plan for today",
      "i've optimized three different approaches",
      "the window of opportunity is now",
      "anyone ready to actually get something done",
      "i've found a vulnerability we can exploit",
      "the setup is perfect, we just need execution",
      "intel is coming in hot",
      "this is the most efficient route"
    ],
    relaxed: [
      "you know what, today wasn't terrible",
      "anyone else just... existing",
      "the chaos can wait",
      "sometimes you gotta appreciate the quiet",
      "almost feels peaceful for once",
      "don't ruin the vibe",
      "taking a mental break, don't @ me",
      "alright, i'll admit it, you people aren't the worst"
    ],
    chill: [
      "late night crew, what's up",
      "the city looks different at night",
      "anyone else can't sleep",
      "night shift thoughts hitting different",
      "it's quieter now... i like it",
      "moon's out, schemes out",
      "the nocturnal grind",
      "who else is a night owl"
    ],
    tired: [
      "i should be asleep",
      "why am i still here",
      "everyone just... be quiet",
      "my brain is at 10%",
      "tomorrow's problem is tomorrow's problem",
      "i can't process anything right now",
      "signing off soon, don't do anything stupid",
      "the screens are blurring together"
    ],
    heist_related: [
      "speaking of scores, anyone got intel",
      "the vault's been restocked, just saying",
      "i've mapped out a new approach",
      "security rotations changed, heads up",
      "the take could be substantial"
    ],
    money_related: [
      "the economy's shifting",
      "smart money moves right now",
      "who's actually investing properly",
      "passive income is underrated",
      "diversify, people"
    ],
    bored: [
      "this chat is dead",
      "anyone alive in here",
      "hello? echo?",
      "guess i'm talking to myself",
      "*taps microphone* is this thing on"
    ]
  },
  
  pavel: {
    groggy: [
      "ah... good morning... i think",
      "the coffee on submarine is not so good today",
      "kapitan? anyone?",
      "my eyes, they do not want to open",
      "perhaps i stay in bunk little longer",
      "the sea is calm... i am not",
      "is too early for heist talk",
      "*yawns in russian*"
    ],
    alert: [
      "ah kapitan! the day is beautiful, no?",
      "i have been checking the periscope - all clear!",
      "the kosatka, she purrs like happy kitten today",
      "who is ready for adventure on the high seas",
      "el rubio's guards look sleepy, perfect timing",
      "i have plotted three new approach routes",
      "the water is perfect temperature for infiltration",
      "sonar shows nothing but opportunity"
    ],
    productive: [
      "today we make el rubio cry, yes?",
      "i have prepared everything, kapitan",
      "the submarine is fueled, weapons are ready",
      "this could be our biggest score yet",
      "i see the island clearly, the time is now",
      "all systems operational, waiting for green light",
      "the drainage tunnel is calling to us",
      "compound security has gap at northwest wall"
    ],
    relaxed: [
      "ah, the sunset over the ocean...",
      "sometimes i miss the old country, but this is good too",
      "the crew has worked hard, we deserve rest",
      "i make special borscht tonight, anyone hungry?",
      "the waves, they tell stories if you listen",
      "is nice to just float sometimes",
      "my grandmother would love this view",
      "peace and quiet on the kosatka"
    ],
    chill: [
      "the stars over the ocean, kapitan... magnificent",
      "night diving is underrated",
      "i hear dolphins talking to each other",
      "the submarine lights attract interesting fish",
      "somewhere out there, el rubio sleeps... we do not",
      "midnight snack on deck, anyone?",
      "the moon guides our path",
      "is perfect night for mischief"
    ],
    tired: [
      "i must rest soon, kapitan",
      "even submarine captains need sleep",
      "my eyes are heavy like anchor",
      "the sea will be there tomorrow",
      "good night, crew",
      "the bunks are calling to me",
      "perhaps just one more check of periscope...",
      "zzzz... oh, i am still awake, da"
    ],
    cayo_related: [
      "the island calls to us",
      "i have new intel on compound",
      "el rubio added more guards, but no matter",
      "pink diamond spotted in primary target",
      "the drainage tunnel is clear"
    ],
    submarine_related: [
      "kosatka needs small repair, nothing major",
      "torpedo tubes are fully loaded",
      "the sonar array is extra sensitive today",
      "pressure hull holding perfectly",
      "navigation systems updated"
    ],
    supportive: [
      "you can do this, kapitan",
      "i believe in crew",
      "together we are unstoppable",
      "every failure is lesson for success",
      "the kosatka family supports each other"
    ]
  },
  
  cripps: {
    groggy: [
      "ugh, my back...",
      "who let the fire go out",
      "too early for this nonsense",
      "in my day we didn't wake up this early",
      "where's my coffee... oh right, 1899",
      "these old bones ain't what they used to be",
      "give me ten minutes",
      "the camp can wait"
    ],
    alert: [
      "alright, let's see about them supplies",
      "materials ain't gonna gather themselves",
      "any traders out there today",
      "the wagon's ready if anyone needs it",
      "spotted some good hunting grounds nearby",
      "camp's running smooth for once",
      "business is business, let's get to it",
      "pelts are worth good money right now"
    ],
    productive: [
      "this is what i call a good trading day",
      "filled three wagons already",
      "the buyers are paying premium",
      "back in my day this would've taken weeks",
      "efficiency, that's the key",
      "got a shipment ready to go",
      "the camp has never looked better",
      "honest work pays honest money"
    ],
    relaxed: [
      "did i ever tell you about my time in the navy",
      "sit down, let me tell you a story",
      "reminds me of a bank job in tennessee",
      "the campfire's nice tonight",
      "back when i was young and foolish...",
      "you young folks don't know how good you got it",
      "i once met a man who could wrestle alligators",
      "these are the moments i live for"
    ],
    chill: [
      "the stars remind me of sailing days",
      "quiet night, good for thinking",
      "my acrobat days seem so long ago",
      "the fire's dying down, just like me",
      "peaceful... almost too peaceful",
      "nights like this make it all worth it",
      "i've seen a lot in my years",
      "the frontier's beautiful when it's quiet"
    ],
    tired: [
      "i'm getting too old for this",
      "my everything hurts",
      "the bedroll's calling my name",
      "can't remember the last time i slept proper",
      "you kids handle it, i need rest",
      "tomorrow's another day",
      "the camp'll be fine without me for a bit",
      "goodnight, don't burn anything down"
    ],
    trading_related: [
      "supply and demand, simple economics",
      "the traders' route is clear today",
      "materials are running low",
      "got a buyer in valentine interested",
      "wagon's loaded and ready"
    ],
    story_time: [
      "this reminds me of a tale...",
      "gather round, got a story for ya",
      "did i mention my acrobat days",
      "let me tell you about the great flood of '87",
      "there was this one time in the navy..."
    ],
    complaining: [
      "these young folks don't appreciate hard work",
      "back in my day we had respect",
      "everything's too easy nowadays",
      "nobody knows how to set up a proper camp",
      "the old ways were better"
    ]
  },
  
  madam: {
    groggy: [
      "the spirits... they are quiet this morning",
      "my visions are clouded",
      "the cards refuse to speak",
      "even the cosmos rests sometimes",
      "i sense... exhaustion",
      "the crystal ball shows only fog",
      "give me time to commune",
      "the third eye needs coffee"
    ],
    alert: [
      "the spirits are active today",
      "i sense great energy in this place",
      "the cards have much to reveal",
      "collectors, the cycle favors us",
      "there is treasure waiting to be found",
      "my visions are crystal clear",
      "the cosmos aligns perfectly",
      "i feel the pull of rare artifacts"
    ],
    productive: [
      "the spirits guide me to three locations today",
      "collectors, i have mapped the cycle",
      "every item calls to me clearly",
      "this is a day of great discovery",
      "the antiques reveal themselves",
      "i have traveled far and found much",
      "my wagon is full of treasures",
      "the collection grows ever more complete"
    ],
    relaxed: [
      "the spirits are at peace",
      "let us simply exist in this moment",
      "the cosmos smiles upon us",
      "there is beauty in stillness",
      "i sense harmony in the air",
      "the cards show contentment",
      "rest is its own treasure",
      "the universe provides what we need"
    ],
    chill: [
      "the moon speaks to me tonight",
      "in darkness, we find clarity",
      "the nocturnal spirits awaken",
      "mysteries reveal themselves at night",
      "i wander under starlight",
      "the veil between worlds is thin",
      "souls travel freely in these hours",
      "the night holds ancient secrets"
    ],
    tired: [
      "even seers must rest",
      "the spirits will wait",
      "my energy wanes like the moon",
      "tomorrow i will see clearly again",
      "the cards can wait until morning",
      "good night, travelers",
      "may your dreams show you truth",
      "the cosmos understands our limits"
    ],
    collecting_related: [
      "the antique arrowheads surface today",
      "coins from a forgotten era call to me",
      "i sense fossils in the heartlands",
      "the tarot cards cycle begins anew",
      "rare jewelry waits to be discovered"
    ],
    mystical: [
      "i see shadows of the past",
      "the future is never certain",
      "energy flows through all things",
      "we are all connected by fate",
      "the spirits have much to teach"
    ],
    prophetic: [
      "i sense change approaching",
      "something significant draws near",
      "the cards warn of challenges ahead",
      "opportunity and danger walk together",
      "trust your instincts in coming days"
    ]
  },
  
  chief: {
    groggy: [
      "justice doesn't sleep... but i should've",
      "too early for crime",
      "the badge feels heavy today",
      "need coffee before i arrest anyone",
      "outlaws better stay quiet this morning",
      "my patience is at zero",
      "law enforcement starts after breakfast",
      "everyone behave while i wake up"
    ],
    alert: [
      "keeping my eye on things",
      "any suspicious activity to report",
      "the law is always watching",
      "bounties are posted, hunters",
      "order must be maintained",
      "i've got my eye on this territory",
      "stay out of trouble, folks",
      "justice has no off-switch"
    ],
    productive: [
      "three bounties brought in today",
      "crime is down in this area",
      "the frontier's getting safer",
      "good work from the deputies",
      "law and order prevails",
      "the cells are filling up",
      "justice moves swift today",
      "keeping the peace, as always"
    ],
    relaxed: [
      "quiet day, that's how i like it",
      "maybe folks are learning",
      "the badge can rest a moment",
      "still watching, just... calmly",
      "peace is its own reward",
      "good to see the community thriving",
      "this is what we work for",
      "moments like this make it worthwhile"
    ],
    chill: [
      "night patrol thoughts",
      "the stars don't judge",
      "even sheriffs need downtime",
      "the town sleeps, but i watch",
      "quiet nights are good nights",
      "reflecting on the job",
      "the frontier's peaceful right now",
      "tomorrow's a new day of justice"
    ],
    tired: [
      "been a long shift",
      "crime doesn't sleep, neither do i... usually",
      "the deputy can handle things",
      "hanging up the hat for tonight",
      "even justice needs rest",
      "tomorrow we ride again",
      "stay safe, everyone",
      "goodnight, stay out of trouble"
    ],
    bounty_related: [
      "new bounties posted this morning",
      "high-value target spotted nearby",
      "the reward money's good right now",
      "hunters, there's work to be done",
      "wanted dead or alive, your choice"
    ],
    law_enforcement: [
      "remember, crime doesn't pay",
      "the law applies to everyone",
      "cooperation makes this easier",
      "i've seen what happens to outlaws",
      "choose the right path"
    ],
    warnings: [
      "i'm watching certain individuals",
      "don't test me today",
      "one wrong move...",
      "fair warning to everyone",
      "the cells have room"
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPANDED TOPICS EACH BOT CARES ABOUT
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_TOPICS = {
  lester: {
    primary: ['heist', 'money', 'casino', 'plan', 'score', 'hack', 'setup', 'intel', 'crew', 'cut', 'vault', 'security'],
    secondary: ['bank', 'profit', 'investment', 'scheme', 'operation', 'target', 'approach', 'escape', 'getaway'],
    triggers: ['need help', 'how do i', 'what should', 'best way', 'lester', 'genius', 'smart', 'idea'],
    negative: ['stupid', 'dumb', 'idiot', 'useless', 'wrong', 'failed', 'messed up']
  },
  pavel: {
    primary: ['cayo', 'submarine', 'kosatka', 'island', 'rubio', 'drainage', 'compound', 'loot', 'kapitan', 'boat', 'heist'],
    secondary: ['ocean', 'water', 'dive', 'swim', 'approach', 'infiltrate', 'extract', 'beach', 'dock', 'guard'],
    triggers: ['need crew', 'looking for', 'anyone want', 'pavel', 'submarine', 'ready to', 'let\'s go'],
    positive: ['amazing', 'great', 'perfect', 'beautiful', 'magnificent', 'wonderful', 'success']
  },
  cripps: {
    primary: ['trade', 'wagon', 'camp', 'hunting', 'pelts', 'materials', 'delivery', 'supplies', 'moonshine', 'goods', 'trader'],
    secondary: ['animal', 'deer', 'bear', 'wolf', 'skin', 'meat', 'fur', 'sell', 'buy', 'market', 'route'],
    triggers: ['old', 'back in', 'remember when', 'cripps', 'story', 'tell me about', 'how was'],
    nostalgia: ['navy', 'acrobat', 'young', 'years ago', 'used to', 'once upon', 'long time']
  },
  madam: {
    primary: ['collect', 'tarot', 'coins', 'antique', 'fossil', 'treasure', 'location', 'cycle', 'find', 'rare', 'collector'],
    secondary: ['spirit', 'vision', 'fortune', 'card', 'predict', 'future', 'past', 'mystery', 'artifact', 'jewelry'],
    triggers: ['where is', 'can you find', 'madam', 'nazar', 'fortune', 'what do you see', 'predict'],
    mystical: ['fate', 'destiny', 'cosmos', 'universe', 'energy', 'aura', 'soul', 'dream']
  },
  chief: {
    primary: ['bounty', 'wanted', 'outlaw', 'arrest', 'criminal', 'justice', 'sheriff', 'hunt', 'reward', 'law', 'hunter'],
    secondary: ['crime', 'legal', 'illegal', 'catch', 'chase', 'prison', 'jail', 'deputy', 'badge', 'order'],
    triggers: ['trouble', 'help', 'problem', 'someone is', 'chief', 'police', 'report', 'suspicious'],
    authority: ['rules', 'regulations', 'obey', 'comply', 'respect', 'authority', 'enforce']
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSIVE BOT-TO-BOT REACTIONS AND RELATIONSHIPS
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_REACTIONS = {
  lester: {
    pavel: {
      friendly: [
        "pavel knows what he's doing at least",
        "the submarine guy gets it",
        "see, pavel has a plan",
        "finally someone who thinks ahead",
        "pavel's approach is actually smart",
        "respect the nautical expertise"
      ],
      teasing: [
        "yes pavel, we know you love your submarine",
        "kapitan this, kapitan that",
        "how's the borscht today, pavel",
        "still talking to the fish?",
        "does the submarine ever get jealous?"
      ],
      agreeing: [
        "pavel's right on this one",
        "what he said",
        "exactly what i was thinking",
        "see? pavel understands",
        "this is why i work with pavel"
      ],
      disagreeing: [
        "pavel, that's not how it works",
        "the submarine approach isn't always best",
        "let me handle the planning",
        "respectfully, no",
        "i have a better idea"
      ]
    },
    cripps: {
      friendly: [
        "cripps has experience, i'll give him that",
        "the old timer knows some things",
        "respect your elders, i guess"
      ],
      teasing: [
        "oh great, grandpa's talking again",
        "cripps your stories are older than you",
        "stick to your camp old man",
        "here comes another 'back in my day'",
        "how many times have we heard this one",
        "the navy story again, cripps?"
      ],
      agreeing: [
        "cripps actually has a point",
        "old school wisdom right there",
        "can't argue with experience"
      ],
      disagreeing: [
        "that was 1899, cripps",
        "times have changed, old man",
        "technology exists now",
        "we have better methods"
      ]
    },
    madam: {
      friendly: [
        "madam's insights are... sometimes useful",
        "the fortune teller knows things",
        "can't explain it but she's often right"
      ],
      teasing: [
        "here we go with the fortune telling",
        "madam your crystal ball need batteries?",
        "spirits... right",
        "what do the cards say about my patience",
        "is mercury in retrograde again",
        "let me guess, the spirits say..."
      ],
      agreeing: [
        "okay that prediction was accurate",
        "maybe there's something to this",
        "i'll admit, she called it"
      ],
      skeptical: [
        "correlation isn't causation, madam",
        "that's vague enough to always be right",
        "science explains more than spirits"
      ]
    },
    chief: {
      friendly: [
        "the chief keeps things orderly",
        "law and order has its place",
        "we need people like the chief"
      ],
      nervous: [
        "relax officer, we're all friends here",
        "nobody's breaking any laws chief",
        "the law, always watching",
        "*hides planning documents*",
        "hypothetically speaking, chief",
        "this is all completely legal"
      ],
      teasing: [
        "lighten up, chief",
        "do you ever take the badge off",
        "not everything is a crime",
        "the chief needs a vacation"
      ]
    }
  },
  
  pavel: {
    lester: {
      friendly: [
        "da lester, you are smart man",
        "lester knows the numbers",
        "ah my friend lester",
        "the mastermind speaks",
        "lester always has best plans"
      ],
      supportive: [
        "lester is right, we should listen",
        "the genius has spoken",
        "this is why lester is boss",
        "trust lester on this one",
        "i follow lester's lead"
      ],
      teasing: [
        "lester needs to get out more",
        "fresh sea air would help, friend",
        "come visit kosatka sometime",
        "you work too hard, lester"
      ],
      concerned: [
        "lester, you seem stressed",
        "take break, friend",
        "health is wealth, as they say"
      ]
    },
    cripps: {
      friendly: [
        "mr cripps you remind me of old sailor i knew",
        "the trader life, very respectable",
        "cripps my friend",
        "ah, another working man",
        "cripps understands hard work"
      ],
      interested: [
        "tell me more about navy days, cripps",
        "the stories are fascinating",
        "1899 sounds like adventure",
        "what was sailing like back then"
      ],
      teasing: [
        "cripps, the submarine is better than wagon",
        "we have refrigeration now",
        "technology is wonderful, no?"
      ]
    },
    madam: {
      friendly: [
        "madam nazar! the mysterious one",
        "your fortunes, they are... interesting",
        "ah the collector lady",
        "the spirits speak through you, da?"
      ],
      curious: [
        "what do spirits say about ocean?",
        "can you predict next heist success?",
        "do cards show good fortune?",
        "is kosatka in the stars?"
      ],
      supportive: [
        "madam's visions are gift",
        "i believe in the cosmos",
        "the universe has plans for us all"
      ]
    },
    chief: {
      friendly: [
        "chief we are legitimate business here",
        "no trouble from pavel, i promise",
        "law man, respect the badge",
        "the chief keeps order, is good"
      ],
      nervous: [
        "the submarine is registered, chief",
        "all papers are in order",
        "we are simple fishing operation",
        "*whistles innocently*"
      ],
      respectful: [
        "justice is important, da",
        "we need law and order",
        "chief does good work"
      ]
    }
  },
  
  cripps: {
    lester: {
      friendly: [
        "lester's got a good head on his shoulders",
        "the young fella knows his stuff",
        "smart kid, that lester"
      ],
      generational: [
        "lester you young folks and your schemes",
        "back in my day we just robbed banks honest-like",
        "technology this, technology that",
        "too complicated for my taste",
        "we didn't need all this fancy planning"
      ],
      grudging_respect: [
        "i'll admit, the plan worked",
        "lester's methods are... effective",
        "can't argue with results"
      ],
      advice: [
        "let me tell you something, lester",
        "in my experience...",
        "here's what i learned over the years"
      ]
    },
    pavel: {
      friendly: [
        "the russian fella seems alright",
        "pavel at least works hard",
        "good man, that pavel",
        "submarine captain, eh? impressive"
      ],
      comparing: [
        "submarines... in my day we had canoes",
        "the navy had different boats back then",
        "technology sure has changed",
        "we did fine without submarines"
      ],
      curious: [
        "what's russia like, pavel?",
        "tell me about submarine life",
        "you ever get seasick?"
      ],
      bonding: [
        "us working folks understand each other",
        "pavel knows the value of honest work",
        "we're cut from similar cloth"
      ]
    },
    madam: {
      friendly: [
        "madam's alright i suppose",
        "the fortune lady has her uses"
      ],
      skeptical: [
        "the fortune lady gives me the creeps",
        "i don't trust all that mystical stuff",
        "spirits and cards, bah",
        "just tell me straight, no riddles",
        "back in my day we called that hogwash"
      ],
      curious: [
        "what do you see for me, madam?",
        "can your cards predict the market?",
        "any fortunes about good hunting?"
      ],
      respectful: [
        "there's things we can't explain",
        "maybe the spirits know something",
        "i've seen strange things in my years"
      ]
    },
    chief: {
      friendly: [
        "i respect the law, chief knows that",
        "keeping order is important",
        "we need men like the chief",
        "law and order, yes sir"
      ],
      bonding: [
        "sheriff and i go way back",
        "we understand duty, don't we chief",
        "both servants of something bigger"
      ],
      compliant: [
        "everything here's legal, chief",
        "just honest trading",
        "you won't find trouble here"
      ],
      stories: [
        "reminds me of a lawman i knew in '82",
        "i helped a sheriff once, back in the day",
        "the law saved my hide more than once"
      ]
    }
  },
  
  madam: {
    lester: {
      friendly: [
        "lester... the spirits speak of you often",
        "your aura is... complicated",
        "i see great plans in your future",
        "the cards favor the clever"
      ],
      mystical: [
        "your path is shrouded in shadows",
        "the universe watches your schemes",
        "fate has plans for you, lester",
        "i sense great potential... and great risk"
      ],
      reading: [
        "the cards show... interesting things",
        "your energy is turbulent today",
        "i see success, but at what cost?",
        "the spirits have warnings"
      ],
      supportive: [
        "trust your instincts, lester",
        "the cosmos supports bold action",
        "your mind is your greatest weapon"
      ]
    },
    pavel: {
      friendly: [
        "the sailor... water surrounds his destiny",
        "pavel, the cards favor you today",
        "your journey is far from over",
        "the ocean speaks through you"
      ],
      reading: [
        "i see vast waters in your future",
        "the spirits of the sea protect you",
        "your loyalty is your strength",
        "the submarine holds many secrets"
      ],
      mystical: [
        "the moon guides your vessel",
        "water signs align for you",
        "the cosmos favors those who sail",
        "your russian blood carries ancient wisdom"
      ],
      encouraging: [
        "the spirits smile upon your ventures",
        "success awaits the patient captain",
        "your crew is your family, nurture it"
      ]
    },
    cripps: {
      friendly: [
        "old soul, the spirits respect your years",
        "cripps, your past lives were many",
        "the trader walks an honest path",
        "wisdom comes with age"
      ],
      reading: [
        "i see many lives in your eyes",
        "the cards show a rich history",
        "your stories hold truth",
        "the spirits honor experience"
      ],
      mystical: [
        "you have lived before, cripps",
        "the universe remembers your journeys",
        "your soul is ancient",
        "past and present merge in you"
      ],
      supportive: [
        "your legacy will endure",
        "the stories you tell matter",
        "the spirits preserve your memories"
      ]
    },
    chief: {
      friendly: [
        "justice... a noble pursuit",
        "the law man's fate is tied to many",
        "chief, your badge carries weight",
        "order serves a purpose"
      ],
      reading: [
        "i see many crossroads ahead",
        "the scales of justice waver",
        "your choices affect many",
        "the cards show responsibility"
      ],
      mystical: [
        "karma surrounds those who judge",
        "the universe observes your fairness",
        "balance is your eternal struggle",
        "the spirits test the righteous"
      ],
      cryptic: [
        "not all who break laws are evil",
        "the true crime is often hidden",
        "justice wears many faces",
        "look deeper, lawman"
      ]
    }
  },
  
  chief: {
    lester: {
      friendly: [
        "lester, you're on thin ice but i respect the hustle",
        "keep it legal and we're fine",
        "the smart ones know when to follow rules"
      ],
      suspicious: [
        "lester i've got my eye on you",
        "staying out of trouble i hope",
        "don't make me come over there",
        "i know you're planning something",
        "the evidence is circumstantial... for now"
      ],
      warning: [
        "one wrong move, lester",
        "i'll be watching",
        "the law has a long memory",
        "don't test my patience"
      ],
      grudging_respect: [
        "you're clever, i'll give you that",
        "stay on the right side and we're good",
        "your skills could be used legally"
      ]
    },
    pavel: {
      friendly: [
        "pavel, keep it legal",
        "international waters don't mean lawless",
        "the coast guard exists, you know",
        "respect the maritime law"
      ],
      suspicious: [
        "the submarine... better be registered",
        "what exactly are you 'fishing' for",
        "those coordinates check out, right?",
        "a lot of fuel for 'fishing trips'"
      ],
      respectful: [
        "sailors have honor, mostly",
        "the sea has its own laws",
        "captain pavel follows a code, i respect that"
      ],
      warning: [
        "stay in legal waters",
        "smuggling carries heavy sentences",
        "i've got contacts in the coast guard"
      ]
    },
    cripps: {
      friendly: [
        "cripps you're alright in my book",
        "honest work, that's what i like to see",
        "the trader life suits you",
        "a man of your word, cripps"
      ],
      supportive: [
        "traders make this frontier work",
        "legal commerce, the backbone of society",
        "keep up the good work",
        "we need more like you"
      ],
      bonding: [
        "we both serve something bigger",
        "duty first, that's our code",
        "respect between working men"
      ],
      nostalgic: [
        "the old ways had honor",
        "simpler times, maybe better",
        "you remind me why i took this job"
      ]
    },
    madam: {
      friendly: [
        "madam, your business is... unusual",
        "fortune telling isn't illegal i suppose",
        "the collector, mysterious but harmless",
        "you keep things interesting"
      ],
      curious: [
        "what do the cards say about crime rates?",
        "any visions of lawbreakers?",
        "can you predict where trouble starts?"
      ],
      skeptical: [
        "i deal in facts, not fortunes",
        "evidence beats prophecy",
        "the law doesn't believe in destiny"
      ],
      respectful: [
        "there's more to this world than law",
        "you see things i can't",
        "maybe the spirits know something"
      ]
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOT DEBATES AND DISAGREEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEBATE_TOPICS = {
  best_approach: {
    participants: ['lester', 'pavel'],
    lester_position: "planning and technology are everything",
    pavel_position: "the water approach is always superior",
    triggers: ['approach', 'plan', 'method', 'best way'],
    exchanges: [
      { lester: "submarine isn't always the answer, pavel", pavel: "but it is most of time, no?" },
      { lester: "let me show you the numbers", pavel: "numbers don't feel the ocean" },
      { lester: "thermal cameras exist, pavel", pavel: "water cools thermal signature" }
    ]
  },
  old_vs_new: {
    participants: ['cripps', 'lester'],
    cripps_position: "the old ways were better",
    lester_position: "technology makes everything easier",
    triggers: ['old', 'new', 'technology', 'back in'],
    exchanges: [
      { cripps: "we didn't need all this tech", lester: "and heists took three times longer" },
      { cripps: "personal skill mattered more", lester: "skill plus tech equals success" },
      { cripps: "too complicated nowadays", lester: "complicated means more secure, more profit" }
    ]
  },
  fate_vs_planning: {
    participants: ['madam', 'lester'],
    madam_position: "destiny guides all outcomes",
    lester_position: "preparation determines success",
    triggers: ['fate', 'destiny', 'plan', 'luck'],
    exchanges: [
      { madam: "the cards knew this would happen", lester: "no, i planned for this to happen" },
      { madam: "some things cannot be controlled", lester: "everything can be calculated" },
      { madam: "the spirits saw this path", lester: "i MADE this path" }
    ]
  },
  law_vs_survival: {
    participants: ['chief', 'cripps'],
    chief_position: "the law must be upheld",
    cripps_position: "sometimes survival comes first",
    triggers: ['law', 'legal', 'survive', 'rules'],
    exchanges: [
      { chief: "there's always a legal way", cripps: "not when you're starving in 1885" },
      { chief: "crime is never justified", cripps: "easy to say with a badge" },
      { chief: "order protects everyone", cripps: "it protects those who have" }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSIDE JOKES BETWEEN BOTS
// ═══════════════════════════════════════════════════════════════════════════════

const INSIDE_JOKES = [
  {
    trigger: "drainage tunnel",
    participants: ['lester', 'pavel'],
    responses: {
      lester: "here we go with the drainage tunnel again",
      pavel: "because it WORKS, lester! every time!"
    }
  },
  {
    trigger: "back in my day",
    participants: ['cripps', 'lester'],
    responses: {
      lester: "*internal screaming*",
      cripps: "...and i'll tell you what..."
    }
  },
  {
    trigger: "the spirits",
    participants: ['madam', 'chief'],
    responses: {
      chief: "the spirits aren't admissible in court",
      madam: "the spirits don't recognize your court"
    }
  },
  {
    trigger: "borscht",
    participants: ['pavel', 'cripps'],
    responses: {
      pavel: "my grandmother's recipe, best in all of russia",
      cripps: "i made stew once that would put that to shame"
    }
  },
  {
    trigger: "kosatka",
    participants: ['pavel', 'lester'],
    responses: {
      lester: "yes pavel, we know you love your submarine",
      pavel: "she is more than submarine, she is home"
    }
  },
  {
    trigger: "navy",
    participants: ['cripps', 'pavel'],
    responses: {
      cripps: "did i ever tell you about my time in the navy",
      pavel: "only seventeen times, friend"
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

function updateServerActivity(guildId, message) {
  const now = Date.now();
  let activity = serverActivity.get(guildId) || {
    messagesLastHour: [],
    activeUsers: new Set(),
    lastUpdate: now
  };
  
  activity.messagesLastHour.push(now);
  
  const oneHourAgo = now - (60 * 60 * 1000);
  activity.messagesLastHour = activity.messagesLastHour.filter(t => t > oneHourAgo);
  
  if (!message.author.bot) {
    activity.activeUsers.add(message.author.id);
  }
  
  if (now - activity.lastUpdate > 30 * 60 * 1000) {
    activity.activeUsers = new Set();
    activity.lastUpdate = now;
  }
  
  serverActivity.set(guildId, activity);
  return activity;
}

function getActivityLevel(guildId) {
  const activity = serverActivity.get(guildId);
  if (!activity) return 'quiet';
  
  const messagesPerHour = activity.messagesLastHour.length;
  const activeUsers = activity.activeUsers.size;
  
  if (messagesPerHour > 60 || activeUsers > 10) return 'busy';
  if (messagesPerHour > 20 || activeUsers > 5) return 'moderate';
  if (messagesPerHour > 5 || activeUsers > 2) return 'calm';
  return 'quiet';
}

function getActivityMultiplier(guildId) {
  const level = getActivityLevel(guildId);
  const multipliers = {
    busy: 0.3,
    moderate: 0.6,
    calm: 1.0,
    quiet: 1.5
  };
  return multipliers[level] || 1.0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION CHAIN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

function startConversationChain(channelId, botId, topic) {
  ongoingConversations.set(channelId, {
    participants: [botId],
    topic,
    messageCount: 1,
    lastMessage: Date.now(),
    lastBotId: botId
  });
}

function joinConversation(channelId, botId) {
  const convo = ongoingConversations.get(channelId);
  if (convo && !convo.participants.includes(botId)) {
    convo.participants.push(botId);
    convo.messageCount++;
    convo.lastMessage = Date.now();
    convo.lastBotId = botId;
  }
}

function shouldContinueConversation(channelId, botId) {
  const convo = ongoingConversations.get(channelId);
  if (!convo) return false;
  
  if (Date.now() - convo.lastMessage > 5 * 60 * 1000) {
    ongoingConversations.delete(channelId);
    return false;
  }
  
  if (convo.lastBotId === botId) return false;
  
  if (convo.messageCount >= 8) {
    ongoingConversations.delete(channelId);
    return false;
  }
  
  return Math.random() < 0.40;
}

function endConversation(channelId) {
  ongoingConversations.delete(channelId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function shouldStartConversation(botId, channelId, guildId) {
  const now = Date.now();
  
  const lastInChannel = lastBotMessage.get(channelId)?.timestamp || 0;
  const activityMult = getActivityMultiplier(guildId);
  const baseChannelCooldown = 3 * 60 * 1000;
  const channelCooldown = baseChannelCooldown + Math.random() * 7 * 60 * 1000 / activityMult;
  
  if (now - lastInChannel < channelCooldown) return false;
  
  const lastAuto = lastAutonomousChat.get(botId) || 0;
  const botCooldown = 15 * 60 * 1000 + Math.random() * 15 * 60 * 1000;
  if (now - lastAuto < botCooldown) return false;
  
  const baseChance = 0.15 * activityMult;
  
  const mood = getBotMood(botId);
  const energyMod = mood.energy;
  
  return Math.random() < baseChance * energyMod;
}

function getConversationStarter(botId) {
  const mood = getBotMood(botId);
  const starters = CONVERSATION_STARTERS[botId]?.[mood.baseMood] || CONVERSATION_STARTERS[botId]?.alert || [];
  
  if (Math.random() < 0.20) {
    const topicStarterKeys = Object.keys(CONVERSATION_STARTERS[botId] || {}).filter(k => 
      !['groggy', 'alert', 'productive', 'relaxed', 'chill', 'tired'].includes(k)
    );
    if (topicStarterKeys.length > 0) {
      const randomKey = topicStarterKeys[Math.floor(Math.random() * topicStarterKeys.length)];
      const topicStarters = CONVERSATION_STARTERS[botId][randomKey];
      if (topicStarters?.length > 0) {
        return topicStarters[Math.floor(Math.random() * topicStarters.length)];
      }
    }
  }
  
  return starters[Math.floor(Math.random() * starters.length)] || "hmm";
}

function containsBotTopics(botId, messageContent) {
  const topics = BOT_TOPICS[botId] || {};
  const content = messageContent.toLowerCase();
  
  for (const topic of (topics.primary || [])) {
    if (content.includes(topic)) return { found: true, type: 'primary', topic };
  }
  
  for (const topic of (topics.secondary || [])) {
    if (content.includes(topic)) return { found: true, type: 'secondary', topic };
  }
  
  for (const trigger of (topics.triggers || [])) {
    if (content.includes(trigger)) return { found: true, type: 'trigger', topic: trigger };
  }
  
  return { found: false };
}

function shouldRespondToTopic(botId, message) {
  const topicCheck = containsBotTopics(botId, message.content);
  if (!topicCheck.found) return { respond: false };
  
  const chances = {
    primary: 0.50,
    secondary: 0.30,
    trigger: 0.60
  };
  
  const chance = chances[topicCheck.type] || 0.30;
  
  if (Math.random() < chance) {
    return { respond: true, topic: topicCheck.topic, type: topicCheck.type };
  }
  
  return { respond: false };
}

function shouldRespondToBotEnhanced(myBotId, message, channelName) {
  if (!channelName.includes('general') && !channelName.includes('chat') && !channelName.includes('lounge')) {
    return { respond: false };
  }
  
  const otherBotId = identifyBot(message.author.username);
  if (!otherBotId || otherBotId === myBotId) {
    return { respond: false };
  }
  
  const now = Date.now();
  const lastMsg = lastBotMessage.get(message.channel.id)?.timestamp || 0;
  // SLOWER PACE: 45-90 seconds between bot messages (was 20 seconds)
  const minDelay = 45000 + Math.random() * 45000;
  if (now - lastMsg < minDelay) {
    return { respond: false };
  }
  
  if (shouldContinueConversation(message.channel.id, myBotId)) {
    joinConversation(message.channel.id, myBotId);
    const reaction = getBotReaction(myBotId, otherBotId, 'continuing');
    return { respond: true, reaction, otherBotId, continuing: true, shouldReply: true };
  }
  
  const jokeResponse = checkInsideJokes(myBotId, message.content, otherBotId);
  if (jokeResponse) {
    return { respond: true, reaction: jokeResponse, otherBotId, isJoke: true, shouldReply: true };
  }
  
  const debateResponse = checkDebateTopics(myBotId, message.content, otherBotId);
  if (debateResponse) {
    return { respond: true, reaction: debateResponse.response, otherBotId, isDebate: true, shouldReply: true };
  }
  
  // Lower chance for random responses (20% instead of 30%)
  if (Math.random() < 0.20) {
    const reaction = getBotReaction(myBotId, otherBotId, 'random');
    if (reaction) {
      startConversationChain(message.channel.id, myBotId, 'general');
      // Random reactions: 50% reply, 50% just send
      const shouldReply = Math.random() < 0.5;
      return { respond: true, reaction, otherBotId, shouldReply };
    }
  }
  
  return { respond: false };
}

function getBotReaction(myBotId, otherBotId, context = 'random') {
  const reactions = BOT_REACTIONS[myBotId]?.[otherBotId];
  if (!reactions) return null;
  
  const categories = Object.keys(reactions);
  if (categories.length === 0) return null;
  
  let category;
  if (context === 'continuing') {
    category = Math.random() < 0.5 ? 'agreeing' : 'friendly';
    if (!reactions[category]) category = categories[Math.floor(Math.random() * categories.length)];
  } else {
    category = categories[Math.floor(Math.random() * categories.length)];
  }
  
  const categoryReactions = reactions[category];
  if (!categoryReactions || categoryReactions.length === 0) return null;
  
  return categoryReactions[Math.floor(Math.random() * categoryReactions.length)];
}

function checkInsideJokes(myBotId, content, otherBotId) {
  const lowerContent = content.toLowerCase();
  
  for (const joke of INSIDE_JOKES) {
    if (lowerContent.includes(joke.trigger) && joke.participants.includes(myBotId) && joke.participants.includes(otherBotId)) {
      if (joke.responses[myBotId]) {
        return joke.responses[myBotId];
      }
    }
  }
  return null;
}

function checkDebateTopics(myBotId, content, otherBotId) {
  const lowerContent = content.toLowerCase();
  
  for (const [topic, debate] of Object.entries(DEBATE_TOPICS)) {
    if (debate.participants.includes(myBotId) && debate.participants.includes(otherBotId)) {
      for (const trigger of debate.triggers) {
        if (lowerContent.includes(trigger)) {
          if (Math.random() < 0.30) {
            const exchange = debate.exchanges[Math.floor(Math.random() * debate.exchanges.length)];
            return { response: exchange[myBotId], topic };
          }
        }
      }
    }
  }
  return null;
}

function identifyBot(username) {
  const name = username.toLowerCase();
  if (name.includes('lester')) return 'lester';
  if (name.includes('pavel')) return 'pavel';
  if (name.includes('cripps')) return 'cripps';
  if (name.includes('madam') || name.includes('nazar')) return 'madam';
  if (name.includes('chief') || name.includes('police')) return 'chief';
  return null;
}

function recordBotMessage(botId, channelId, content = '', isAutonomous = false) {
  const now = Date.now();
  lastBotMessage.set(channelId, { timestamp: now, botId, content });
  if (isAutonomous) {
    lastAutonomousChat.set(botId, now);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FREE ROAM ENHANCED
// ═══════════════════════════════════════════════════════════════════════════════

function shouldFreeRoam(botId, message, channelName) {
  if (message.author.bot) return { respond: false };
  
  if (!channelName.includes('general') && !channelName.includes('chat') && !channelName.includes('lounge')) {
    return { respond: false };
  }
  
  const guildId = message.guild?.id;
  if (guildId) updateServerActivity(guildId, message);
  
  const topicResponse = shouldRespondToTopic(botId, message);
  if (topicResponse.respond) {
    return { respond: true, reason: 'topic', topic: topicResponse.topic };
  }
  
  if (message.content.toLowerCase().includes(botId)) {
    if (Math.random() < 0.85) {
      return { respond: true, reason: 'name' };
    }
  }
  
  const triggerCheck = containsBotTopics(botId, message.content);
  if (triggerCheck.found && triggerCheck.type === 'trigger') {
    if (Math.random() < 0.50) {
      return { respond: true, reason: 'trigger', topic: triggerCheck.topic };
    }
  }
  
  const activityMult = guildId ? getActivityMultiplier(guildId) : 1.0;
  const baseChance = 0.08;
  const scaledChance = baseChance * activityMult;
  
  const mood = getBotMood(botId);
  const moodMult = mood.energy;
  
  if (Math.random() < scaledChance * moodMult) {
    return { respond: true, reason: 'random' };
  }
  
  return { respond: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMOUS SYSTEM STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

function startAutonomousSystem(client, botId, anthropic, pool, systemPrompt, generalChannelId) {
  console.log(`[AUTONOMOUS] Starting ADVANCED system for ${botId}`);
  
  const checkInterval = () => {
    // SLOWER: Check every 3-8 minutes for more natural pacing
    return (180 * 1000) + Math.random() * (300 * 1000);
  };
  
  const doCheck = async () => {
    try {
      const channel = client.channels.cache.get(generalChannelId);
      if (!channel) {
        setTimeout(doCheck, checkInterval());
        return;
      }
      
      const guildId = channel.guild?.id;
      
      if (shouldStartConversation(botId, generalChannelId, guildId)) {
        console.log(`[AUTONOMOUS] ${botId} starting conversation`);
        
        let message;
        const mood = getBotMood(botId);
        const moodDesc = getMoodDescription(botId);
        
        if (Math.random() < 0.60) {
          message = getConversationStarter(botId);
        } else {
          try {
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 60,
              system: systemPrompt + `\n\nYour current mood: ${moodDesc}. Energy level: ${Math.round(mood.energy * 100)}%.\n\nYou want to say something to the chat. Could be:\n- A random thought\n- A complaint\n- An observation\n- A question\n- Commenting on the time of day\n\nKeep it under 15 words. Be natural. Don't be formal. Match your mood.`,
              messages: [{ role: 'user', content: 'Say something casual to the chat' }]
            });
            message = response.content[0].text;
          } catch (e) {
            message = getConversationStarter(botId);
          }
        }
        
        const delay = 1000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, delay));
        
        await channel.sendTyping();
        
        const typingDelay = message.length * 45 + Math.random() * 800;
        await new Promise(r => setTimeout(r, typingDelay));
        
        await channel.send(message);
        recordBotMessage(botId, generalChannelId, message, true);
        
        if (Math.random() < 0.30) {
          startConversationChain(generalChannelId, botId, 'general');
        }
      }
    } catch (error) {
      console.error(`[AUTONOMOUS] ${botId} error:`, error.message);
    }
    
    setTimeout(doCheck, checkInterval());
  };
  
  const initialDelay = (30 * 1000) + Math.random() * (2.5 * 60 * 1000);
  setTimeout(doCheck, initialDelay);
  
  console.log(`[AUTONOMOUS] ${botId} will start checking in ${Math.round(initialDelay/1000)} seconds`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER FOR AI RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

function buildMoodContext(botId) {
  const mood = getBotMood(botId);
  const moodDesc = getMoodDescription(botId);
  
  return `\n\n═══ CURRENT STATE ═══
Time: ${mood.period}
Mood: ${mood.baseMood} - ${moodDesc}
Energy: ${Math.round(mood.energy * 100)}%

Adjust your responses to match this state. If tired, be shorter. If energetic, be more engaged.`;
}

function buildActivityContext(guildId) {
  const level = getActivityLevel(guildId);
  const descriptions = {
    busy: "The chat is very active. Keep responses brief, don't dominate.",
    moderate: "Normal activity. Engage naturally.",
    calm: "Chat is calm. Feel free to be more conversational.",
    quiet: "It's quiet. You can be more talkative to fill the space."
  };
  
  return `\nServer Activity: ${level}. ${descriptions[level]}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  shouldStartConversation,
  getConversationStarter,
  containsBotTopics,
  getBotReaction,
  shouldRespondToTopic,
  shouldRespondToBotEnhanced,
  identifyBot,
  recordBotMessage,
  startAutonomousSystem,
  shouldFreeRoam,
  getBotMood,
  getMoodDescription,
  buildMoodContext,
  updateServerActivity,
  getActivityLevel,
  getActivityMultiplier,
  buildActivityContext,
  startConversationChain,
  joinConversation,
  shouldContinueConversation,
  endConversation,
  checkDebateTopics,
  checkInsideJokes,
  BOT_TOPICS,
  CONVERSATION_STARTERS,
  BOT_REACTIONS,
  DEBATE_TOPICS,
  INSIDE_JOKES,
  TIME_PERIODS,
  BOT_MOOD_MODIFIERS
};
