/**
 * ███╗   ███╗ ██████╗  ██████╗ ██████╗     ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗
 * ████╗ ████║██╔═══██╗██╔═══██╗██╔══██╗    ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝
 * ██╔████╔██║██║   ██║██║   ██║██║  ██║    █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  
 * ██║╚██╔╝██║██║   ██║██║   ██║██║  ██║    ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  
 * ██║ ╚═╝ ██║╚██████╔╝╚██████╔╝██████╔╝    ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗
 * ╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝
 * 
 * MOOD ENGINE
 * 
 * Bots have REAL moods that:
 * - Persist across restarts
 * - Affect response tone and length
 * - Change based on interactions
 * - Are influenced by time of day
 * - Create natural variation
 */

class MoodEngine {
  constructor(pool, botId) {
    this.pool = pool;
    this.botId = botId;
    
    // Current state
    this.mood = 50; // 0-100
    this.energy = 50; // 0-100
    this.patience = 50; // 0-100
    this.lastUpdate = Date.now();
    
    // Bot-specific baseline moods
    this.baselines = {
      lester: { mood: 35, energy: 40, patience: 30 }, // Grumpy baseline
      pavel: { mood: 70, energy: 75, patience: 80 }, // Happy baseline
      cripps: { mood: 45, energy: 50, patience: 40 }, // Neutral-grumpy
      chief: { mood: 50, energy: 60, patience: 45 }, // Stern baseline
      nazar: { mood: 60, energy: 55, patience: 70 }  // Mysterious calm
    };
    
    // Mood labels
    this.moodLabels = [
      { max: 10, label: 'Furious', emoji: '😤' },
      { max: 25, label: 'Irritated', emoji: '😒' },
      { max: 40, label: 'Annoyed', emoji: '😑' },
      { max: 55, label: 'Neutral', emoji: '😐' },
      { max: 70, label: 'Content', emoji: '🙂' },
      { max: 85, label: 'Happy', emoji: '😊' },
      { max: 100, label: 'Great', emoji: '😄' }
    ];
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS bot_moods (
          bot_id VARCHAR(50) PRIMARY KEY,
          mood INT DEFAULT 50,
          energy INT DEFAULT 50,
          patience INT DEFAULT 50,
          interactions_today INT DEFAULT 0,
          last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Ensure this bot has a row
      const baseline = this.baselines[this.botId] || { mood: 50, energy: 50, patience: 50 };
      await this.pool.query(`
        INSERT INTO bot_moods (bot_id, mood, energy, patience)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (bot_id) DO NOTHING
      `, [this.botId, baseline.mood, baseline.energy, baseline.patience]);

      console.log(`[MOOD:${this.botId}] ✅ Initialized`);
    } catch (e) {
      console.error(`[MOOD:${this.botId}] Init error:`, e.message);
    }
  }

