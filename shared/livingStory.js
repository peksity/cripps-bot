/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LIVING STORY ENGINE v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This creates ONGOING STORYLINES that evolve over days/weeks.
 * 
 * The bots aren't just chatting - they're LIVING through narratives:
 * - Multi-week story arcs with phases
 * - User participation influences outcomes
 * - Permanent consequences that become lore
 * - Cross-bot involvement and drama
 * - Organic story emergence from interactions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA = `
-- Active story arcs
CREATE TABLE IF NOT EXISTS story_arcs (
  id SERIAL PRIMARY KEY,
  arc_id VARCHAR(64) UNIQUE NOT NULL,
  arc_type VARCHAR(64) NOT NULL,
  title VARCHAR(256),
  description TEXT,
  current_phase INT DEFAULT 1,
  total_phases INT DEFAULT 5,
  started_at TIMESTAMP DEFAULT NOW(),
  last_update TIMESTAMP DEFAULT NOW(),
  scheduled_next TIMESTAMP,
  status VARCHAR(32) DEFAULT 'active',
  participants JSONB DEFAULT '[]',
  user_participants JSONB DEFAULT '[]',
  key_events JSONB DEFAULT '[]',
  variables JSONB DEFAULT '{}',
  outcome VARCHAR(64)
);

-- Story events (individual moments in the arc)
CREATE TABLE IF NOT EXISTS story_events (
  id SERIAL PRIMARY KEY,
  arc_id VARCHAR(64) REFERENCES story_arcs(arc_id),
  event_type VARCHAR(64),
  phase INT,
  bot_id VARCHAR(32),
  content TEXT,
  user_reactions JSONB DEFAULT '{}',
  occurred_at TIMESTAMP DEFAULT NOW(),
  importance INT DEFAULT 5
);

-- Completed stories (for lore reference)
CREATE TABLE IF NOT EXISTS story_lore (
  id SERIAL PRIMARY KEY,
  arc_id VARCHAR(64),
  title VARCHAR(256),
  summary TEXT,
  outcome VARCHAR(64),
  heroes JSONB DEFAULT '[]',
  villains JSONB DEFAULT '[]',
  memorable_moments JSONB DEFAULT '[]',
  completed_at TIMESTAMP DEFAULT NOW(),
  referenced_count INT DEFAULT 0
);

-- Story hooks (potential story triggers from conversations)
CREATE TABLE IF NOT EXISTS story_hooks (
  id SERIAL PRIMARY KEY,
  hook_type VARCHAR(64),
  trigger_content TEXT,
  detected_at TIMESTAMP DEFAULT NOW(),
  used BOOLEAN DEFAULT FALSE,
  potential_arc VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_arcs_status ON story_arcs(status);
CREATE INDEX IF NOT EXISTS idx_events_arc ON story_events(arc_id);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// STORY ARC TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const STORY_TEMPLATES = {
  heist: {
    title: "The Big Score",
    description: "A major heist is being planned...",
    phases: [
      {
        name: "rumors",
        duration: { min: 2, max: 4 }, // days
        events: [
          { bot: 'lester', type: 'hint', message: "*checks over shoulder* I've been looking into something big. Real big. But I need people I can trust." },
          { bot: 'lester', type: 'recruitment', message: "You know anyone good with... let's say, 'alternative acquisitions'?" },
          { bot: 'pavel', type: 'overhear', message: "Kapitan, I hear whispers. Lester is planning something, da? The submarine is ready if needed." }
        ]
      },
      {
        name: "planning",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'lester', type: 'details', message: "Okay, here's what I'm thinking. There's a vault. High security. But I found a weakness in their system." },
          { bot: 'pavel', type: 'input', message: "I can provide water extraction. Silent. No trace. Is what submarine does best." },
          { bot: 'cripps', type: 'volunteer', message: "Now hold on just a minute. If there's money involved, old Cripps wants in. I've cracked safes before, you know." },
          { bot: 'chief', type: 'suspicion', message: "*reviews reports* Something's brewing. I can feel it. Too many familiar faces acting too casual." }
        ]
      },
      {
        name: "preparation",
        duration: { min: 2, max: 3 },
        events: [
          { bot: 'lester', type: 'equipment', message: "I need everyone to lay low. No suspicious activity. Chief's been sniffing around." },
          { bot: 'madam', type: 'warning', message: "*cards spread before her* I see danger. A choice must be made. One path leads to glory, another to ruin." },
          { bot: 'chief', type: 'investigation', message: "Got an anonymous tip. Something about a 'big score.' Anyone want to tell me what that's about?" }
        ]
      },
      {
        name: "execution",
        duration: { min: 1, max: 2 },
        events: [
          { bot: 'lester', type: 'go_time', message: "It's happening. Everyone knows their role. Radio silence from here." },
          { bot: 'pavel', type: 'action', message: "*submarine surfaces briefly* Package acquired, kapitan! Returning to deep water!" },
          { bot: 'cripps', type: 'action', message: "The safe is open! Easier than the Tennessee job, I tell you what!" },
          { bot: 'chief', type: 'pursuit', message: "All units! We've got a situation! Suspects are—wait, where'd they go?!" }
        ]
      },
      {
        name: "aftermath",
        duration: { min: 3, max: 7 },
        events: [
          { bot: 'lester', type: 'success', message: "*counts money* Not bad. Not bad at all. Everyone gets their cut." },
          { bot: 'pavel', type: 'celebration', message: "We did it, kapitan! Tonight, we drink! Tomorrow, we lay low." },
          { bot: 'chief', type: 'aftermath', message: "*slams desk* They got away. This time. But I'll remember every face." },
          { bot: 'madam', type: 'prophecy', message: "The cards showed true. But remember, every action casts ripples through time..." }
        ]
      }
    ],
    outcomes: {
      success: "The heist was successful. The crew got away clean.",
      partial: "The heist was messy, but most of the crew escaped.",
      failure: "The heist went wrong. Chief was waiting.",
      betrayal: "Someone talked. The crew barely escaped."
    },
    loreImpact: {
      success: ["became legendary", "still referenced months later"],
      failure: ["never spoken of again", "Chief mentions it smugly"]
    }
  },

  mystery: {
    title: "The Strange Occurrence",
    description: "Something unexplained is happening...",
    phases: [
      {
        name: "discovery",
        duration: { min: 2, max: 4 },
        events: [
          { bot: 'madam', type: 'vision', message: "*gasps* The spirits... they're agitated. Something approaches that should not be." },
          { bot: 'cripps', type: 'witness', message: "You're not gonna believe this, but I saw something out by the old mill. Lights. Moving on their own." },
          { bot: 'chief', type: 'report', message: "Got some strange reports coming in. Lights in the sky, missing time. Probably nothing but..." }
        ]
      },
      {
        name: "investigation",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'lester', type: 'research', message: "I've been digging into those 'lights' everyone's talking about. Found some... interesting government files." },
          { bot: 'madam', type: 'seance', message: "I attempted to contact the spirits about this phenomenon. They would not speak. They were... afraid." },
          { bot: 'pavel', type: 'sighting', message: "Kapitan, the submarine radar picked up something. Moving fast. Very fast. Then... gone." }
        ]
      },
      {
        name: "confrontation",
        duration: { min: 2, max: 3 },
        events: [
          { bot: 'cripps', type: 'encounter', message: "*shaking* I saw it up close. It wasn't human. It wasn't animal. It looked at me and I felt... understood." },
          { bot: 'lester', type: 'theory', message: "Okay, hear me out. What if it's not aliens. What if it's us? From somewhere else?" },
          { bot: 'madam', type: 'revelation', message: "I understand now. It is neither threat nor friend. It simply... observes. As I do." }
        ]
      },
      {
        name: "resolution",
        duration: { min: 2, max: 4 },
        events: [
          { bot: 'chief', type: 'coverup', message: "Official statement: Weather balloons. Case closed. *burns file*" },
          { bot: 'madam', type: 'aftermath', message: "It has moved on. But it left something behind. A gift? A warning? Time will tell." },
          { bot: 'lester', type: 'paranoia', message: "I'm keeping records. Encrypted. If anything happens to me, the truth is out there." }
        ]
      }
    ],
    outcomes: {
      solved: "The mystery was explained. Mostly.",
      unsolved: "Some questions have no answers.",
      ongoing: "It's still out there. Watching."
    }
  },

  rivalry: {
    title: "The Feud",
    description: "Tensions are rising between two bots...",
    phases: [
      {
        name: "tension",
        duration: { min: 2, max: 4 },
        events: [
          { bot: 'dynamic', type: 'insult', message: "You know what? I've had enough of your [trait]. Always [behavior]." },
          { bot: 'dynamic', type: 'defense', message: "Excuse me? At least I don't [counter_trait]. Everyone sees it." }
        ]
      },
      {
        name: "escalation",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'dynamic', type: 'accusation', message: "I know what you did. Don't think I forgot about [past_event]." },
          { bot: 'dynamic', type: 'allies', message: "[ally], back me up here. You saw what happened." },
          { bot: 'dynamic', type: 'threat', message: "Keep talking. See what happens." }
        ]
      },
      {
        name: "confrontation",
        duration: { min: 1, max: 2 },
        events: [
          { bot: 'dynamic', type: 'showdown', message: "This ends now. One of us walks away, one of us admits they were wrong." },
          { bot: 'mediator', type: 'intervention', message: "Alright, both of you, stop. This is getting out of hand." }
        ]
      },
      {
        name: "resolution",
        duration: { min: 2, max: 4 },
        events: [
          { bot: 'dynamic', type: 'reconcile', message: "...Maybe I was too harsh. You're not completely terrible." },
          { bot: 'dynamic', type: 'grudge', message: "Fine. Truce. But I won't forget this." }
        ]
      }
    ],
    outcomes: {
      reconciled: "They worked it out. Stronger than before.",
      truce: "Uneasy peace. The tension lingers.",
      enemies: "The feud continues. Maybe forever."
    }
  },

  tournament: {
    title: "The Great Competition",
    description: "A challenge has been issued...",
    phases: [
      {
        name: "challenge",
        duration: { min: 1, max: 2 },
        events: [
          { bot: 'challenger', type: 'issue', message: "I hereby challenge anyone brave enough to a contest of [skill]. Winner takes bragging rights." },
          { bot: 'various', type: 'accept', message: "You're on. Prepare to lose." }
        ]
      },
      {
        name: "competition",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'various', type: 'round', message: "Round [n]: And [bot] takes the lead with an impressive [action]!" },
          { bot: 'various', type: 'upset', message: "UPSET! [underdog] pulls ahead! No one saw this coming!" },
          { bot: 'various', type: 'drama', message: "Wait, is that legal? [bot] is calling foul!" }
        ]
      },
      {
        name: "finale",
        duration: { min: 1, max: 2 },
        events: [
          { bot: 'winner', type: 'victory', message: "AND THE WINNER IS... [winner]! What a competition!" },
          { bot: 'loser', type: 'reaction', message: "[graceful/salty reaction to losing]" }
        ]
      }
    ],
    outcomes: {
      graceful: "A fair competition. Respect all around.",
      controversial: "The results are disputed to this day.",
      legendary: "A competition for the ages."
    }
  },

  secret: {
    title: "The Hidden Truth",
    description: "Someone is hiding something...",
    phases: [
      {
        name: "hints",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'keeper', type: 'slip', message: "I—no, never mind. Forget I said anything." },
          { bot: 'observer', type: 'notice', message: "Did anyone else notice [keeper] acting strange? Something's off." }
        ]
      },
      {
        name: "investigation",
        duration: { min: 3, max: 5 },
        events: [
          { bot: 'detective', type: 'probe', message: "[keeper], we need to talk. What aren't you telling us?" },
          { bot: 'keeper', type: 'deflect', message: "Nothing! Everything's fine. Why would you even ask that?" }
        ]
      },
      {
        name: "revelation",
        duration: { min: 1, max: 2 },
        events: [
          { bot: 'keeper', type: 'confess', message: "*sighs* Fine. You want the truth? The truth is... [secret]." },
          { bot: 'various', type: 'react', message: "[shocked/supportive/angry reaction]" }
        ]
      },
      {
        name: "aftermath",
        duration: { min: 2, max: 4 },
        events: [
          { bot: 'various', type: 'adjust', message: "I had no idea. This changes everything. Or... does it?" },
          { bot: 'keeper', type: 'relief', message: "It feels good to finally tell someone. Thank you for listening." }
        ]
      }
    ],
    outcomes: {
      accepted: "The secret is out. Everyone understands.",
      complicated: "Some things are harder to accept than others.",
      hidden: "The secret stays between us. Forever."
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOT SECRET POOLS (for secret arc)
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_SECRETS = {
  lester: [
    "I'm not actually that good at hacking. Half my 'hacks' are just social engineering.",
    "I once helped a cop. Anonymously. Saved someone's life. Couldn't live with myself if I didn't.",
    "I actually miss having a normal life sometimes. A desk job. Regular hours. Boring stability.",
    "There's a file on me. In every agency. They let me operate because I'm useful. I know too much."
  ],
  pavel: [
    "I wasn't always a submarine captain. In Russia, I was... something else. Something I'm not proud of.",
    "The submarine isn't mine. I stole it. From people who are still looking.",
    "I have a family back home. Wife. Daughter. They think I'm dead. It's safer that way.",
    "I am not actually Russian. Is very convincing accent though, da?"
  ],
  cripps: [
    "Half my stories are stolen from better men. I just tell 'em louder.",
    "I never robbed the Tennessee bank. I was the lookout who ran. Left my partners behind.",
    "I can't actually read. Never learned. Been faking it for sixty years.",
    "There's someone out there. From the old days. Looking for me. For what I did."
  ],
  madam: [
    "I cannot actually see the future. But I've learned to read people so well, it looks the same.",
    "I was born in New Jersey. The accent is fake. The mysticism sells.",
    "Once, my prediction killed someone. They believed too strongly and made it true.",
    "The spirits are real. I started pretending, but somewhere along the way... they started answering."
  ],
  chief: [
    "I let a guilty man go free. He was guilty, but... he was also right.",
    "My first day on the job, I planted evidence. Still think about it every night.",
    "I know who Lester is. Always have. Some things are bigger than the law.",
    "I'm not chasing criminals anymore. I'm running from who I used to be."
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORY ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class LivingStoryEngine {
  constructor(pool) {
    this.pool = pool;
    this.initialized = false;
    this.activeArcs = new Map();
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.pool.query(SCHEMA);
      await this.loadActiveArcs();
      this.initialized = true;
      console.log('[STORY] Living Story Engine initialized');
    } catch (error) {
      console.error('[STORY] Init error:', error);
    }
  }

  async loadActiveArcs() {
    try {
      const result = await this.pool.query(
        "SELECT * FROM story_arcs WHERE status = 'active'"
      );
      for (const arc of result.rows) {
        this.activeArcs.set(arc.arc_id, arc);
      }
      console.log(`[STORY] Loaded ${this.activeArcs.size} active arcs`);
    } catch (error) {
      console.error('[STORY] Load arcs error:', error);
    }
  }

  /**
   * Check if we should start a new story arc
   */
  async shouldStartNewArc() {
    // Only one major arc at a time
    if (this.activeArcs.size >= 1) return null;

    // Random chance each day (10%)
    if (Math.random() > 0.10) return null;

    // Pick a random arc type
    const arcTypes = Object.keys(STORY_TEMPLATES);
    const arcType = arcTypes[Math.floor(Math.random() * arcTypes.length)];
    
    return arcType;
  }

  /**
   * Start a new story arc
   */
  async startArc(arcType, initiator = null) {
    await this.initialize();
    
    const template = STORY_TEMPLATES[arcType];
    if (!template) return null;

    const arcId = `${arcType}_${Date.now()}`;
    
    try {
      const result = await this.pool.query(
        `INSERT INTO story_arcs 
         (arc_id, arc_type, title, description, total_phases, participants)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [arcId, arcType, template.title, template.description, 
         template.phases.length, JSON.stringify(initiator ? [initiator] : [])]
      );

      const arc = result.rows[0];
      this.activeArcs.set(arcId, arc);
      
      console.log(`[STORY] Started new arc: ${template.title}`);
      return arc;
    } catch (error) {
      console.error('[STORY] Start arc error:', error);
      return null;
    }
  }

  /**
   * Get current phase events for a bot
   */
  getPhaseEvents(arcType, phase, botId) {
    const template = STORY_TEMPLATES[arcType];
    if (!template || !template.phases[phase - 1]) return [];

    const phaseData = template.phases[phase - 1];
    return phaseData.events.filter(e => 
      e.bot === botId || e.bot === 'dynamic' || e.bot === 'various'
    );
  }

  /**
   * Check if it's time for a story beat
   */
  async checkStoryBeats(botId) {
    const beats = [];

    for (const [arcId, arc] of this.activeArcs) {
      const template = STORY_TEMPLATES[arc.arc_type];
      if (!template) continue;

      const phase = template.phases[arc.current_phase - 1];
      if (!phase) continue;

      // Check if enough time has passed for this phase
      const lastUpdate = new Date(arc.last_update);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Random chance within phase duration
      const shouldTrigger = daysSinceUpdate >= 0.5 && Math.random() < 0.15;
      
      if (shouldTrigger) {
        const events = this.getPhaseEvents(arc.arc_type, arc.current_phase, botId);
        if (events.length > 0) {
          const event = events[Math.floor(Math.random() * events.length)];
          beats.push({
            arcId,
            arc,
            phase: arc.current_phase,
            phaseName: phase.name,
            event
          });
        }
      }
    }

    return beats;
  }

  /**
   * Record a story event
   */
  async recordEvent(arcId, botId, eventType, content) {
    try {
      const arc = this.activeArcs.get(arcId);
      if (!arc) return;

      await this.pool.query(
        `INSERT INTO story_events (arc_id, event_type, phase, bot_id, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [arcId, eventType, arc.current_phase, botId, content]
      );

      // Update arc
      await this.pool.query(
        `UPDATE story_arcs SET last_update = NOW(),
         key_events = key_events || $2::jsonb
         WHERE arc_id = $1`,
        [arcId, JSON.stringify([{ bot: botId, event: eventType, time: new Date().toISOString() }])]
      );

      // Check if phase should advance
      await this.checkPhaseAdvancement(arcId);
    } catch (error) {
      console.error('[STORY] Record event error:', error);
    }
  }

  /**
   * Check if phase should advance
   */
  async checkPhaseAdvancement(arcId) {
    try {
      const arc = this.activeArcs.get(arcId);
      if (!arc) return;

      const template = STORY_TEMPLATES[arc.arc_type];
      const phase = template.phases[arc.current_phase - 1];
      
      // Count events in current phase
      const result = await this.pool.query(
        'SELECT COUNT(*) FROM story_events WHERE arc_id = $1 AND phase = $2',
        [arcId, arc.current_phase]
      );
      
      const eventCount = parseInt(result.rows[0].count);
      const minEvents = phase.events.length * 0.6; // 60% of events needed

      // Check time and events
      const lastUpdate = new Date(arc.last_update);
      const daysSinceStart = (Date.now() - new Date(arc.started_at).getTime()) / (1000 * 60 * 60 * 24);
      
      if (eventCount >= minEvents || daysSinceStart > phase.duration.max) {
        // Advance phase
        if (arc.current_phase < arc.total_phases) {
          await this.pool.query(
            'UPDATE story_arcs SET current_phase = current_phase + 1, last_update = NOW() WHERE arc_id = $1',
            [arcId]
          );
          arc.current_phase++;
          console.log(`[STORY] ${arcId} advanced to phase ${arc.current_phase}`);
        } else {
          // Complete arc
          await this.completeArc(arcId);
        }
      }
    } catch (error) {
      console.error('[STORY] Phase advancement error:', error);
    }
  }

  /**
   * Complete an arc
   */
  async completeArc(arcId) {
    try {
      const arc = this.activeArcs.get(arcId);
      if (!arc) return;

      const template = STORY_TEMPLATES[arc.arc_type];
      const outcomes = Object.keys(template.outcomes);
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

      // Create lore entry
      await this.pool.query(
        `INSERT INTO story_lore (arc_id, title, summary, outcome, heroes, memorable_moments)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [arcId, template.title, template.outcomes[outcome], outcome,
         JSON.stringify(arc.participants), arc.key_events]
      );

      // Mark arc complete
      await this.pool.query(
        "UPDATE story_arcs SET status = 'completed', outcome = $2 WHERE arc_id = $1",
        [arcId, outcome]
      );

      this.activeArcs.delete(arcId);
      console.log(`[STORY] Completed arc: ${template.title} - ${outcome}`);
      
      return { title: template.title, outcome: template.outcomes[outcome] };
    } catch (error) {
      console.error('[STORY] Complete arc error:', error);
      return null;
    }
  }

  /**
   * Get lore for reference in conversations
   */
  async getLore(limit = 5) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM story_lore ORDER BY completed_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[STORY] Get lore error:', error);
      return [];
    }
  }

  /**
   * Reference lore in conversation
   */
  async referenceLore(loreId) {
    try {
      await this.pool.query(
        'UPDATE story_lore SET referenced_count = referenced_count + 1 WHERE id = $1',
        [loreId]
      );
    } catch (error) {
      console.error('[STORY] Reference lore error:', error);
    }
  }

  /**
   * Get a random bot secret for secret arc
   */
  getRandomSecret(botId) {
    const secrets = BOT_SECRETS[botId];
    if (!secrets) return null;
    return secrets[Math.floor(Math.random() * secrets.length)];
  }

  /**
   * Build story context for AI prompt
   */
  async buildStoryContext() {
    let context = '';

    if (this.activeArcs.size > 0) {
      context += '\n[ONGOING STORY]\n';
      for (const [arcId, arc] of this.activeArcs) {
        const template = STORY_TEMPLATES[arc.arc_type];
        const phase = template.phases[arc.current_phase - 1];
        context += `Current arc: "${template.title}" - Phase: ${phase?.name || 'unknown'}\n`;
        context += `${template.description}\n`;
        if (arc.key_events?.length > 0) {
          context += `Recent events: ${arc.key_events.slice(-2).map(e => e.event).join(', ')}\n`;
        }
      }
      context += '[END STORY]\n';
    }

    // Add recent lore
    const lore = await this.getLore(2);
    if (lore.length > 0) {
      context += '\n[PAST STORIES TO REFERENCE]\n';
      for (const l of lore) {
        context += `- "${l.title}": ${l.summary}\n`;
      }
      context += '[END LORE]\n';
    }

    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  LivingStoryEngine,
  STORY_TEMPLATES,
  BOT_SECRETS
};
