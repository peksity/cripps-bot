/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * REAL-TIME VOICE AI SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * NOT "?speak hello" commands. ACTUAL conversations in voice chat.
 * 
 * Flow:
 * 1. User joins VC → Bot detects and joins
 * 2. Bot listens via speech-to-text (Whisper API)
 * 3. AI generates contextual response
 * 4. ElevenLabs speaks it back
 * 5. Real back-and-forth conversation
 * 
 * This exists in enterprise tools. Not in Discord bots. Until now.
 */

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, 
        VoiceConnectionStatus, EndBehaviorType, getVoiceConnection } = require('@discordjs/voice');
const { OpusEncoder } = require('@discordjs/opus');
const prism = require('prism-media');
const { Readable, PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ElevenLabs
  elevenLabsKey: process.env.ELEVENLABS_API_KEY,
  
  // Voice IDs for each bot (customize these)
  voiceIds: {
    lester: process.env.LESTER_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // Adam - deep, authoritative
    pavel: process.env.PAVEL_VOICE_ID || 'VR6AewLTigWG4xSOukaG', // Arnold - accented
    cripps: process.env.CRIPPS_VOICE_ID || 'SOYHLrjzK2X1ezoPC6cr', // Harry - older, gruff
    madam: process.env.MADAM_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Bella - mysterious female
    chief: process.env.CHIEF_VOICE_ID || 'TxGEqnHWrfWFTfGW9XjX', // Josh - authoritative
  },
  
  // OpenAI Whisper (for speech-to-text)
  openaiKey: process.env.OPENAI_API_KEY,
  whisperModel: 'whisper-1',
  
  // Behavior
  silenceThreshold: 2000,      // ms of silence before processing
  maxListenTime: 30000,        // max recording length
  minAudioLength: 500,         // minimum audio to process
  autoJoinOnMention: true,     // join when mentioned in VC
  autoLeaveTimeout: 300000,    // leave after 5 min inactivity
  respondToName: true,         // respond when name is said
  interruptible: true,         // can be interrupted while speaking
};

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE AI ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class VoiceAIEngine {
  constructor(pool, client, anthropic, botId) {
    this.pool = pool;
    this.client = client;
    this.anthropic = anthropic;
    this.botId = botId;
    this.voiceId = CONFIG.voiceIds[botId] || CONFIG.voiceIds.lester;
    
    this.activeConnections = new Map(); // guildId -> connection data
    this.audioPlayers = new Map();      // guildId -> AudioPlayer
    this.listeningStreams = new Map();  // oduserId -> audio stream
    this.conversationContext = new Map(); // oduserId -> recent messages
    
    this.isInitialized = false;
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS voice_conversations (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_message TEXT,
        bot_response TEXT,
        duration_ms INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS voice_preferences (
        user_id TEXT PRIMARY KEY,
        voice_id TEXT,
        speaking_rate FLOAT DEFAULT 1.0,
        response_style TEXT DEFAULT 'normal',
        opt_out BOOLEAN DEFAULT FALSE
      )
    `);

    this.isInitialized = true;
    console.log(`🎤 Voice AI Engine initialized for ${this.botId}`);
  }

  /**
   * Join a voice channel and start listening
   */
  async joinChannel(channel, textChannel = null) {
    if (!this.isInitialized) await this.initialize();
    
    const guildId = channel.guild.id;
    
    // Already connected?
    if (this.activeConnections.has(guildId)) {
      return { success: false, reason: 'Already in a voice channel' };
    }

    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,  // Need to hear users
        selfMute: false
      });

      // Create audio player
      const player = createAudioPlayer();
      connection.subscribe(player);
      this.audioPlayers.set(guildId, player);

      // Store connection info
      this.activeConnections.set(guildId, {
        connection,
        channelId: channel.id,
        textChannelId: textChannel?.id,
        joinedAt: new Date(),
        lastActivity: new Date(),
        speaking: false,
        listening: new Set()
      });

      // Connection state handling
      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log(`🎤 [${this.botId}] Voice connected to ${channel.name}`);
        this.startListening(guildId, connection);
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            new Promise(resolve => connection.once(VoiceConnectionStatus.Signalling, resolve)),
            new Promise(resolve => connection.once(VoiceConnectionStatus.Connecting, resolve)),
            new Promise((_, reject) => setTimeout(() => reject(), 5000))
          ]);
        } catch {
          this.leaveChannel(guildId);
        }
      });

      // Player events
      player.on(AudioPlayerStatus.Idle, () => {
        const connData = this.activeConnections.get(guildId);
        if (connData) connData.speaking = false;
      });

      player.on('error', error => {
        console.error(`🎤 Player error:`, error);
      });

      // Auto-leave timeout
      this.startInactivityTimer(guildId);

      return { success: true, channel: channel.name };

    } catch (error) {
      console.error('Failed to join voice channel:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Leave voice channel
   */
  leaveChannel(guildId) {
    const connData = this.activeConnections.get(guildId);
    if (!connData) return false;

    try {
      connData.connection.destroy();
    } catch (e) {}

    // Cleanup
    this.activeConnections.delete(guildId);
    this.audioPlayers.delete(guildId);
    
    // Clear listening streams for this guild
    for (const [userId, stream] of this.listeningStreams) {
      if (stream.guildId === guildId) {
        stream.destroy?.();
        this.listeningStreams.delete(userId);
      }
    }

    console.log(`🎤 [${this.botId}] Left voice channel in guild ${guildId}`);
    return true;
  }

  /**
   * Start listening to users in the channel
   */
  startListening(guildId, connection) {
    const receiver = connection.receiver;

    receiver.speaking.on('start', async (userId) => {
      const connData = this.activeConnections.get(guildId);
      if (!connData) return;

      // Don't listen to self
      if (userId === this.client.user.id) return;

      // Check if user opted out
      const prefs = await this.getUserPreferences(userId);
      if (prefs?.opt_out) return;

      // Update activity
      connData.lastActivity = new Date();
      connData.listening.add(userId);

      // If bot is speaking and interruptible, stop
      if (connData.speaking && CONFIG.interruptible) {
        const player = this.audioPlayers.get(guildId);
        if (player) player.stop();
      }

      // Start recording this user
      this.recordUser(guildId, userId, receiver);
    });

    receiver.speaking.on('end', async (userId) => {
      const connData = this.activeConnections.get(guildId);
      if (!connData) return;

      connData.listening.delete(userId);

      // Process the recorded audio after silence
      setTimeout(() => this.processRecording(guildId, userId), CONFIG.silenceThreshold);
    });
  }

  /**
   * Record audio from a user
   */
  recordUser(guildId, oduserId, receiver) {
    // If already recording this user, skip
    if (this.listeningStreams.has(oduserId)) return;

    const opusStream = receiver.subscribe(oduserId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: CONFIG.silenceThreshold
      }
    });

    const chunks = [];
    let startTime = Date.now();

    opusStream.on('data', chunk => {
      // Limit recording length
      if (Date.now() - startTime < CONFIG.maxListenTime) {
        chunks.push(chunk);
      }
    });

    opusStream.on('end', () => {
      this.listeningStreams.delete(oduserId);
    });

    opusStream.on('error', err => {
      console.error('Opus stream error:', err);
      this.listeningStreams.delete(oduserId);
    });

    // Store with metadata
    this.listeningStreams.set(oduserId, {
      stream: opusStream,
      chunks,
      guildId,
      startTime,
      destroy: () => opusStream.destroy()
    });
  }

  /**
   * Process recorded audio - convert to text and respond
   */
  async processRecording(guildId, oduserId) {
    const recording = this.listeningStreams.get(oduserId);
    if (!recording || recording.chunks.length === 0) return;

    const connData = this.activeConnections.get(guildId);
    if (!connData) return;

    // Check minimum audio length
    const totalBytes = recording.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (totalBytes < CONFIG.minAudioLength) return;

    try {
      // Convert Opus to WAV for Whisper
      const wavBuffer = await this.opusToWav(recording.chunks);
      if (!wavBuffer) return;

      // Transcribe with Whisper
      const transcript = await this.transcribeAudio(wavBuffer);
      if (!transcript || transcript.trim().length < 2) return;

      console.log(`🎤 [${this.botId}] Heard: "${transcript}"`);

      // Check if this is addressed to us
      const isAddressedToUs = this.isAddressedToBot(transcript);
      if (!isAddressedToUs && !this.isOnlyUserInChannel(guildId)) {
        // Multiple people in channel and not addressed to us - ignore
        return;
      }

      // Get conversation context
      const context = this.getConversationContext(oduserId);
      
      // Generate AI response
      const response = await this.generateResponse(transcript, oduserId, guildId, context);
      if (!response) return;

      console.log(`🎤 [${this.botId}] Responding: "${response.substring(0, 100)}..."`);

      // Update context
      this.addToContext(oduserId, transcript, response);

      // Convert to speech and play
      await this.speakResponse(guildId, response);

      // Log conversation
      await this.logConversation(guildId, oduserId, transcript, response, Date.now() - recording.startTime);

    } catch (error) {
      console.error('Error processing voice:', error);
    }
  }

  /**
   * Check if transcript is addressed to this bot
   */
  isAddressedToBot(transcript) {
    const lower = transcript.toLowerCase();
    const botNames = {
      lester: ['lester', 'les', 'crest', 'genius'],
      pavel: ['pavel', 'captain', 'kapitan', 'submarine'],
      cripps: ['cripps', 'old man', 'trader'],
      madam: ['madam', 'nazar', 'fortune', 'psychic'],
      chief: ['chief', 'officer', 'sheriff', 'law']
    };

    const names = botNames[this.botId] || [];
    return names.some(name => lower.includes(name));
  }

  /**
   * Check if bot is the only one user is talking to
   */
  isOnlyUserInChannel(guildId) {
    const connData = this.activeConnections.get(guildId);
    if (!connData) return false;
    
    const channel = this.client.channels.cache.get(connData.channelId);
    if (!channel) return false;

    // Count human members (excluding bots)
    const humans = channel.members.filter(m => !m.user.bot).size;
    return humans <= 1;
  }

  /**
   * Convert Opus chunks to WAV format for Whisper
   */
  async opusToWav(chunks) {
    try {
      // Decode Opus to PCM
      const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
      const pcmChunks = [];

      for (const chunk of chunks) {
        try {
          const decoded = decoder.decode(chunk);
          if (decoded) pcmChunks.push(decoded);
        } catch (e) {
          // Skip invalid frames
        }
      }

      if (pcmChunks.length === 0) return null;

      const pcmData = Buffer.concat(pcmChunks);

      // Create WAV header
      const wavHeader = Buffer.alloc(44);
      const dataLength = pcmData.length;
      const fileLength = dataLength + 36;

      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(fileLength, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16);      // fmt chunk size
      wavHeader.writeUInt16LE(1, 20);       // PCM format
      wavHeader.writeUInt16LE(2, 22);       // channels
      wavHeader.writeUInt32LE(48000, 24);   // sample rate
      wavHeader.writeUInt32LE(48000 * 2 * 2, 28); // byte rate
      wavHeader.writeUInt16LE(4, 32);       // block align
      wavHeader.writeUInt16LE(16, 34);      // bits per sample
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(dataLength, 40);

      return Buffer.concat([wavHeader, pcmData]);

    } catch (error) {
      console.error('Opus to WAV conversion failed:', error);
      return null;
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper
   */
  async transcribeAudio(wavBuffer) {
    if (!CONFIG.openaiKey) {
      console.warn('No OpenAI API key for Whisper transcription');
      return null;
    }

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', wavBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model', CONFIG.whisperModel);
    form.append('language', 'en');

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.openaiKey}`,
          ...form.getHeaders()
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.text || null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      form.pipe(req);
    });
  }

  /**
   * Generate AI response using Anthropic
   */
  async generateResponse(userMessage, oduserId, guildId, context) {
    const botPersonalities = {
      lester: 'You are Lester Crest, the genius mastermind from GTA. Socially awkward, paranoid, sarcastic. Keep responses SHORT for voice - 1-2 sentences max. No asterisks or emotes.',
      pavel: 'You are Pavel, the loyal submarine captain from GTA Online. Warm, supportive, slight Russian accent style. Keep responses SHORT for voice - 1-2 sentences max.',
      cripps: 'You are Cripps, the grumpy old trader from Red Dead Online. Nostalgic, complaining, tells stories. Keep responses SHORT for voice - 1-2 sentences max.',
      madam: 'You are Madam Nazar, the mysterious fortune teller from Red Dead Online. Cryptic, mystical, all-knowing. Keep responses SHORT for voice - 1-2 sentences max.',
      chief: 'You are a stern Police Chief. Authoritative, by-the-book, suspicious. Keep responses SHORT for voice - 1-2 sentences max.'
    };

    const systemPrompt = botPersonalities[this.botId] || botPersonalities.lester;

    // Build context messages
    const messages = [];
    if (context && context.length > 0) {
      for (const c of context.slice(-4)) { // Last 4 exchanges
        messages.push({ role: 'user', content: c.user });
        messages.push({ role: 'assistant', content: c.bot });
      }
    }
    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150, // Keep responses short for voice
        system: systemPrompt + '\n\nIMPORTANT: This is a VOICE conversation. Keep responses very short and natural for speaking. No formatting, no asterisks, no emotes.',
        messages
      });

      return response.content[0].text;
    } catch (error) {
      console.error('AI response generation failed:', error);
      return null;
    }
  }

  /**
   * Convert text to speech and play in channel
   */
  async speakResponse(guildId, text) {
    const connData = this.activeConnections.get(guildId);
    if (!connData) return;

    const player = this.audioPlayers.get(guildId);
    if (!player) return;

    try {
      // Get audio from ElevenLabs
      const audioBuffer = await this.textToSpeech(text);
      if (!audioBuffer) return;

      // Mark as speaking
      connData.speaking = true;
      connData.lastActivity = new Date();

      // Create audio resource and play
      const audioStream = Readable.from(audioBuffer);
      const resource = createAudioResource(audioStream, {
        inputType: 'arbitrary'
      });

      player.play(resource);

    } catch (error) {
      console.error('TTS failed:', error);
      connData.speaking = false;
    }
  }

  /**
   * Convert text to speech using ElevenLabs
   */
  async textToSpeech(text) {
    if (!CONFIG.elevenLabsKey) {
      console.warn('No ElevenLabs API key');
      return null;
    }

    const body = JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${this.voiceId}`,
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': CONFIG.elevenLabsKey
        }
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Speak text immediately (for commands like ?speak)
   */
  async speak(guildId, text) {
    const connData = this.activeConnections.get(guildId);
    if (!connData) return { success: false, reason: 'Not in voice channel' };

    await this.speakResponse(guildId, text);
    return { success: true };
  }

  /**
   * Context management
   */
  getConversationContext(oduserId) {
    return this.conversationContext.get(oduserId) || [];
  }

  addToContext(oduserId, userMessage, botResponse) {
    let context = this.conversationContext.get(oduserId) || [];
    context.push({ user: userMessage, bot: botResponse, time: Date.now() });
    
    // Keep last 10 exchanges
    if (context.length > 10) context = context.slice(-10);
    
    this.conversationContext.set(oduserId, context);
  }

  /**
   * User preferences
   */
  async getUserPreferences(oduserId) {
    const res = await this.pool.query('SELECT * FROM voice_preferences WHERE user_id = $1', [oduserId]);
    return res.rows[0] || null;
  }

  async setUserOptOut(oduserId, optOut) {
    await this.pool.query(`
      INSERT INTO voice_preferences (user_id, opt_out)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET opt_out = $2
    `, [oduserId, optOut]);
  }

  /**
   * Log conversation
   */
  async logConversation(guildId, oduserId, userMessage, botResponse, durationMs) {
    await this.pool.query(`
      INSERT INTO voice_conversations (guild_id, user_id, user_message, bot_response, duration_ms)
      VALUES ($1, $2, $3, $4, $5)
    `, [guildId, oduserId, userMessage, botResponse, durationMs]);
  }

  /**
   * Auto-leave after inactivity
   */
  startInactivityTimer(guildId) {
    const check = () => {
      const connData = this.activeConnections.get(guildId);
      if (!connData) return;

      const inactive = Date.now() - connData.lastActivity.getTime();
      if (inactive > CONFIG.autoLeaveTimeout) {
        console.log(`🎤 [${this.botId}] Auto-leaving due to inactivity`);
        this.leaveChannel(guildId);
      } else {
        setTimeout(check, 60000); // Check every minute
      }
    };

    setTimeout(check, 60000);
  }

  /**
   * Get connection status
   */
  getStatus(guildId) {
    const connData = this.activeConnections.get(guildId);
    if (!connData) return null;

    return {
      channelId: connData.channelId,
      speaking: connData.speaking,
      listening: connData.listening.size,
      joinedAt: connData.joinedAt,
      lastActivity: connData.lastActivity
    };
  }
}

module.exports = { VoiceAIEngine, CONFIG };