  /**
   * Load mood from database
   */
  async loadMood() {
    try {
      const result = await this.pool.query(
        'SELECT * FROM bot_moods WHERE bot_id = $1',
        [this.botId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.mood = row.mood;
        this.energy = row.energy;
        this.patience = row.patience;
        this.lastUpdate = new Date(row.updated_at).getTime();
      }

      // Apply time-based modifiers
      await this.applyTimeModifiers();

      console.log(`[MOOD:${this.botId}] Loaded: ${this.mood}/100`);
    } catch (e) {
      console.error(`[MOOD:${this.botId}] Load error:`, e.message);
    }
  }

  /**
   * Save mood to database
   */
  async saveMood() {
    try {
      await this.pool.query(`
        UPDATE bot_moods 
        SET mood = $1, energy = $2, patience = $3, updated_at = CURRENT_TIMESTAMP
        WHERE bot_id = $4
      `, [this.mood, this.energy, this.patience, this.botId]);
    } catch (e) {
      console.error(`[MOOD:${this.botId}] Save error:`, e.message);
    }
  }

  /**
   * Get current mood state
   */
  async getMood() {
    // Check if we need to apply time modifiers
    if (Date.now() - this.lastUpdate > 5 * 60 * 1000) {
      await this.applyTimeModifiers();
    }

    const label = this.moodLabels.find(l => this.mood <= l.max) || this.moodLabels[this.moodLabels.length - 1];
    
    return {
      value: this.mood,
      energy: this.energy,
      patience: this.patience,
      label: label.label,
      emoji: label.emoji
    };
  }

  /**
   * Adjust mood
   */
  async adjustMood(delta) {
    const baseline = this.baselines[this.botId]?.mood || 50;
    
    this.mood = Math.max(0, Math.min(100, this.mood + delta));
    
    // Slowly gravitate back to baseline
    if (this.mood > baseline) {
      this.mood -= 0.5;
    } else if (this.mood < baseline) {
      this.mood += 0.5;
    }
    
    await this.saveMood();
    return this.mood;
  }

  /**
   * Adjust energy
   */
  async adjustEnergy(delta) {
    this.energy = Math.max(0, Math.min(100, this.energy + delta));
    await this.saveMood();
    return this.energy;
  }

  /**
   * Adjust patience
   */
  async adjustPatience(delta) {
    this.patience = Math.max(0, Math.min(100, this.patience + delta));
    await this.saveMood();
    return this.patience;
  }

  /**
   * Apply time-based modifiers
   */
  async applyTimeModifiers() {
    const hour = new Date().getHours();
    const baseline = this.baselines[this.botId] || { mood: 50, energy: 50, patience: 50 };
    
    // Late night (12am - 5am)
    if (hour >= 0 && hour < 5) {
      this.energy = Math.max(20, baseline.energy - 20);
      this.patience = Math.max(15, baseline.patience - 15);
      this.mood = Math.max(10, baseline.mood - 10);
    }
    // Early morning (5am - 9am)
    else if (hour >= 5 && hour < 9) {
      this.energy = baseline.energy - 10;
      this.mood = baseline.mood - 5;
    }
    // Midday (9am - 5pm) - peak
    else if (hour >= 9 && hour < 17) {
      this.energy = baseline.energy + 10;
      this.mood = baseline.mood + 5;
    }
    // Evening (5pm - 12am) - winding down
    else {
      this.energy = baseline.energy;
      this.mood = baseline.mood;
    }
    
    // Clamp values
    this.mood = Math.max(0, Math.min(100, this.mood));
    this.energy = Math.max(0, Math.min(100, this.energy));
    this.patience = Math.max(0, Math.min(100, this.patience));
    
    this.lastUpdate = Date.now();
    await this.saveMood();
  }

  /**
   * Record interaction (affects mood)
   */
  async recordInteraction(wasPositive) {
    try {
      // Update interaction count
      await this.pool.query(`
        UPDATE bot_moods 
        SET interactions_today = interactions_today + 1,
            last_interaction = CURRENT_TIMESTAMP
        WHERE bot_id = $1
      `, [this.botId]);

      // Adjust mood based on interaction
      if (wasPositive) {
        await this.adjustMood(2);
        await this.adjustPatience(1);
      } else {
        await this.adjustMood(-3);
        await this.adjustPatience(-5);
      }

      // Too many interactions = tired
      const result = await this.pool.query(
        'SELECT interactions_today FROM bot_moods WHERE bot_id = $1',
        [this.botId]
      );
      
      if (result.rows.length > 0 && result.rows[0].interactions_today > 50) {
        await this.adjustEnergy(-5);
        await this.adjustPatience(-3);
      }
    } catch (e) {
      console.error(`[MOOD:${this.botId}] Interaction error:`, e.message);
    }
  }

  /**
   * Reset daily counters (call at midnight)
   */
  async dailyReset() {
    try {
      const baseline = this.baselines[this.botId] || { mood: 50, energy: 50, patience: 50 };
      
      await this.pool.query(`
        UPDATE bot_moods 
        SET interactions_today = 0,
            mood = $1,
            energy = $2,
            patience = $3
        WHERE bot_id = $4
      `, [baseline.mood, baseline.energy, baseline.patience, this.botId]);

      this.mood = baseline.mood;
      this.energy = baseline.energy;
      this.patience = baseline.patience;
      
      console.log(`[MOOD:${this.botId}] Daily reset complete`);
    } catch (e) {
      console.error(`[MOOD:${this.botId}] Reset error:`, e.message);
    }
  }

  /**
   * Get mood modifier for response style
   */
  getMoodModifier() {
    return {
      // Response length modifier
      lengthMod: this.energy < 30 ? 0.5 : this.energy > 70 ? 1.2 : 1,
      
      // Response chance modifier  
      responseMod: this.energy < 20 ? 0.5 : this.energy > 80 ? 1.3 : 1,
      
      // Tone
      tone: this.mood < 30 ? 'irritated' : this.mood > 70 ? 'friendly' : 'neutral',
      
      // Patience affects willingness to explain
      detailed: this.patience > 60,
      
      // Snarkiness
      snarky: this.mood < 40 || this.patience < 30
    };
  }
}

module.exports = { MoodEngine };
