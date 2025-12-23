/**
 * NEXUS LFG SYSTEM
 * AI-First Looking For Group
 * 
 * This isn't a command bot. This is an AI that:
 * - Understands natural language requests
 * - Builds player reputation profiles
 * - Matches compatible players
 * - Handles disputes automatically
 * - Tracks who flakes, who's reliable, who's skilled
 * - Creates and manages voice channels
 * - Shares intelligence across all games
 */

const { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class NexusLFG {
  constructor(pool, anthropic, client, botType) {
    this.pool = pool;
    this.anthropic = anthropic;
    this.client = client;
    this.botType = botType; // 'pavel' | 'cripps' | 'chief'
    
    // Active sessions
    this.activeSessions = new Map();
    
    // Game-specific config
    this.config = {
      pavel: {
        game: 'GTA Online',
        activities: ['cayo', 'casino', 'doomsday', 'heist', 'bogdan', 'act2', 'act3'],
        defaultSize: 4,
        emoji: '🚁'
      },
      cripps: {
        game: 'Red Dead Online',
        activities: ['wagon', 'delivery', 'trader', 'moonshine', 'posse', 'hunting'],
        defaultSize: 4,
        emoji: '🐎'
      },
      chief: {
        game: 'Red Dead Online', 
        activities: ['bounty', 'legendary', 'etta', 'owlhoot', 'cecil', 'red ben', 'posse'],
        defaultSize: 4,
        emoji: '⭐'
      }
    };
  }

  async initialize() {
    await this.initDatabase();
    this.startSessionCleanup();
    console.log(`🎮 NEXUS LFG initialized for ${this.botType}`);
  }

  async initDatabase() {
    await this.pool.query(`
      -- Player Profiles (reputation, playstyle, reliability)
      CREATE TABLE IF NOT EXISTS nexus_players (
        user_id VARCHAR(32),
        guild_id VARCHAR(32),
        
        -- Reputation
        reputation_score INT DEFAULT 100,
        sessions_completed INT DEFAULT 0,
        sessions_abandoned INT DEFAULT 0,
        sessions_kicked INT DEFAULT 0,
        
        -- Reliability
        show_rate FLOAT DEFAULT 1.0,
        avg_response_time INT,
        
        -- Playstyle (AI-assessed)
        skill_level VARCHAR(16),
        playstyle TEXT,
        communication_style TEXT,
        preferred_role TEXT,
        
        -- Preferences
        preferred_times JSONB,
        mic_preference VARCHAR(16),
        
        -- Flags
        is_reliable BOOLEAN DEFAULT TRUE,
        is_toxic BOOLEAN DEFAULT FALSE,
        lfg_banned BOOLEAN DEFAULT FALSE,
        ban_reason TEXT,
        
        -- AI notes
        ai_notes TEXT,
        
        last_session TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY(user_id, guild_id)
      );

      -- LFG Sessions
      CREATE TABLE IF NOT EXISTS nexus_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(32) UNIQUE,
        host_id VARCHAR(32),
        guild_id VARCHAR(32),
        channel_id VARCHAR(32),
        message_id VARCHAR(32),
        voice_channel_id VARCHAR(32),
        
        -- Activity
        game VARCHAR(32),
        activity VARCHAR(64),
        description TEXT,
        
        -- Players
        max_players INT DEFAULT 4,
        current_players JSONB DEFAULT '[]',
        waitlist JSONB DEFAULT '[]',
        
        -- Status
        status VARCHAR(16) DEFAULT 'open',
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );

      -- Session History (for learning)
      CREATE TABLE IF NOT EXISTS nexus_session_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(32),
        host_id VARCHAR(32),
        players JSONB,
        activity VARCHAR(64),
        
        -- Outcome
        outcome VARCHAR(16),
        duration_minutes INT,
        
        -- Ratings (players rate each other)
        ratings JSONB,
        
        -- AI analysis
        ai_summary TEXT,
        issues_detected JSONB,
        
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Player Reports
      CREATE TABLE IF NOT EXISTS nexus_reports (
        id SERIAL PRIMARY KEY,
        reporter_id VARCHAR(32),
        reported_id VARCHAR(32),
        session_id VARCHAR(32),
        reason TEXT,
        ai_assessment TEXT,
        action_taken VARCHAR(32),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  }

  // ═══════════════════════════════════════════════════════════════
  // NATURAL LANGUAGE DETECTION
  // ═══════════════════════════════════════════════════════════════
  
  async detectLFGIntent(message) {
    const content = message.content;
    const config = this.config[this.botType];
    
    // Skip very short messages or obvious non-LFG
    if (content.length < 5) return null;
    if (content.startsWith('?') || content.startsWith('!')) return null;
    
    // TRUE AI DETECTION - No regex gatekeeping
    // Let AI understand ANY way someone might ask for a group
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You detect if Discord messages are LFG (Looking For Group) requests for ${config.game}.

Message: "${content}"

People ask for groups in many ways:
- "anyone wanna do cayo?"
- "need 2 for heist"  
- "yo who tryna run some perico"
- "lfg casino"
- "down to grind?"
- "looking for wagon crew"
- "who's online for bounties"
- "tryna run it?"
- Or any other casual way gamers ask

Is this person looking for others to play ${config.game} with?

If YES - they want to find a group:
INTENT: lfg
ACTIVITY: [best match from: ${config.activities.join(', ')}]
PLAYERS_NEEDED: [number they mentioned, or 3 if not specified]
NOTES: [any requirements like "mic required" or "know the heist"]

If NO - not an LFG request:
INTENT: none

Be generous - if they MIGHT be looking for a group, say yes.`
        }]
      });
      
      const text = response.content[0].text;
      
      if (text.includes('INTENT: lfg')) {
        const activity = this.extract(text, 'ACTIVITY') || config.activities[0];
        const playersNeeded = parseInt(this.extract(text, 'PLAYERS_NEEDED')) || config.defaultSize - 1;
        const notes = this.extract(text, 'NOTES');
        
        return { activity, playersNeeded, notes };
      }
      
    } catch (e) {
      console.error('LFG intent detection error:', e);
    }
    
    return null;
  }

  extract(text, field) {
    const regex = new RegExp(`${field}:\\s*(.+?)(?=\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  // ═══════════════════════════════════════════════════════════════
  // CREATE SESSION
  // ═══════════════════════════════════════════════════════════════
  
  async createSession(message, activity, maxPlayers = 4, description = null) {
    const hostId = message.author.id;
    const guildId = message.guild.id;
    const sessionId = `LFG-${Date.now().toString(36).toUpperCase()}`;
    const config = this.config[this.botType];
    
    // Check if host is LFG banned
    const hostProfile = await this.getPlayerProfile(hostId, guildId);
    if (hostProfile?.lfg_banned) {
      await message.reply(`You're currently banned from LFG. Reason: ${hostProfile.ban_reason || 'Multiple violations'}`);
      return null;
    }
    
    // Activity-specific config
    const activityConfig = {
      // GTA (Pavel)
      cayo: { emoji: '🏝️', title: 'CAYO PERICO HEIST', color: 0x00CED1, role: 'Cayo Grinder' },
      casino: { emoji: '🎰', title: 'CASINO HEIST', color: 0xFFD700, role: 'Heist Crew' },
      heist: { emoji: '🚁', title: 'HEIST', color: 0x5865F2, role: 'Heist Crew' },
      doomsday: { emoji: '☢️', title: 'DOOMSDAY HEIST', color: 0xFF4500, role: 'Heist Crew' },
      bogdan: { emoji: '🔁', title: 'BOGDAN (ACT 2)', color: 0x9932CC, role: 'Heist Crew' },
      // RDO (Cripps)
      wagon: { emoji: '🛞', title: 'WAGON DELIVERY', color: 0x8B4513, role: 'Wagon Runner' },
      delivery: { emoji: '📦', title: 'TRADER DELIVERY', color: 0x8B4513, role: 'Wagon Runner' },
      trader: { emoji: '🦌', title: 'TRADER RUN', color: 0x228B22, role: 'Wagon Runner' },
      moonshine: { emoji: '🥃', title: 'MOONSHINE RUN', color: 0xDAA520, role: 'Wagon Runner' },
      hunting: { emoji: '🦌', title: 'HUNTING PARTY', color: 0x228B22, role: 'Wagon Runner' },
      // RDO (Police Chief)  
      bounty: { emoji: '💀', title: 'BOUNTY HUNT', color: 0xDC143C, role: 'Bounty Hunter' },
      legendary: { emoji: '⭐', title: 'LEGENDARY BOUNTY', color: 0xFFD700, role: 'Bounty Hunter' },
      etta: { emoji: '👩', title: 'ETTA DOYLE', color: 0xDC143C, role: 'Bounty Hunter' },
      owlhoot: { emoji: '🦉', title: 'OWLHOOT FAMILY', color: 0x4B0082, role: 'Bounty Hunter' },
      cecil: { emoji: '🤠', title: 'CECIL C. TUCKER', color: 0x8B4513, role: 'Bounty Hunter' },
      posse: { emoji: '🤠', title: 'POSSE UP', color: 0xDAA520, role: 'Frontier Outlaw' }
    };
    
    const actConfig = activityConfig[activity.toLowerCase()] || { 
      emoji: config.emoji, 
      title: activity.toUpperCase(), 
      color: 0x5865F2,
      role: 'Frontier Outlaw'
    };
    
    // Find role to ping
    const role = message.guild.roles.cache.find(r => r.name === actConfig.role);
    const rolePing = role ? `<@&${role.id}>` : '';
    
    // Delete the command message
    await message.delete().catch(() => {});
    
    // Create embed (matching the nice format)
    const embed = new EmbedBuilder()
      .setTitle(`${actConfig.emoji} ${actConfig.title}`)
      .setColor(actConfig.color)
      .addFields(
        { name: '👤 Host', value: `<@${hostId}>`, inline: true },
        { name: '🎮 Game', value: config.game, inline: true },
        { name: '📊 Status', value: '🟢 RECRUITING', inline: true },
        { name: `👥 Posse (1/${maxPlayers})`, value: description || '*React to join the crew*', inline: false }
      )
      .setFooter({ text: `React with ${actConfig.emoji} to join • Host uses ?done when complete • ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` })
      .setTimestamp();
    
    // Send and react
    const reply = await message.channel.send({ 
      content: rolePing || undefined,
      embeds: [embed]
    });
    
    await reply.react(actConfig.emoji);
    
    // Save session
    await this.pool.query(`
      INSERT INTO nexus_sessions (session_id, host_id, guild_id, channel_id, message_id, game, activity, description, max_players, current_players)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [sessionId, hostId, guildId, message.channel.id, reply.id, config.game, activity, description, maxPlayers, JSON.stringify([hostId])]);
    
    // Store in memory
    this.activeSessions.set(sessionId, {
      hostId,
      guildId,
      channelId: message.channel.id,
      messageId: reply.id,
      activity,
      maxPlayers,
      players: [hostId],
      waitlist: [],
      voiceChannelId: null
    });
    
    // SMART MATCHMAKING: Suggest compatible players
    await this.suggestCompatiblePlayers(message, hostId, guildId, activity, maxPlayers - 1);
    
    return sessionId;
  }

  // ═══════════════════════════════════════════════════════════════
  // SMART MATCHMAKING: AI suggests compatible players
  // ═══════════════════════════════════════════════════════════════
  
  async suggestCompatiblePlayers(message, hostId, guildId, activity, spotsNeeded) {
    try {
      // Get host profile
      const hostProfile = await this.getPlayerProfile(hostId, guildId);
      
      // Get all active players with good reputation
      const potentialPlayers = await this.pool.query(`
        SELECT user_id, reputation_score, skill_level, playstyle, communication_style, 
               sessions_completed, show_rate, mic_preference
        FROM nexus_players 
        WHERE guild_id = $1 
          AND user_id != $2 
          AND lfg_banned = false 
          AND reputation_score >= 50
          AND last_session > NOW() - INTERVAL '7 days'
        ORDER BY reputation_score DESC, sessions_completed DESC
        LIMIT 20
      `, [guildId, hostId]);
      
      if (potentialPlayers.rows.length === 0) return;
      
      // AI picks best matches
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You're matching players for a ${activity} session.

HOST PROFILE:
- Playstyle: ${hostProfile?.playstyle || 'Unknown'}
- Communication: ${hostProfile?.communication_style || 'Unknown'}
- Skill: ${hostProfile?.skill_level || 'Unknown'}
- Rep: ${hostProfile?.reputation_score || 100}

AVAILABLE PLAYERS:
${potentialPlayers.rows.map((p, i) => 
  `${i+1}. User ${p.user_id.slice(-4)} - Rep:${p.reputation_score}, Skill:${p.skill_level || '?'}, Style:${p.playstyle || '?'}, Sessions:${p.sessions_completed}, ShowRate:${Math.round((p.show_rate || 1) * 100)}%`
).join('\n')}

Pick the ${Math.min(spotsNeeded, 3)} BEST matches for the host. Consider:
1. Skill level compatibility (similar skill = good)
2. Communication style match
3. High reliability (show rate)
4. Good reputation

Respond with ONLY the user IDs of your picks, one per line:
MATCH: [user_id]
MATCH: [user_id]
...

If no good matches, respond: NO_MATCHES`
        }]
      });
      
      const text = response.content[0].text;
      const matches = text.match(/MATCH:\s*(\d+)/g);
      
      if (matches && matches.length > 0) {
        const matchIds = matches.map(m => m.replace('MATCH:', '').trim());
        const validIds = matchIds.filter(id => potentialPlayers.rows.some(p => p.user_id === id));
        
        if (validIds.length > 0) {
          const mentions = validIds.map(id => `<@${id}>`).join(' ');
          const config = this.config[this.botType];
          
          await message.channel.send({
            content: `💡 **Suggested players for this ${activity}:** ${mentions}\n*Based on compatibility and reliability*`,
            allowedMentions: { users: validIds }
          });
        }
      }
    } catch (error) {
      console.error('Smart matchmaking error:', error);
      // Don't fail the session if matchmaking fails
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDLE BUTTON INTERACTIONS
  // ═══════════════════════════════════════════════════════════════
  
  async handleButton(interaction) {
    const [action, _, sessionId] = interaction.customId.split('_');
    
    // Get session from DB
    const sessionResult = await this.pool.query(`
      SELECT * FROM nexus_sessions WHERE session_id = $1 AND status = 'open'
    `, [sessionId]);
    
    if (sessionResult.rows.length === 0) {
      await interaction.reply({ content: 'This session has ended.', ephemeral: true });
      return;
    }
    
    const session = sessionResult.rows[0];
    const userId = interaction.user.id;
    const players = session.current_players;
    
    switch (action) {
      case 'lfg':
        if (interaction.customId.includes('join')) {
          await this.handleJoin(interaction, session, userId);
        } else if (interaction.customId.includes('leave')) {
          await this.handleLeave(interaction, session, userId);
        } else if (interaction.customId.includes('start')) {
          await this.handleStart(interaction, session, userId);
        } else if (interaction.customId.includes('cancel')) {
          await this.handleCancel(interaction, session, userId);
        }
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDLE REACTION JOINS
  // ═══════════════════════════════════════════════════════════════
  
  async handleReaction(reaction, user) {
    if (user.bot) return;
    
    // Find session by message ID
    const sessionResult = await this.pool.query(`
      SELECT * FROM nexus_sessions WHERE message_id = $1 AND status = 'open'
    `, [reaction.message.id]);
    
    if (sessionResult.rows.length === 0) return;
    
    const session = sessionResult.rows[0];
    const userId = user.id;
    let players = session.current_players || [];
    
    // Check if already in
    if (players.includes(userId)) return;
    
    // Check if banned
    const profile = await this.getPlayerProfile(userId, session.guild_id);
    if (profile?.lfg_banned) {
      await user.send(`You're banned from LFG: ${profile.ban_reason}`).catch(() => {});
      return;
    }
    
    // Add player
    players.push(userId);
    
    await this.pool.query(`
      UPDATE nexus_sessions SET current_players = $1 WHERE session_id = $2
    `, [JSON.stringify(players), session.session_id]);
    
    // Update embed with new player list
    await this.updateReactionEmbed(reaction.message, session, players);
    
    // Notify
    await reaction.message.channel.send(`✅ <@${userId}> joined the ${session.activity}!`).then(m => 
      setTimeout(() => m.delete().catch(() => {}), 5000)
    );
    
    // Check if full
    if (players.length >= session.max_players) {
      await this.notifyFull(reaction.message, session, players);
    }
  }
  
  async updateReactionEmbed(message, session, players) {
    const config = this.config[this.botType];
    const playerList = players.length > 1 
      ? players.map(p => `<@${p}>`).join(', ')
      : '*React to join the crew*';
    
    const embed = EmbedBuilder.from(message.embeds[0]);
    
    // Update the crew field
    const fields = embed.data.fields.map(f => {
      if (f.name.includes('Posse') || f.name.includes('Crew')) {
        return { name: `👥 Posse (${players.length}/${session.max_players})`, value: playerList, inline: false };
      }
      return f;
    });
    
    embed.setFields(fields);
    
    // Update status if full
    if (players.length >= session.max_players) {
      const statusFields = embed.data.fields.map(f => {
        if (f.name.includes('Status')) {
          return { name: '📊 Status', value: '🟡 FULL', inline: true };
        }
        return f;
      });
      embed.setFields(statusFields);
    }
    
    await message.edit({ embeds: [embed] });
  }
  
  async notifyFull(message, session, players) {
    const playerMentions = players.map(p => `<@${p}>`).join(' ');
    await message.channel.send(`🎉 **${session.activity.toUpperCase()} crew is ready!**\n${playerMentions}\n\n*Host can use \`?done\` when finished to give reputation.*`);
  }

  async handleJoin(interaction, session, userId) {
    const players = session.current_players;
    
    // Check if already in
    if (players.includes(userId)) {
      await interaction.reply({ content: "You're already in this session.", ephemeral: true });
      return;
    }
    
    // Check if banned
    const profile = await this.getPlayerProfile(userId, session.guild_id);
    if (profile?.lfg_banned) {
      await interaction.reply({ content: `You're banned from LFG: ${profile.ban_reason}`, ephemeral: true });
      return;
    }
    
    // Check reputation and warn host if low
    if (profile && profile.reputation_score < 40) {
      // Notify host privately that a low-rep player wants to join
      const host = await this.client.users.fetch(session.host_id).catch(() => null);
      if (host) {
        host.send(`⚠️ **Low reputation player joining your ${session.activity}**\n<@${userId}> has a reputation of ${profile.reputation_score}/100.\nReason: ${profile.ai_notes || 'Multiple issues'}`).catch(() => {});
      }
    }
    
    // Add player
    players.push(userId);
    
    await this.pool.query(`
      UPDATE nexus_sessions SET current_players = $1 WHERE session_id = $2
    `, [JSON.stringify(players), session.session_id]);
    
    // Update embed
    await this.updateSessionEmbed(interaction, session, players);
    
    await interaction.reply({ content: `✅ You joined the ${session.activity} session!`, ephemeral: true });
    
    // Check if full
    if (players.length >= session.max_players) {
      await this.autoStart(interaction, session, players);
    }
  }

  async handleLeave(interaction, session, userId) {
    const players = session.current_players.filter(p => p !== userId);
    
    // Can't leave if you're host (must cancel)
    if (userId === session.host_id) {
      await interaction.reply({ content: "You're the host. Use Cancel to end the session.", ephemeral: true });
      return;
    }
    
    await this.pool.query(`
      UPDATE nexus_sessions SET current_players = $1 WHERE session_id = $2
    `, [JSON.stringify(players), session.session_id]);
    
    await this.updateSessionEmbed(interaction, session, players);
    await interaction.reply({ content: '👋 You left the session.', ephemeral: true });
  }

  async handleStart(interaction, session, userId) {
    // Only host can start
    if (userId !== session.host_id) {
      await interaction.reply({ content: 'Only the host can start the session.', ephemeral: true });
      return;
    }
    
    await this.startSession(interaction, session);
  }

  async handleCancel(interaction, session, userId) {
    // Only host can cancel
    if (userId !== session.host_id) {
      await interaction.reply({ content: 'Only the host can cancel.', ephemeral: true });
      return;
    }
    
    await this.pool.query(`
      UPDATE nexus_sessions SET status = 'cancelled' WHERE session_id = $1
    `, [session.session_id]);
    
    // Update embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setTitle('❌ Session Cancelled')
      .setColor(0xFF0000);
    
    await interaction.message.edit({ embeds: [embed], components: [] });
    await interaction.reply({ content: 'Session cancelled.', ephemeral: true });
    
    // Track abandonment for host
    await this.pool.query(`
      UPDATE nexus_players SET sessions_abandoned = sessions_abandoned + 1, reputation_score = GREATEST(0, reputation_score - 5)
      WHERE user_id = $1 AND guild_id = $2
    `, [session.host_id, session.guild_id]);
  }

  // ═══════════════════════════════════════════════════════════════
  // START SESSION
  // ═══════════════════════════════════════════════════════════════
  
  async startSession(interaction, session) {
    const players = session.current_players;
    const guild = interaction.guild;
    
    // Create voice channel
    let voiceChannel = null;
    try {
      voiceChannel = await guild.channels.create({
        name: `🎮 ${session.activity} - ${session.session_id}`,
        type: ChannelType.GuildVoice,
        userLimit: session.max_players,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.Connect]
          },
          ...players.map(p => ({
            id: p,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          }))
        ]
      });
      
      await this.pool.query(`
        UPDATE nexus_sessions SET voice_channel_id = $1, status = 'active', started_at = NOW()
        WHERE session_id = $2
      `, [voiceChannel.id, session.session_id]);
      
    } catch (e) {
      console.error('Voice channel creation error:', e);
    }
    
    // Update embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setTitle(`🎮 ${session.activity.toUpperCase()} - IN PROGRESS`)
      .setColor(0x00FF00)
      .addFields({ name: 'Voice Channel', value: voiceChannel ? `<#${voiceChannel.id}>` : 'Not available' });
    
    // New buttons for active session
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`lfg_complete_${session.session_id}`)
          .setLabel('Complete')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`lfg_report_${session.session_id}`)
          .setLabel('Report Player')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚨')
      );
    
    await interaction.message.edit({ embeds: [embed], components: [row] });
    
    // DM all players
    for (const playerId of players) {
      const user = await this.client.users.fetch(playerId).catch(() => null);
      if (user) {
        const dm = new EmbedBuilder()
          .setTitle(`🎮 ${session.activity} is starting!`)
          .setDescription(voiceChannel ? `Join voice: <#${voiceChannel.id}>` : 'Head to your usual voice channel.')
          .addFields({ name: 'Players', value: players.map(p => `<@${p}>`).join(', ') })
          .setColor(0x00FF00);
        
        user.send({ embeds: [dm] }).catch(() => {});
      }
    }
    
    await interaction.reply({ content: '🚀 Session started! Check your DMs.', ephemeral: true });
    
    // Schedule voice channel cleanup
    if (voiceChannel) {
      setTimeout(() => this.checkVoiceChannel(voiceChannel.id, session.session_id), 1800000); // 30 min
    }
  }

  async autoStart(interaction, session, players) {
    await interaction.followUp({ content: `🎉 Session is full! Starting automatically...`, ephemeral: false });
    await this.startSession(interaction, session);
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION COMPLETION & REPUTATION
  // ═══════════════════════════════════════════════════════════════
  
  async completeSession(interaction, session) {
    const players = session.current_players;
    
    // Mark complete
    await this.pool.query(`
      UPDATE nexus_sessions SET status = 'completed', completed_at = NOW()
      WHERE session_id = $1
    `, [session.session_id]);
    
    // Update all player reputations
    for (const playerId of players) {
      await this.pool.query(`
        INSERT INTO nexus_players (user_id, guild_id, sessions_completed, reputation_score)
        VALUES ($1, $2, 1, 105)
        ON CONFLICT (user_id, guild_id) DO UPDATE SET
          sessions_completed = nexus_players.sessions_completed + 1,
          reputation_score = LEAST(150, nexus_players.reputation_score + 5),
          last_session = NOW()
      `, [playerId, session.guild_id]);
    }
    
    // Update embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setTitle(`✅ ${session.activity.toUpperCase()} - COMPLETED`)
      .setColor(0x00FF00)
      .setFooter({ text: 'Thanks for playing! +5 reputation for all players.' });
    
    await interaction.message.edit({ embeds: [embed], components: [] });
    
    // Delete voice channel if exists
    if (session.voice_channel_id) {
      const vc = interaction.guild.channels.cache.get(session.voice_channel_id);
      if (vc) vc.delete().catch(() => {});
    }
    
    // Log for learning
    await this.pool.query(`
      INSERT INTO nexus_session_history (session_id, host_id, players, activity, outcome, duration_minutes)
      VALUES ($1, $2, $3, $4, 'completed', $5)
    `, [
      session.session_id,
      session.host_id,
      JSON.stringify(players),
      session.activity,
      session.started_at ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000) : null
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // PLAYER REPORTS
  // ═══════════════════════════════════════════════════════════════
  
  async handleReport(interaction, session) {
    // TODO: Modal for report details
    // For now, simple report
    
    await interaction.reply({
      content: 'Who do you want to report? Tag them with @ and explain the issue.',
      ephemeral: true
    });
  }

  async processReport(reporterId, reportedId, sessionId, reason, guildId) {
    // AI analyzes the report
    const reporterProfile = await this.getPlayerProfile(reporterId, guildId);
    const reportedProfile = await this.getPlayerProfile(reportedId, guildId);
    
    // Get session context
    const session = await this.pool.query(`
      SELECT * FROM nexus_sessions WHERE session_id = $1
    `, [sessionId]);
    
    const assessment = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Assess this player report:

REPORTER:
- Reputation: ${reporterProfile?.reputation_score || 100}/100
- Sessions completed: ${reporterProfile?.sessions_completed || 0}
- History: ${reporterProfile?.ai_notes || 'Clean'}

REPORTED PLAYER:
- Reputation: ${reportedProfile?.reputation_score || 100}/100
- Sessions completed: ${reportedProfile?.sessions_completed || 0}
- Past issues: ${reportedProfile?.ai_notes || 'None'}
- Times reported: ${reportedProfile?.sessions_kicked || 0}

REPORT REASON:
"${reason}"

Determine:
1. CREDIBILITY: [high/medium/low] - Is this report likely genuine?
2. SEVERITY: [minor/moderate/severe]
3. ACTION: [none/warn/temp_ban/ban]
4. REPUTATION_CHANGE: [number to subtract from reported player, 0-30]
5. REASONING: [Brief explanation]`
      }]
    });
    
    const text = assessment.content[0].text;
    
    const credibility = this.extract(text, 'CREDIBILITY');
    const severity = this.extract(text, 'SEVERITY');
    const action = this.extract(text, 'ACTION');
    const repChange = parseInt(this.extract(text, 'REPUTATION_CHANGE')) || 0;
    const reasoning = this.extract(text, 'REASONING');
    
    // Apply reputation change
    if (repChange > 0) {
      await this.pool.query(`
        UPDATE nexus_players 
        SET reputation_score = GREATEST(0, reputation_score - $3),
            sessions_kicked = sessions_kicked + 1,
            ai_notes = COALESCE(ai_notes, '') || E'\n' || $4
        WHERE user_id = $1 AND guild_id = $2
      `, [reportedId, guildId, repChange, `[${new Date().toISOString().split('T')[0]}] Reported: ${reason.slice(0, 100)}`]);
    }
    
    // Apply ban if needed
    if (action === 'ban' || action === 'temp_ban') {
      await this.pool.query(`
        UPDATE nexus_players SET lfg_banned = TRUE, ban_reason = $3
        WHERE user_id = $1 AND guild_id = $2
      `, [reportedId, guildId, reasoning]);
    }
    
    // Log report
    await this.pool.query(`
      INSERT INTO nexus_reports (reporter_id, reported_id, session_id, reason, ai_assessment, action_taken)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [reporterId, reportedId, sessionId, reason, text, action]);
    
    return { credibility, severity, action, reasoning };
  }

  // ═══════════════════════════════════════════════════════════════
  // SMART MATCHMAKING
  // ═══════════════════════════════════════════════════════════════
  
  async findCompatiblePlayers(hostId, activity, guildId, count = 3) {
    const hostProfile = await this.getPlayerProfile(hostId, guildId);
    
    // Get available players who've been active recently
    const candidates = await this.pool.query(`
      SELECT * FROM nexus_players
      WHERE guild_id = $1 
        AND user_id != $2
        AND lfg_banned = FALSE
        AND reputation_score > 30
        AND last_session > NOW() - INTERVAL '7 days'
      ORDER BY reputation_score DESC, sessions_completed DESC
      LIMIT 20
    `, [guildId, hostId]);
    
    if (candidates.rows.length === 0) return [];
    
    // AI picks best matches
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Pick the ${count} best players for a ${activity} session.

HOST:
- Playstyle: ${hostProfile?.playstyle || 'Unknown'}
- Communication: ${hostProfile?.communication_style || 'Unknown'}
- Skill: ${hostProfile?.skill_level || 'Unknown'}

CANDIDATES:
${candidates.rows.map((c, i) => `${i + 1}. Rep: ${c.reputation_score}, Sessions: ${c.sessions_completed}, Style: ${c.playstyle || '?'}, Comm: ${c.communication_style || '?'}`).join('\n')}

Return just the numbers of the best matches, comma-separated (e.g., "1, 5, 8")`
      }]
    });
    
    const picks = response.content[0].text.match(/\d+/g)?.map(n => parseInt(n) - 1) || [];
    return picks.slice(0, count).map(i => candidates.rows[i]).filter(Boolean);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════
  
  async getPlayerProfile(userId, guildId) {
    const result = await this.pool.query(`
      SELECT * FROM nexus_players WHERE user_id = $1 AND guild_id = $2
    `, [userId, guildId]);
    
    if (result.rows.length === 0) {
      await this.pool.query(`
        INSERT INTO nexus_players (user_id, guild_id) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [userId, guildId]);
      return null;
    }
    
    return result.rows[0];
  }

  async updateSessionEmbed(interaction, session, players) {
    const config = this.config[this.botType];
    
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .spliceFields(2, 1, { name: 'Players', value: `${players.length}/${session.max_players}`, inline: true });
    
    // Add player list if more than just host
    if (players.length > 1) {
      const existingField = embed.data.fields?.find(f => f.name === 'Joined');
      if (existingField) {
        existingField.value = players.map(p => `<@${p}>`).join(', ');
      } else {
        embed.addFields({ name: 'Joined', value: players.map(p => `<@${p}>`).join(', ') });
      }
    }
    
    await interaction.message.edit({ embeds: [embed] });
  }

  async checkVoiceChannel(channelId, sessionId) {
    const guild = this.client.guilds.cache.find(g => g.channels.cache.has(channelId));
    if (!guild) return;
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;
    
    // If empty, delete
    if (channel.members.size === 0) {
      await channel.delete().catch(() => {});
      
      // Mark session as completed
      await this.pool.query(`
        UPDATE nexus_sessions SET status = 'completed', completed_at = NOW()
        WHERE session_id = $1 AND status = 'active'
      `, [sessionId]);
    } else {
      // Check again in 10 minutes
      setTimeout(() => this.checkVoiceChannel(channelId, sessionId), 600000);
    }
  }

  startSessionCleanup() {
    // Every hour, clean up stale sessions
    setInterval(async () => {
      await this.pool.query(`
        UPDATE nexus_sessions SET status = 'expired'
        WHERE status = 'open' AND created_at < NOW() - INTERVAL '2 hours'
      `);
    }, 3600000);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMAND HANDLERS (fallback for explicit commands)
  // ═══════════════════════════════════════════════════════════════
  
  async handleCommand(message, command, args) {
    const config = this.config[this.botType];
    
    // Check if command matches an activity
    if (config.activities.includes(command)) {
      const maxPlayers = parseInt(args[0]) || config.defaultSize;
      const description = args.slice(1).join(' ') || null;
      await this.createSession(message, command, maxPlayers, description);
      return true;
    }
    
    switch (command) {
      case 'lfg':
        const activity = args[0] || config.activities[0];
        const players = parseInt(args[1]) || config.defaultSize;
        await this.createSession(message, activity, players, args.slice(2).join(' '));
        return true;
        
      case 'rep':
      case 'reputation':
        await this.showReputation(message, args[0] ? message.mentions.users.first() : message.author);
        return true;
        
      case 'done':
      case 'complete':
        await this.completeActiveSession(message);
        return true;
        
      case 'cancel':
        await this.cancelActiveSession(message);
        return true;
    }
    
    return false;
  }

  async showReputation(message, user) {
    const profile = await this.getPlayerProfile(user.id, message.guild.id);
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${user.username}'s LFG Reputation`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Reputation', value: `${profile?.reputation_score || 100}/150`, inline: true },
        { name: 'Sessions', value: `${profile?.sessions_completed || 0} completed`, inline: true },
        { name: 'Reliability', value: profile?.is_reliable !== false ? '✅ Reliable' : '⚠️ Unreliable', inline: true }
      )
      .setColor(profile?.reputation_score > 80 ? 0x00FF00 : profile?.reputation_score > 50 ? 0xFFAA00 : 0xFF0000);
    
    if (profile?.playstyle) {
      embed.addFields({ name: 'Playstyle', value: profile.playstyle });
    }
    
    if (profile?.lfg_banned) {
      embed.addFields({ name: '🚫 LFG Banned', value: profile.ban_reason || 'Multiple violations' });
    }
    
    message.reply({ embeds: [embed] });
  }

  async completeActiveSession(message) {
    const session = await this.pool.query(`
      SELECT * FROM nexus_sessions 
      WHERE host_id = $1 AND guild_id = $2 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [message.author.id, message.guild.id]);
    
    if (session.rows.length === 0) {
      return message.reply("You don't have an active session.");
    }
    
    await this.completeSession({ message, guild: message.guild }, session.rows[0]);
    message.reply('✅ Session marked as complete! +5 reputation for all players.');
  }

  async cancelActiveSession(message) {
    const session = await this.pool.query(`
      SELECT * FROM nexus_sessions 
      WHERE host_id = $1 AND guild_id = $2 AND status IN ('open', 'active')
      ORDER BY created_at DESC LIMIT 1
    `, [message.author.id, message.guild.id]);
    
    if (session.rows.length === 0) {
      return message.reply("You don't have an active session.");
    }
    
    await this.pool.query(`UPDATE nexus_sessions SET status = 'cancelled' WHERE session_id = $1`, [session.rows[0].session_id]);
    
    // Delete voice channel if exists
    if (session.rows[0].voice_channel_id) {
      const vc = message.guild.channels.cache.get(session.rows[0].voice_channel_id);
      if (vc) vc.delete().catch(() => {});
    }
    
    message.reply('❌ Session cancelled.');
  }
}

module.exports = NexusLFG;
