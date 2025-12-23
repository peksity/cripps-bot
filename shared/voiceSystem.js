/**
 * AI VOICE SYSTEM - ElevenLabs Integration for Discord
 * 
 * Features:
 * - Text-to-Speech with realistic character voices
 * - Discord voice channel integration
 * - Voice profiles for each bot
 * - Queue system for multiple responses
 * 
 * Requirements:
 * - ElevenLabs API key
 * - @discordjs/voice package
 * - ffmpeg installed
 */

const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

class VoiceSystem {
  constructor(botName, elevenLabsApiKey) {
    this.botName = botName;
    this.apiKey = elevenLabsApiKey;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.connection = null;
    this.player = createAudioPlayer();
    this.queue = [];
    this.isPlaying = false;
    
    // Voice profiles for each character
    // These would be custom cloned voices or selected from ElevenLabs library
    this.voiceProfiles = {
      lester: {
        voiceId: 'pNInz6obpgDQGcFmaJgB', // Default "Adam" - nasally, nerdy
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.3,
        description: 'Nasally, nervous, scheming genius'
      },
      cripps: {
        voiceId: 'VR6AewLTigWG4xSOukaG', // Default "Arnold" - older, gruff
        stability: 0.7,
        similarityBoost: 0.8,
        style: 0.2,
        description: 'Gruff, old western trader'
      },
      pavel: {
        voiceId: 'ErXwobaYiN019PkySvjV', // Default "Antoni" - slight accent possible
        stability: 0.6,
        similarityBoost: 0.7,
        style: 0.4,
        description: 'Russian submarine captain, warm but secretive'
      },
      madam: {
        voiceId: 'EXAVITQu4vr4xnSDxMaL', // Default "Bella" - mystical female
        stability: 0.4,
        similarityBoost: 0.8,
        style: 0.6,
        description: 'Mystical fortune teller, Eastern European accent'
      },
      chief: {
        voiceId: 'TxGEqnHWrfWFTfGW9XjX', // Default "Josh" - authoritative
        stability: 0.8,
        similarityBoost: 0.75,
        style: 0.2,
        description: 'Authoritative lawman, Western sheriff'
      }
    };
    
    // Set up player events
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false;
      this.playNext();
    });
    
    this.player.on('error', error => {
      console.error(`[Voice] Player error: ${error.message}`);
      this.isPlaying = false;
      this.playNext();
    });
  }

  // ============================================
  // VOICE CONNECTION
  // ============================================
  async joinChannel(channel) {
    try {
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });
      
      // Wait for connection to be ready
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);
      
      // Subscribe player to connection
      this.connection.subscribe(this.player);
      
      console.log(`[Voice] ${this.botName} joined voice channel: ${channel.name}`);
      return true;
    } catch (error) {
      console.error(`[Voice] Failed to join channel: ${error.message}`);
      return false;
    }
  }

  leaveChannel() {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.queue = [];
      console.log(`[Voice] ${this.botName} left voice channel`);
    }
  }

  isConnected() {
    return this.connection?.state?.status === VoiceConnectionStatus.Ready;
  }

  // ============================================
  // TEXT TO SPEECH
  // ============================================
  async generateSpeech(text, customVoiceId = null) {
    const profile = this.voiceProfiles[this.botName] || this.voiceProfiles.lester;
    const voiceId = customVoiceId || profile.voiceId;
    
    try {
      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2', // Fast model for real-time
          voice_settings: {
            stability: profile.stability,
            similarity_boost: profile.similarityBoost,
            style: profile.style,
            use_speaker_boost: true
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }
      
      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      return buffer;
    } catch (error) {
      console.error(`[Voice] TTS generation failed: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // PLAY AUDIO
  // ============================================
  async speak(text) {
    if (!this.isConnected()) {
      console.log('[Voice] Not connected to voice channel');
      return false;
    }
    
    // Add to queue
    this.queue.push(text);
    
    // Start playing if not already
    if (!this.isPlaying) {
      await this.playNext();
    }
    
    return true;
  }

  async playNext() {
    if (this.queue.length === 0 || this.isPlaying) {
      return;
    }
    
    const text = this.queue.shift();
    this.isPlaying = true;
    
    try {
      // Generate speech
      const audioBuffer = await this.generateSpeech(text);
      
      if (!audioBuffer) {
        this.isPlaying = false;
        this.playNext();
        return;
      }
      
      // Create readable stream from buffer
      const stream = Readable.from(audioBuffer);
      
      // Create audio resource - use arbitrary input type for mp3
      const resource = createAudioResource(stream, {
        inputType: 'arbitrary',
        inlineVolume: true
      });
      
      // Set volume
      if (resource.volume) {
        resource.volume.setVolume(1);
      }
      
      // Play it
      this.player.play(resource);
      
    } catch (error) {
      console.error(`[Voice] Playback error: ${error.message}`);
      this.isPlaying = false;
      this.playNext();
    }
  }

  // ============================================
  // SAVE AUDIO FILE (for testing/demo)
  // ============================================
  async saveVoiceSample(text, filename) {
    const buffer = await this.generateSpeech(text);
    
    if (buffer) {
      const filePath = path.join('/tmp', `${filename}.mp3`);
      fs.writeFileSync(filePath, buffer);
      console.log(`[Voice] Saved voice sample to: ${filePath}`);
      return filePath;
    }
    
    return null;
  }

  // ============================================
  // VOICE CLONING (Premium Feature)
  // ============================================
  async cloneVoice(name, description, audioFiles) {
    // This requires ElevenLabs Pro subscription
    // audioFiles should be array of file paths or URLs
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    
    for (const file of audioFiles) {
      if (typeof file === 'string' && file.startsWith('http')) {
        // Download and add
        const response = await fetch(file);
        const blob = await response.blob();
        formData.append('files', blob, 'sample.mp3');
      } else {
        // Local file
        const buffer = fs.readFileSync(file);
        formData.append('files', new Blob([buffer]), path.basename(file));
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/voices/add`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Voice cloning failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`[Voice] Cloned voice created: ${result.voice_id}`);
      return result.voice_id;
      
    } catch (error) {
      console.error(`[Voice] Clone error: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // GET AVAILABLE VOICES
  // ============================================
  async getVoices() {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });
      
      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error(`[Voice] Failed to get voices: ${error.message}`);
      return [];
    }
  }

  // ============================================
  // VOICE PRESETS FOR CHARACTERS
  // ============================================
  setVoiceProfile(voiceId, settings = {}) {
    this.voiceProfiles[this.botName] = {
      voiceId,
      stability: settings.stability || 0.5,
      similarityBoost: settings.similarityBoost || 0.75,
      style: settings.style || 0.3,
      description: settings.description || 'Custom voice'
    };
  }
}

// ============================================
// VOICE CHAT HANDLER
// ============================================
class VoiceChatHandler {
  constructor(client, voiceSystem, systemPrompt, anthropic) {
    this.client = client;
    this.voice = voiceSystem;
    this.systemPrompt = systemPrompt;
    this.anthropic = anthropic;
    this.activeChannels = new Set();
  }

  // Listen for voice channel state changes
  setupListeners() {
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      // Check if someone joined a channel where bot is present
      if (newState.channelId && this.activeChannels.has(newState.channelId)) {
        // Someone joined, maybe greet them
        if (!newState.member.user.bot) {
          const greeting = await this.generateGreeting(newState.member.user.username);
          await this.voice.speak(greeting);
        }
      }
      
      // Check if bot should leave (everyone left)
      if (oldState.channelId && this.activeChannels.has(oldState.channelId)) {
        const channel = oldState.channel;
        if (channel && channel.members.filter(m => !m.user.bot).size === 0) {
          // Everyone left, disconnect after a delay
          setTimeout(() => {
            if (channel.members.filter(m => !m.user.bot).size === 0) {
              this.voice.leaveChannel();
              this.activeChannels.delete(channel.id);
            }
          }, 30000);
        }
      }
    });
  }

  async joinAndGreet(channel) {
    const joined = await this.voice.joinChannel(channel);
    if (joined) {
      this.activeChannels.add(channel.id);
      const greeting = await this.generateGreeting();
      await this.voice.speak(greeting);
    }
    return joined;
  }

  async generateGreeting(username = null) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: this.systemPrompt,
      messages: [{
        role: 'user',
        content: username 
          ? `Generate a short voice greeting for ${username} who just joined the voice channel. Keep it under 15 words, natural and in-character.`
          : `Generate a short voice greeting for joining a voice channel. Keep it under 15 words, natural and in-character.`
      }]
    });
    
    return response.content[0].text;
  }

  async respond(text) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: this.systemPrompt + '\n\nYou are speaking in a voice chat. Keep responses SHORT (under 30 words). Be natural and conversational.',
      messages: [{
        role: 'user',
        content: text
      }]
    });
    
    const reply = response.content[0].text;
    await this.voice.speak(reply);
    return reply;
  }
}

module.exports = { VoiceSystem, VoiceChatHandler };
