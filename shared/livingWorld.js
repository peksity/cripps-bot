/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LIVING WORLD SIMULATION v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * The bots have LIVES that run 24/7 whether anyone's talking or not.
 * 
 * Features:
 * - Persistent bot states (mood, location, activity, energy)
 * - Random life events that unfold over time
 * - Inter-bot relationships that evolve (including Cripps/Madam romance)
 * - Seasonal storylines and character arcs
 * - Bots reference "what happened yesterday"
 * - Drama, romance, rivalries, alliances
 * - Crisis events that affect the whole ecosystem
 * - Chief hunting Lester arc
 * - The Big Score multi-bot heist storyline
 */

const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

// ═══════════════════════════════════════════════════════════════════════════════
// BOT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_PROFILES = {
  lester: {
    displayName: 'Lester',
    color: 0x00FF00,
    defaultLocation: 'warehouse',
    defaultActivity: 'hacking',
    defaultMood: 'paranoid',
    locations: ['warehouse', 'safe_house', 'arcade', 'on_the_move', 'dark', 'hospital', 'meeting_spot', 'off_grid'],
    activities: ['hacking', 'planning_heist', 'monitoring_police', 'erasing_evidence', 'meeting_contact', 'laying_low', 
                 'building_equipment', 'sleeping', 'paranoid_sweep', 'encrypted_call', 'watching_news', 'eating_takeout',
                 'coding', 'surveillance', 'researching_target', 'debugging_security'],
    moods: ['paranoid', 'excited', 'irritated', 'smug', 'anxious', 'focused', 'exhausted', 'manic', 'triumphant', 'worried'],
    defaultRelationships: { pavel: 65, cripps: 30, madam: 45, chief: -80 }
  },
  pavel: {
    displayName: 'Pavel',
    color: 0x0080FF,
    defaultLocation: 'kosatka',
    defaultActivity: 'maintenance',
    defaultMood: 'cheerful',
    locations: ['kosatka', 'open_sea', 'cayo_perico_waters', 'los_santos_port', 'deep_dive', 'surface', 'patrol', 'docked'],
    activities: ['maintenance', 'navigation', 'cooking', 'planning_approach', 'periscope_watch', 'drinking_tea',
                 'radio_intercept', 'sleeping', 'diving', 'repairing_hull', 'inventory_check', 'nostalgic_music',
                 'training_crew', 'fishing', 'cleaning_torpedoes', 'charting_course'],
    moods: ['cheerful', 'homesick', 'proud', 'worried', 'content', 'adventurous', 'tired', 'hopeful', 'excited', 'nostalgic'],
    defaultRelationships: { lester: 70, cripps: 50, madam: 40, chief: -20 }
  },
  cripps: {
    displayName: 'Cripps',
    color: 0x8B4513,
    defaultLocation: 'camp',
    defaultActivity: 'cooking',
    defaultMood: 'nostalgic',
    locations: ['camp', 'hunting', 'town', 'trading_post', 'wilderness', 'saloon', 'river', 'mountain_pass'],
    activities: ['cooking', 'hunting', 'trading', 'telling_stories', 'complaining', 'petting_dog', 'sleeping',
                 'drinking', 'reminiscing', 'sewing', 'chopping_wood', 'writing_letter', 'tanning_hides',
                 'repairing_wagon', 'fishing', 'playing_harmonica'],
    moods: ['nostalgic', 'grumpy', 'content', 'drunk', 'melancholy', 'proud', 'irritated', 'hopeful', 'romantic', 'wistful'],
    defaultRelationships: { lester: 25, pavel: 45, madam: 55, chief: 10 }
  },
  madam: {
    displayName: 'Madam Nazar',
    color: 0x9B59B6,
    defaultLocation: 'wagon',
    defaultActivity: 'reading_cards',
    defaultMood: 'mysterious',
    locations: ['wagon', 'traveling', 'crossroads', 'graveyard', 'town_square', 'hidden_grove', 'riverside', 'ancient_ruins'],
    activities: ['reading_cards', 'mixing_potions', 'having_vision', 'traveling', 'collecting', 'meditating',
                 'sleeping', 'stargazing', 'warning_spirits', 'remembering_past', 'writing_prophecy', 
                 'blessing_travelers', 'communing_dead', 'interpreting_dreams', 'selling_wares'],
    moods: ['mysterious', 'troubled', 'serene', 'prophetic', 'sad', 'knowing', 'distant', 'warm', 'ominous', 'playful'],
    defaultRelationships: { lester: 40, pavel: 35, cripps: 60, chief: 30 }
  },
  chief: {
    displayName: 'Police Chief',
    color: 0xFFD700,
    defaultLocation: 'office',
    defaultActivity: 'reviewing_cases',
    defaultMood: 'stern',
    locations: ['office', 'patrol', 'crime_scene', 'courthouse', 'stakeout', 'chase', 'interrogation_room', 'home'],
    activities: ['reviewing_cases', 'patrol', 'interrogation', 'paperwork', 'stakeout', 'meeting_informant',
                 'sleeping', 'drinking_coffee', 'target_practice', 'reading_wanted_posters', 'court_testimony',
                 'tracking_suspect', 'briefing_deputies', 'investigating', 'chasing_lead'],
    moods: ['stern', 'determined', 'frustrated', 'satisfied', 'suspicious', 'tired', 'righteous', 'conflicted', 'angry', 'hopeful'],
    defaultRelationships: { lester: -85, pavel: -15, cripps: 20, madam: 40 }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RANDOM EVENTS DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

const PERSONAL_EVENTS = {
  lester: [
    { id: 'close_call', chance: 0.04, title: '🚨 Close Call', 
      message: 'FIB traced one of my proxies. Had to burn three safe houses. Going dark.',
      effects: { location: 'dark', mood: 'paranoid', energy: -30 }, duration: 180, announce: true },
    { id: 'big_score_planning', chance: 0.06, title: '💰 Something Big',
      message: '*encrypted transmission* Got a lead on something. Something huge. Need time to verify.',
      effects: { activity: 'planning_heist', mood: 'excited' }, duration: 360, announce: true },
    { id: 'paranoid_episode', chance: 0.08, title: '👁️ Watching',
      message: 'Someone accessed my backup server. Could be nothing. Could be everything.',
      effects: { activity: 'paranoid_sweep', mood: 'paranoid', energy: -15 }, duration: 120, announce: false },
    { id: 'health_issue', chance: 0.02, title: '🏥 Medical',
      message: 'Need to handle something personal. Medical. I\'ll be back.',
      effects: { location: 'hospital', activity: 'sleeping', energy: -50 }, duration: 480, announce: true },
    { id: 'breakthrough', chance: 0.05, title: '💡 Eureka',
      message: 'HOLY SHIT. I cracked it. The encryption on the Merryweather files. This changes everything.',
      effects: { mood: 'manic', energy: +30 }, duration: 60, announce: true },
    { id: 'late_night_coding', chance: 0.1, title: '💻 Deep Work',
      message: '*3:47 AM* Sleep is for people who don\'t have governments to hack.',
      effects: { activity: 'coding', mood: 'focused' }, duration: 180, announce: false },
    { id: 'new_identity', chance: 0.03, title: '🎭 Ghost Protocol',
      message: 'Creating a new identity. The old one is burned. This is the fifth time this year.',
      effects: { activity: 'erasing_evidence', mood: 'anxious' }, duration: 240, announce: true }
  ],
  
  pavel: [
    { id: 'submarine_issues', chance: 0.05, title: '🔧 Technical Difficulties',
      message: 'Kapitan, we have small problem with ballast tanks. Nothing I cannot fix.',
      effects: { activity: 'repairing_hull', location: 'kosatka' }, duration: 240, announce: true },
    { id: 'homesick', chance: 0.08, title: '🌊 Memories',
      message: 'Playing old songs from home tonight. Missing the cold waters of the north.',
      effects: { mood: 'homesick', activity: 'nostalgic_music' }, duration: 180, announce: true },
    { id: 'scouting_mission', chance: 0.06, title: '🏝️ Reconnaissance',
      message: 'Taking Kosatka close to the island. El Rubio\'s guards are getting sloppy.',
      effects: { location: 'cayo_perico_waters', activity: 'periscope_watch', mood: 'adventurous' }, duration: 300, announce: true },
    { id: 'supply_run', chance: 0.07, title: '📦 Resupply',
      message: 'Docking at Los Santos for supplies. Good Cuban rum is hard to find.',
      effects: { location: 'los_santos_port', mood: 'cheerful' }, duration: 120, announce: true },
    { id: 'deep_dive', chance: 0.04, title: '🐋 Deep Waters',
      message: 'Going deep today. Checking the hull. Is peaceful down there. Like being alone with thoughts.',
      effects: { location: 'deep_dive', mood: 'content' }, duration: 60, announce: true },
    { id: 'cooking', chance: 0.1, title: '🍲 Cooking',
      message: 'Making grandmother\'s borscht recipe. Submarine smells like home now.',
      effects: { activity: 'cooking', mood: 'nostalgic' }, duration: 90, announce: false }
  ],

  cripps: [
    { id: 'hunting_trip', chance: 0.1, title: '🦌 Hunting',
      message: 'Heading into the wilderness. Saw tracks of a legendary buck yesterday.',
      effects: { location: 'hunting', activity: 'hunting', mood: 'content' }, duration: 360, announce: true },
    { id: 'drunk_stories', chance: 0.07, title: '🥃 Old Stories',
      message: 'Found my old flask. Reminds me of Tennessee... you wouldn\'t believe it.',
      effects: { mood: 'drunk', activity: 'drinking' }, duration: 180, announce: true },
    { id: 'dog_missing', chance: 0.03, title: '🐕 Dog Ran Off',
      message: 'Damn dog ran off again. Not that I care. But I\'m going to look. Just because.',
      effects: { location: 'wilderness', mood: 'grumpy' }, duration: 120, announce: true },
    { id: 'thinking_of_madam', chance: 0.05, title: '💭 Old Memories',
      message: '*stares into campfire* Some faces you never forget. Even after all these years.',
      effects: { mood: 'melancholy', activity: 'reminiscing' }, duration: 60, announce: true,
      relationshipChange: { madam: 5 } },
    { id: 'good_trade', chance: 0.06, title: '💰 Good Trade',
      message: 'Sold those pelts for triple what they\'re worth. City folk don\'t know quality.',
      effects: { mood: 'proud', activity: 'trading' }, duration: 60, announce: true },
    { id: 'harmonica', chance: 0.08, title: '🎵 Evening Music',
      message: '*plays harmonica by the fire* Old songs. Sad songs. The best kind.',
      effects: { activity: 'playing_harmonica', mood: 'wistful' }, duration: 45, announce: false }
  ],

  madam: [
    { id: 'dark_vision', chance: 0.06, title: '👁️ Vision',
      message: 'The spirits show me something troubling. Someone here faces a crossroads.',
      effects: { mood: 'troubled', activity: 'having_vision' }, duration: 120, announce: true },
    { id: 'traveling', chance: 0.08, title: '🛤️ The Road Calls',
      message: 'My wagon moves on. The spirits guide me to a new location.',
      effects: { location: 'traveling', activity: 'traveling' }, duration: 240, announce: true },
    { id: 'remembering_cripps', chance: 0.04, title: '💔 Old Flames',
      message: 'The cards showed me him today. That stubborn old man. Some connections transcend time.',
      effects: { mood: 'warm', activity: 'remembering_past' }, duration: 90, announce: true,
      relationshipChange: { cripps: 5 } },
    { id: 'warning', chance: 0.03, title: '⚠️ Warning',
      message: 'I must warn you all. The next three days... be careful. The spirits are restless.',
      effects: { mood: 'prophetic' }, duration: 4320, announce: true },
    { id: 'communion', chance: 0.05, title: '🕯️ The Dead Speak',
      message: 'Spent the night at the old cemetery. The dead have much to say if you listen.',
      effects: { location: 'graveyard', activity: 'communing_dead', mood: 'distant' }, duration: 180, announce: true },
    { id: 'good_omen', chance: 0.04, title: '✨ Good Fortune',
      message: 'A white raven crossed my path. Good fortune comes. Perhaps for someone here.',
      effects: { mood: 'warm' }, duration: 60, announce: true }
  ],

  chief: [
    { id: 'got_lead', chance: 0.07, title: '🔍 New Lead',
      message: 'Got a tip on Crest\'s operation. Could be the break we need.',
      effects: { mood: 'determined', activity: 'stakeout' }, duration: 300, announce: true,
      relationshipChange: { lester: -5 } },
    { id: 'raid_prep', chance: 0.04, title: '🚔 Preparing Operation',
      message: 'Coordinating with agencies. Something big coming. Justice doesn\'t sleep.',
      effects: { activity: 'briefing_deputies', mood: 'stern' }, duration: 480, announce: true },
    { id: 'doubt', chance: 0.05, title: '⚖️ Weight of Justice',
      message: 'Some nights I wonder if I\'m chasing the right criminals. Real monsters wear suits.',
      effects: { mood: 'conflicted' }, duration: 120, announce: true },
    { id: 'respects_nazar', chance: 0.03, title: '🔮 Consulting Madam',
      message: 'Visited the fortune teller. Off the record. She sees things. Don\'t ask me to explain.',
      effects: { mood: 'conflicted' }, duration: 60, announce: true,
      relationshipChange: { madam: 5 } },
    { id: 'almost_got_him', chance: 0.03, title: '🏃 So Close',
      message: 'Got within two blocks of Crest. I could smell his takeout. He got lucky. Next time.',
      effects: { mood: 'frustrated', activity: 'tracking_suspect' }, duration: 120, announce: true,
      relationshipChange: { lester: -10 } },
    { id: 'paperwork', chance: 0.1, title: '📋 Bureaucracy',
      message: 'Drowning in paperwork. The real crime is how much paper the justice system needs.',
      effects: { activity: 'paperwork', mood: 'tired' }, duration: 180, announce: false }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// CROSSOVER EVENTS (Multiple Bots)
// ═══════════════════════════════════════════════════════════════════════════════

const CROSSOVER_EVENTS = [
  {
    id: 'lester_pavel_job',
    chance: 0.025,
    bots: ['lester', 'pavel'],
    title: '🤝 Joint Operation',
    messages: {
      lester: 'Working with Pavel on approach vectors. His submarine expertise is... acceptable.',
      pavel: 'Kapitan Lester has new plan! I provide naval support. This will be glorious!'
    },
    effects: { 
      lester: { activity: 'planning_heist', mood: 'focused' },
      pavel: { activity: 'charting_course', mood: 'excited' }
    },
    duration: 360,
    relationshipChanges: { lester: { pavel: 5 }, pavel: { lester: 5 } }
  },
  {
    id: 'cripps_madam_encounter',
    chance: 0.02,
    bots: ['cripps', 'madam'],
    title: '💫 Paths Cross',
    messages: {
      cripps: 'Saw her wagon on the road today. Didn\'t stop. Just waved. Some things better left.',
      madam: 'He still wears that old pocket watch. I gave him that. Thirty years ago. The fool.'
    },
    effects: {
      cripps: { mood: 'melancholy' },
      madam: { mood: 'warm' }
    },
    duration: 180,
    relationshipChanges: { cripps: { madam: 8 }, madam: { cripps: 8 } },
    storylineAdvance: 'old_flames'
  },
  {
    id: 'chief_hunts_lester',
    chance: 0.02,
    bots: ['chief', 'lester'],
    title: '🚨 Cat and Mouse',
    messages: {
      chief: 'Almost had him. Two blocks away. I could smell his cheap takeout. Next time.',
      lester: 'Old man almost got me. Had to trigger three decoys. This is getting too close.'
    },
    effects: {
      chief: { mood: 'frustrated', activity: 'tracking_suspect' },
      lester: { mood: 'paranoid', location: 'on_the_move', energy: -25 }
    },
    duration: 240,
    relationshipChanges: { chief: { lester: -10 }, lester: { chief: -5 } },
    storylineAdvance: 'long_arm'
  },
  {
    id: 'madam_warns_lester',
    chance: 0.015,
    bots: ['madam', 'lester'],
    title: '⚠️ Cryptic Warning',
    messages: {
      madam: 'I sent him a message through the cards. The Tower, reversed. He will understand.',
      lester: 'Got a weird delivery. Tarot card. "The Tower." Either Nazar is losing it or I need to disappear. NOW.'
    },
    effects: {
      madam: { activity: 'having_vision' },
      lester: { mood: 'paranoid', activity: 'paranoid_sweep' }
    },
    duration: 120
  },
  {
    id: 'pavel_helps_cripps',
    chance: 0.025,
    bots: ['pavel', 'cripps'],
    title: '🤝 Unlikely Friends',
    messages: {
      pavel: 'Old cowboy needed supplies transported. No questions. I like him. Like my grandfather.',
      cripps: 'That submarine fella helped move goods. Strange man. Good man though.'
    },
    effects: {
      pavel: { mood: 'content' },
      cripps: { mood: 'content' }
    },
    duration: 120,
    relationshipChanges: { pavel: { cripps: 8 }, cripps: { pavel: 8 } }
  },
  {
    id: 'chief_respects_madam',
    chance: 0.02,
    bots: ['chief', 'madam'],
    title: '🔮 Consultation',
    messages: {
      chief: 'Asked Madam Nazar about a cold case. Off the record. Her insight was... unsettling.',
      madam: 'The lawman came seeking answers. I showed him what the spirits revealed. Heavy burden he carries.'
    },
    effects: {
      chief: { mood: 'conflicted' },
      madam: { mood: 'knowing' }
    },
    duration: 90,
    relationshipChanges: { chief: { madam: 5 }, madam: { chief: 5 } }
  },
  {
    id: 'all_bots_tension',
    chance: 0.008,
    bots: ['lester', 'pavel', 'cripps', 'madam', 'chief'],
    title: '⚡ Something\'s Coming',
    messages: {
      lester: 'Network traffic is off the charts. Something big is happening. Everyone stay alert.',
      pavel: 'Radio chatter from all directions. Many nervous voices. Something is wrong.',
      cripps: 'Animals are acting strange. Last time this happened... never mind.',
      madam: 'The spirits are screaming. I cannot hear myself think. This is not normal.',
      chief: 'Every informant went silent at the same time. I don\'t like this. Not one bit.'
    },
    effects: {
      lester: { mood: 'paranoid' },
      pavel: { mood: 'worried' },
      cripps: { mood: 'grumpy' },
      madam: { mood: 'troubled' },
      chief: { mood: 'suspicious' }
    },
    duration: 360
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// STORYLINES (Long-form arcs that unfold over weeks)
// ═══════════════════════════════════════════════════════════════════════════════

const STORYLINES = {
  old_flames: {
    name: 'Old Flames',
    description: 'Cripps and Madam Nazar\'s slow-burn reconnection after decades apart.',
    bots: ['cripps', 'madam'],
    minDaysBetweenPhases: 2,
    phases: [
      {
        id: 'first_sight',
        messages: {
          cripps: 'Saw someone from a long time ago today. Thought those days were behind me.',
          madam: 'The cards warned me. He\'s back in my life. Fate has a cruel sense of humor.'
        }
      },
      {
        id: 'tentative_words',
        messages: {
          cripps: 'We talked. Just talked. About the old days. Before everything went wrong.',
          madam: 'He remembered my favorite flower. After thirty years. Stubborn, sentimental fool.'
        }
      },
      {
        id: 'the_locket',
        messages: {
          cripps: 'She kept it. All these years. The locket. I thought I\'d lost everything.',
          madam: 'Some things you cannot throw away. Some memories you cannot burn.'
        }
      },
      {
        id: 'old_wounds',
        messages: {
          cripps: 'We fought. Like old times. She still blames me for leaving. Maybe she\'s right.',
          madam: 'He chose ambition over us. Over everything. The spirits warned me. I didn\'t listen.'
        }
      },
      {
        id: 'forgiveness',
        messages: {
          cripps: 'Asked her to dinner. At our old spot. The one by the river. She said yes.',
          madam: 'Second chances are rare. The cards showed hope today. For the first time in decades.'
        }
      },
      {
        id: 'together',
        messages: {
          cripps: 'Some stories don\'t end the way you think. Some get a second chapter.',
          madam: 'The wheel turns. What was broken can be mended. We are proof of that.'
        }
      }
    ]
  },
  
  long_arm: {
    name: 'The Long Arm',
    description: 'Police Chief\'s relentless pursuit of Lester, with unexpected complications.',
    bots: ['chief', 'lester'],
    minDaysBetweenPhases: 3,
    phases: [
      {
        id: 'cold_case',
        messages: {
          chief: 'Found an old file. 2013. Bank hacks. Never solved. But I recognize the signature now.',
          lester: 'Someone\'s digging. Old files. I buried those deep. Not deep enough apparently.'
        }
      },
      {
        id: 'informant',
        messages: {
          chief: 'Got someone inside. Took months. But we\'re close now. So close.',
          lester: 'There\'s a rat. I can feel it. Someone in the network isn\'t who they say.'
        }
      },
      {
        id: 'near_miss',
        messages: {
          chief: 'Raid came up empty. He was there fifteen minutes before. FIFTEEN MINUTES.',
          lester: 'They hit the warehouse. Got out with seconds to spare. This is too close.'
        }
      },
      {
        id: 'doubt',
        messages: {
          chief: 'Found something. Crest helped someone here. Anonymously. Why would he do that?',
          lester: 'Cop\'s hesitating. Let him wonder if I\'m all bad. I\'m not. Mostly.'
        }
      },
      {
        id: 'confrontation',
        messages: {
          chief: 'We talked. Face to face. First time. He\'s not what I expected. Still guilty though.',
          lester: 'Met the old man. We... came to an understanding. For now.'
        }
      }
    ]
  },

  the_score: {
    name: 'The Big Score',
    description: 'Lester and Pavel plan the heist of a lifetime.',
    bots: ['lester', 'pavel'],
    minDaysBetweenPhases: 4,
    phases: [
      {
        id: 'discovery',
        messages: {
          lester: 'Found it. THE one. The score that retires everyone. Need to verify.',
          pavel: 'Kapitan is excited about something. When he gets like this... big things happen.'
        }
      },
      {
        id: 'planning',
        messages: {
          lester: 'Reaching out to Pavel. Need his expertise. Submarine approach.',
          pavel: 'We plan something BIG. The biggest. I am making preparations!'
        }
      },
      {
        id: 'complications',
        messages: {
          lester: 'The chief sniffing around at the worst time. Could ruin everything.',
          madam: 'I had a vision. Blood and gold. Success and tragedy intertwined.'
        }
      },
      {
        id: 'go_time',
        messages: {
          lester: 'It\'s happening. Right now. Radio silence.',
          pavel: 'Diving now. See you on the other side. If we don\'t return... it was honor.'
        }
      },
      {
        id: 'aftermath',
        messages: {
          lester: 'We did it. WE ACTUALLY DID IT. Details later. Need to disappear.',
          chief: 'Something big went down last night. Rumors everywhere. This isn\'t over.'
        }
      }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRISIS EVENTS (Rare, major server-wide impact)
// ═══════════════════════════════════════════════════════════════════════════════

const CRISIS_EVENTS = [
  {
    id: 'lester_captured',
    chance: 0.003,
    title: '🚨 BREAKING: Lester Gone Dark',
    description: 'No contact from Lester in 24 hours. Last transmission cut off mid-sentence.',
    duration: 1440,
    affectedBot: 'lester',
    effects: { lester: { location: 'dark', mood: 'anxious', activity: 'sleeping' } },
    otherBotMessages: {
      pavel: 'Kapitan Lester is missing. This is very bad. I am tracing his last position.',
      cripps: 'That nervous fella disappeared? Can\'t say I\'m surprised.',
      madam: 'I saw this. The Tower. The chains. But there is hope - the Star follows.',
      chief: 'Crest in the wind. Or someone got to him first. I need answers.'
    }
  },
  {
    id: 'kosatka_trouble',
    chance: 0.003,
    title: '🆘 Kosatka Emergency',
    description: 'Pavel\'s submarine has gone silent. Last known position near international waters.',
    duration: 720,
    affectedBot: 'pavel',
    effects: { pavel: { location: 'deep_dive', mood: 'worried', activity: 'repairing_hull' } },
    otherBotMessages: {
      lester: 'Lost contact with Pavel. Satellite shows Kosatka drifting. This is bad.',
      cripps: 'That submarine man in trouble? Hope he\'s okay. Strange fellow but good.',
      madam: 'He is alive. The spirits show me water and darkness. But also light. He will return.',
      chief: 'Naval distress signal. Not my jurisdiction but... hope he makes it.'
    }
  },
  {
    id: 'community_threat',
    chance: 0.005,
    title: '⚠️ External Threat',
    description: 'All bots have received intelligence about an external threat to the community.',
    duration: 480,
    otherBotMessages: {
      lester: 'We have a problem. A REAL one. Setting aside differences for now.',
      pavel: 'Kapitan says all hands on deck. When Lester is serious, we listen.',
      cripps: 'Don\'t know what\'s happening but everyone\'s spooked. Keeping my rifle close.',
      madam: 'Dark forces gather. This community faces a test. But I see you surviving.',
      chief: 'For today, we\'re on the same side. Don\'t get used to it, Crest.'
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// LIVING WORLD ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class LivingWorldEngine {
  constructor(pool, client, anthropic, botId) {
    this.pool = pool;
    this.client = client;
    this.anthropic = anthropic;
    this.botId = botId;
    this.config = BOT_PROFILES[botId];
    this.state = null;
    this.announcementChannelId = null;
    this.isRunning = false;
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS living_world_state (
        bot_id TEXT PRIMARY KEY,
        location TEXT, activity TEXT, mood TEXT, energy INTEGER DEFAULT 75,
        relationships JSONB DEFAULT '{}',
        recent_events JSONB DEFAULT '[]',
        secrets JSONB DEFAULT '[]',
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS living_world_events (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL, bot_id TEXT, event_type TEXT,
        data JSONB, started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ends_at TIMESTAMP, announced BOOLEAN DEFAULT FALSE, completed BOOLEAN DEFAULT FALSE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS living_world_storylines (
        storyline_id TEXT PRIMARY KEY, current_phase INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_advance TIMESTAMP, completed BOOLEAN DEFAULT FALSE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS living_world_history (
        id SERIAL PRIMARY KEY, bot_id TEXT, event_type TEXT,
        description TEXT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.loadState();
    console.log(`🌍 Living World initialized for ${this.config.displayName}`);
  }

  async loadState() {
    const res = await this.pool.query('SELECT * FROM living_world_state WHERE bot_id = $1', [this.botId]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      this.state = {
        location: row.location,
        activity: row.activity,
        mood: row.mood,
        energy: row.energy,
        relationships: row.relationships || this.config.defaultRelationships,
        recentEvents: row.recent_events || [],
        secrets: row.secrets || []
      };
    } else {
      this.state = {
        location: this.config.defaultLocation,
        activity: this.config.defaultActivity,
        mood: this.config.defaultMood,
        energy: 75,
        relationships: { ...this.config.defaultRelationships },
        recentEvents: [],
        secrets: []
      };
      await this.saveState();
    }
  }

  async saveState() {
    await this.pool.query(`
      INSERT INTO living_world_state (bot_id, location, activity, mood, energy, relationships, recent_events, secrets, last_update)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (bot_id) DO UPDATE SET
        location = $2, activity = $3, mood = $4, energy = $5,
        relationships = $6, recent_events = $7, secrets = $8, last_update = CURRENT_TIMESTAMP
    `, [this.botId, this.state.location, this.state.activity, this.state.mood, 
        this.state.energy, JSON.stringify(this.state.relationships),
        JSON.stringify(this.state.recentEvents), JSON.stringify(this.state.secrets)]);
  }

  getCurrentState() { return this.state; }

  buildStateContext() {
    if (!this.state) return '';
    const s = this.state;
    let ctx = `\n[YOUR CURRENT STATE - Let this subtly influence you]
Location: ${s.location} | Activity: ${s.activity} | Mood: ${s.mood} | Energy: ${s.energy}%`;
    
    if (s.recentEvents?.length > 0) {
      ctx += '\nRecent events you can reference:';
      s.recentEvents.slice(0, 3).forEach(e => ctx += `\n- ${e.description}`);
    }

    if (s.relationships) {
      ctx += '\nRelationships:';
      Object.entries(s.relationships).forEach(([bot, level]) => {
        let status = level >= 60 ? 'ally' : level >= 30 ? 'friendly' : level >= 0 ? 'neutral' : level >= -40 ? 'tense' : 'enemy';
        ctx += ` ${bot}(${status})`;
      });
    }
    return ctx;
  }

  start(announcementChannelId) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.announcementChannelId = announcementChannelId;

    // Every 15 min: state drift
    this.stateTimer = setInterval(() => this.driftState(), 15 * 60 * 1000);
    // Every 30 min: random events
    this.eventTimer = setInterval(() => this.checkEvents(), 30 * 60 * 1000);
    // Every 8 hours: storyline advancement
    this.storyTimer = setInterval(() => this.advanceStorylines(), 8 * 60 * 60 * 1000);

    setTimeout(() => { this.driftState(); this.checkEvents(); }, 10000);
    console.log(`🎭 Living World ACTIVE for ${this.config.displayName}`);
  }

  stop() {
    this.isRunning = false;
    if (this.stateTimer) clearInterval(this.stateTimer);
    if (this.eventTimer) clearInterval(this.eventTimer);
    if (this.storyTimer) clearInterval(this.storyTimer);
  }

  async driftState() {
    const active = await this.getActiveEvent();
    if (active) return;

    const hour = new Date().getHours();

    // Activity drift
    if (Math.random() < 0.25) {
      this.state.activity = this.config.activities[Math.floor(Math.random() * this.config.activities.length)];
    }

    // Late night mood shifts
    if (hour >= 1 && hour <= 5 && Math.random() < 0.3) {
      const lateNight = { lester: 'exhausted', pavel: 'homesick', cripps: 'nostalgic', madam: 'prophetic', chief: 'conflicted' };
      this.state.mood = lateNight[this.botId] || this.state.mood;
    }

    // Energy management
    if (this.state.activity === 'sleeping') {
      this.state.energy = Math.min(100, this.state.energy + 15);
    } else {
      this.state.energy = Math.max(10, this.state.energy - 3);
    }

    if (this.state.energy < 20 && Math.random() < 0.4) {
      this.state.activity = 'sleeping';
      this.state.mood = 'tired';
    }

    await this.saveState();
  }

  async checkEvents() {
    const active = await this.getActiveEvent();
    if (active) return;

    // Personal events
    const events = PERSONAL_EVENTS[this.botId] || [];
    for (const event of events) {
      if (Math.random() < event.chance) {
        await this.triggerEvent(event);
        return;
      }
    }

    // Crossover events
    if (Math.random() < 0.4) {
      for (const event of CROSSOVER_EVENTS) {
        if (event.bots.includes(this.botId) && Math.random() < event.chance) {
          await this.triggerCrossover(event);
          return;
        }
      }
    }

    // Crisis events (very rare)
    for (const crisis of CRISIS_EVENTS) {
      if (Math.random() < crisis.chance) {
        await this.triggerCrisis(crisis);
        return;
      }
    }
  }

  async triggerEvent(event) {
    const endsAt = new Date(Date.now() + event.duration * 60 * 1000);
    
    await this.pool.query(`
      INSERT INTO living_world_events (event_id, bot_id, event_type, data, ends_at)
      VALUES ($1, $2, 'personal', $3, $4)
    `, [event.id, this.botId, JSON.stringify(event), endsAt]);

    if (event.effects) Object.assign(this.state, event.effects);
    if (event.relationshipChange) {
      Object.entries(event.relationshipChange).forEach(([bot, delta]) => {
        if (this.state.relationships[bot] !== undefined) {
          this.state.relationships[bot] = Math.max(-100, Math.min(100, this.state.relationships[bot] + delta));
        }
      });
    }

    this.state.recentEvents.unshift({ id: event.id, title: event.title, description: event.message, time: new Date().toISOString() });
    while (this.state.recentEvents.length > 10) this.state.recentEvents.pop();

    await this.saveState();
    await this.pool.query('INSERT INTO living_world_history (bot_id, event_type, description) VALUES ($1, $2, $3)',
      [this.botId, event.id, event.message]);

    if (event.announce) await this.announce(event.title, event.message);
    console.log(`🎭 [${this.botId}] Event: ${event.title}`);
  }

  async triggerCrossover(event) {
    const endsAt = new Date(Date.now() + event.duration * 60 * 1000);
    
    await this.pool.query(`
      INSERT INTO living_world_events (event_id, bot_id, event_type, data, ends_at)
      VALUES ($1, $2, 'crossover', $3, $4)
    `, [event.id, this.botId, JSON.stringify(event), endsAt]);

    if (event.effects?.[this.botId]) Object.assign(this.state, event.effects[this.botId]);
    if (event.relationshipChanges?.[this.botId]) {
      Object.entries(event.relationshipChanges[this.botId]).forEach(([bot, delta]) => {
        if (this.state.relationships[bot] !== undefined) {
          this.state.relationships[bot] = Math.max(-100, Math.min(100, this.state.relationships[bot] + delta));
        }
      });
    }

    const msg = event.messages[this.botId];
    this.state.recentEvents.unshift({ id: event.id, title: event.title, description: msg, crossover: true, time: new Date().toISOString() });
    await this.saveState();

    await this.announce(event.title, `**${this.config.displayName}:** ${msg}`, 0xFFD700);
    if (event.storylineAdvance) await this.advanceStoryline(event.storylineAdvance);
    console.log(`🎭 [${this.botId}] Crossover: ${event.title}`);
  }

  async triggerCrisis(crisis) {
    const endsAt = new Date(Date.now() + crisis.duration * 60 * 1000);
    
    await this.pool.query(`
      INSERT INTO living_world_events (event_id, bot_id, event_type, data, ends_at)
      VALUES ($1, $2, 'crisis', $3, $4)
    `, [crisis.id, this.botId, JSON.stringify(crisis), endsAt]);

    if (crisis.effects?.[this.botId]) Object.assign(this.state, crisis.effects[this.botId]);
    await this.saveState();

    const msg = crisis.otherBotMessages[this.botId];
    if (msg) await this.announce(`🚨 ${crisis.title}`, `**${this.config.displayName}:** ${msg}`, 0xFF0000);
    console.log(`🚨 [${this.botId}] CRISIS: ${crisis.title}`);
  }

  async advanceStorylines() {
    for (const [id, storyline] of Object.entries(STORYLINES)) {
      if (!storyline.bots.includes(this.botId)) continue;

      const res = await this.pool.query('SELECT * FROM living_world_storylines WHERE storyline_id = $1', [id]);
      
      if (res.rows.length === 0) {
        // 5% chance to start new storyline
        if (Math.random() < 0.05) {
          await this.pool.query(`INSERT INTO living_world_storylines (storyline_id, current_phase, last_advance) VALUES ($1, 0, CURRENT_TIMESTAMP)`, [id]);
          const phase = storyline.phases[0];
          if (phase.messages[this.botId]) {
            await this.announce(`📖 ${storyline.name}`, `**${this.config.displayName}:** ${phase.messages[this.botId]}`, 0x9B59B6);
          }
        }
      } else {
        const progress = res.rows[0];
        if (progress.completed) continue;

        const daysSince = (Date.now() - new Date(progress.last_advance).getTime()) / (24 * 60 * 60 * 1000);
        if (daysSince < storyline.minDaysBetweenPhases) continue;

        // 20% chance to advance
        if (Math.random() < 0.2) {
          const next = progress.current_phase + 1;
          if (next >= storyline.phases.length) {
            await this.pool.query('UPDATE living_world_storylines SET completed = TRUE WHERE storyline_id = $1', [id]);
          } else {
            await this.pool.query('UPDATE living_world_storylines SET current_phase = $1, last_advance = CURRENT_TIMESTAMP WHERE storyline_id = $2', [next, id]);
            const phase = storyline.phases[next];
            if (phase.messages[this.botId]) {
              await this.announce(`📖 ${storyline.name}`, `**${this.config.displayName}:** ${phase.messages[this.botId]}`, 0x9B59B6);
            }
          }
        }
      }
    }
  }

  async advanceStoryline(storylineId) {
    // Force advance specific storyline
    const res = await this.pool.query('SELECT * FROM living_world_storylines WHERE storyline_id = $1', [storylineId]);
    if (res.rows.length === 0) {
      await this.pool.query('INSERT INTO living_world_storylines (storyline_id, current_phase, last_advance) VALUES ($1, 0, CURRENT_TIMESTAMP)', [storylineId]);
    }
  }

  async getActiveEvent() {
    await this.pool.query(`UPDATE living_world_events SET completed = TRUE WHERE bot_id = $1 AND ends_at < CURRENT_TIMESTAMP AND completed = FALSE`, [this.botId]);
    const res = await this.pool.query(`SELECT * FROM living_world_events WHERE bot_id = $1 AND completed = FALSE AND ends_at > CURRENT_TIMESTAMP ORDER BY started_at DESC LIMIT 1`, [this.botId]);
    return res.rows[0] || null;
  }

  async announce(title, description, color = null) {
    if (!this.announcementChannelId) return;
    const channel = this.client.channels.cache.get(this.announcementChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color || this.config.color)
      .setFooter({ text: `${this.config.displayName} • Living World` })
      .setTimestamp();

    try { await channel.send({ embeds: [embed] }); } catch (e) { console.error('Announce failed:', e.message); }
  }

  getRelationship(bot) { return this.state?.relationships?.[bot] ?? 0; }
  
  async modifyRelationship(bot, delta) {
    if (!this.state?.relationships || this.state.relationships[bot] === undefined) return;
    this.state.relationships[bot] = Math.max(-100, Math.min(100, this.state.relationships[bot] + delta));
    await this.saveState();
  }
}

module.exports = { LivingWorldEngine, BOT_PROFILES, PERSONAL_EVENTS, CROSSOVER_EVENTS, STORYLINES, CRISIS_EVENTS };
