/**
 * ██╗    ██╗ █████╗  ██████╗  ██████╗ ███╗   ██╗    ██╗     ███████╗ ██████╗ 
 * ██║    ██║██╔══██╗██╔════╝ ██╔═══██╗████╗  ██║    ██║     ██╔════╝██╔════╝ 
 * ██║ █╗ ██║███████║██║  ███╗██║   ██║██╔██╗ ██║    ██║     █████╗  ██║  ███╗
 * ██║███╗██║██╔══██║██║   ██║██║   ██║██║╚██╗██║    ██║     ██╔══╝  ██║   ██║
 * ╚███╔███╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║    ███████╗██║     ╚██████╔╝
 *  ╚══╝╚══╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝      ╚═════╝ 
 * 
 * ADVANCED WAGON DELIVERY LFG SYSTEM v2
 * - Up to 6 players (1 host + 5 crew)
 * - Host can kick players
 * - Blacklist per session
 * - DM notifications
 * - Detailed descriptions
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

// ============================================
// WAGON CONFIGURATION
// ============================================

const WAGON_CONFIG = {
  // Delivery types with descriptions
  deliveryTypes: {
    'local': { 
      name: '📍 Local Delivery', 
      payout: 500, 
      description: 'Short distance, safe delivery. No PvP risk. Lower payout but guaranteed.'
    },
    'distant': { 
      name: '🗺️ Distant Delivery', 
      payout: 625, 
      description: 'Long distance, HIGH RISK! Other players can attack. 25% more payout.'
    }
  },
  
  // Wagon sizes with descriptions
  wagonSizes: {
    'small': { 
      name: '📦 Small Wagon', 
      goods: 25, 
      payout: 250,
      description: '25 goods capacity. Quick fill, lower payout. Good for starting out.'
    },
    'medium': { 
      name: '📦📦 Medium Wagon', 
      goods: 50,
      payout: 500,
      description: '50 goods capacity. Balanced option. Requires Medium Delivery Wagon.'
    },
    'large': { 
      name: '🚚 Large Wagon', 
      goods: 100,
      payout: 625,
      description: '100 goods capacity. Max payout! Requires Large Delivery Wagon upgrade.'
    }
  },
  
  // Dupe method info
  dupeInfo: {
    name: 'Wagon Dupe Glitch',
    dupeCount: 11,
    description: 'Duplicate your wagon 11 times for massive profits! Requires 2+ players.'
  },
  
  // Session settings - UP TO 6 PLAYERS
  minPlayers: 2,
  maxPlayers: 6, // 1 host + 5 crew
  sessionTimeout: 45 * 60 * 1000,
  voiceChannelTimeout: 10 * 60 * 1000
};

// Active sessions storage
const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map(); // sessionId -> Set of kicked user IDs

// ============================================
// INITIALIZE LFG SYSTEM
// ============================================

function initialize(client) {
  console.log('[WAGON LFG] Initializing advanced Wagon LFG system v2...');
  
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      await handleButton(interaction, client);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, client);
    }
  });
  
  setInterval(() => checkSessionTimeouts(client), 60000);
  
  console.log('[WAGON LFG] ✅ Advanced Wagon LFG v2 initialized (up to 6 players)');
}

// ============================================
// CREATE NEW SESSION
// ============================================

async function createSession(message, client) {
  const userId = message.author.id;
  const guild = message.guild;
  
  // Check cooldown
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    const remaining = Math.ceil((3 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    return message.reply(`⏳ Hold your horses, partner! Wait ${remaining} seconds before hosting another wagon run.`);
  }
  
  // Check existing session
  for (const [sessionId, session] of activeSessions) {
    if (session.host === userId) {
      return message.reply(`❌ You already have an active session! Use the Cancel button or wait for it to expire.`);
    }
  }
  
  // Get platform
  const member = await guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5') || r.name.includes('Primary: PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4') || r.name.includes('Primary: PS4'));
  const platform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  const sessionId = `wagon_${Date.now()}_${userId}`;
  
  const session = {
    id: sessionId,
    host: userId,
    hostName: message.author.username,
    platform: platform,
    players: [{ userId: userId, name: message.author.username }],
    deliveryType: null,
    wagonSize: 'large',
    isDupe: true,
    status: 'setup',
    voiceChannel: null,
    messageId: null,
    channelId: message.channel.id,
    createdAt: Date.now(),
    startedAt: null,
    totalEarnings: 0,
    dupesCompleted: 0,
    deliveriesCompleted: 0
  };
  
  // Initialize kicked users set for this session
  kickedUsers.set(sessionId, new Set());
  
  const setupEmbed = createSetupEmbed(session);
  const setupComponents = createSetupComponents(sessionId, session);
  
  const msg = await message.channel.send({ 
    embeds: [setupEmbed], 
    components: setupComponents 
  });
  
  session.messageId = msg.id;
  activeSessions.set(sessionId, session);
  
  return session;
}

// ============================================
// SETUP EMBED
// ============================================

function createSetupEmbed(session) {
  const deliveryInfo = session.deliveryType 
    ? WAGON_CONFIG.deliveryTypes[session.deliveryType]
    : null;
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - SETUP')
    .setDescription(
      `**Host:** ${session.hostName}\n` +
      `**Platform:** ${session.platform}\n\n` +
      `*Configure your wagon run below*`
    )
    .addFields(
      { 
        name: '📍 Delivery Type', 
        value: deliveryInfo ? `${deliveryInfo.name}\n*${deliveryInfo.description}*` : '❓ Not selected', 
        inline: false 
      },
      { 
        name: '📦 Wagon Size', 
        value: `${wagonInfo.name}\n*${wagonInfo.description}*`, 
        inline: false 
      },
      { 
        name: '🔄 Dupe Method', 
        value: session.isDupe 
          ? `✅ **ON** (11 dupes)\n*${WAGON_CONFIG.dupeInfo.description}*` 
          : '❌ OFF (single delivery)', 
        inline: false 
      }
    )
    .setColor(0x8B4513)
    .setFooter({ text: 'Select your options, then click "Start Recruiting"' })
    .setTimestamp();
  
  return embed;
}

// ============================================
// RECRUITING EMBED
// ============================================

function createRecruitingEmbed(session) {
  const deliveryInfo = WAGON_CONFIG.deliveryTypes[session.deliveryType];
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  // Build player list (up to 6 slots)
  let playerList = '';
  for (let i = 0; i < WAGON_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const player = session.players[i];
      const isHost = player.userId === session.host;
      playerList += `${i + 1}. ${isHost ? '👑' : '🤠'} **${player.name}** ${isHost ? '(Host)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open Slot*\n`;
    }
  }
  
  // Calculate potential earnings
  let potentialEarnings = wagonInfo.payout;
  if (session.deliveryType === 'distant') {
    potentialEarnings = Math.floor(potentialEarnings * 1.25);
  }
  if (session.isDupe) {
    potentialEarnings = potentialEarnings * 11;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - RECRUITING')
    .setDescription(
      `**Host:** ${session.hostName} | **Platform:** ${session.platform}\n\n` +
      `${deliveryInfo.name} • ${wagonInfo.name} • ${session.isDupe ? 'Dupe: ON' : 'Single Run'}`
    )
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Info', value: 
        `Slots: ${session.players.length}/${WAGON_CONFIG.maxPlayers}\n` +
        `Potential: $${potentialEarnings.toLocaleString()}\n` +
        `Status: ${session.status === 'in_progress' ? '🟢 IN PROGRESS' : '🟡 RECRUITING'}`,
        inline: true 
      }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0xFFD700)
    .setFooter({ text: `Session ID: ${session.id.slice(-8)} • Click Join to hop on!` })
    .setTimestamp();
  
  if (session.dupesCompleted > 0 || session.deliveriesCompleted > 0) {
    embed.addFields({
      name: '💰 Earnings',
      value: `Dupes: ${session.dupesCompleted} | Deliveries: ${session.deliveriesCompleted} | Total: $${session.totalEarnings.toLocaleString()}`,
      inline: false
    });
  }
  
  return embed;
}

// ============================================
// SETUP COMPONENTS
// ============================================

function createSetupComponents(sessionId, session) {
  // Delivery Type Dropdown with descriptions
  const deliverySelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_delivery_${sessionId}`)
    .setPlaceholder('📍 Select Delivery Type')
    .addOptions([
      {
        label: 'Local Delivery',
        description: 'Short & safe. $500 base payout.',
        value: 'local',
        emoji: '📍'
      },
      {
        label: 'Distant Delivery',
        description: 'Long & risky (PvP). $625 base payout.',
        value: 'distant',
        emoji: '🗺️'
      }
    ]);
  
  // Wagon Size Dropdown with descriptions
  const wagonSelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_size_${sessionId}`)
    .setPlaceholder('📦 Select Wagon Size')
    .addOptions([
      {
        label: 'Small Wagon',
        description: '25 goods. Quick but low payout.',
        value: 'small',
        emoji: '📦'
      },
      {
        label: 'Medium Wagon',
        description: '50 goods. Balanced option.',
        value: 'medium',
        emoji: '🛒'
      },
      {
        label: 'Large Wagon',
        description: '100 goods. Maximum profits!',
        value: 'large',
        emoji: '🚚'
      }
    ]);
  
  // Buttons
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_dupe_${sessionId}`)
      .setLabel(session.isDupe ? 'Dupe: ON' : 'Dupe: OFF')
      .setStyle(session.isDupe ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(`wagon_start_${sessionId}`)
      .setLabel('Start Recruiting')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`wagon_cancel_${sessionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
  
  return [
    new ActionRowBuilder().addComponents(deliverySelect),
    new ActionRowBuilder().addComponents(wagonSelect),
    buttons
  ];
}

// ============================================
// RECRUITING COMPONENTS
// ============================================

function createRecruitingComponents(sessionId, session) {
  const isHost = (userId) => userId === session.host;
  
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_join_${sessionId}`)
      .setLabel('Join Posse')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🤠'),
    new ButtonBuilder()
      .setCustomId(`wagon_leave_${sessionId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚪'),
    new ButtonBuilder()
      .setCustomId(`wagon_voice_${sessionId}`)
      .setLabel('Create Voice')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔊')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_ready_${sessionId}`)
      .setLabel('Start Run')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`wagon_complete_${sessionId}`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`wagon_end_${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🛑')
  );
  
  // Host-only: Kick player dropdown (only show if more than 1 player)
  if (session.players.length > 1) {
    const kickOptions = session.players
      .filter(p => p.userId !== session.host)
      .map(p => ({
        label: `Kick ${p.name}`,
        value: p.userId,
        emoji: '👢'
      }));
    
    if (kickOptions.length > 0) {
      const kickSelect = new StringSelectMenuBuilder()
        .setCustomId(`wagon_kick_${sessionId}`)
        .setPlaceholder('👢 Kick a player (Host only)')
        .addOptions(kickOptions);
      
      return [row1, row2, new ActionRowBuilder().addComponents(kickSelect)];
    }
  }
  
  return [row1, row2];
}

// ============================================
// BUTTON HANDLERS
// ============================================

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('wagon_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired or not found.', ephemeral: true });
  }
  
  try {
    switch (action) {
      case 'dupe':
        await handleDupeToggle(interaction, session, sessionId);
        break;
      case 'start':
        await handleStartRecruiting(interaction, session, sessionId, client);
        break;
      case 'cancel':
        await handleCancelSession(interaction, session, sessionId, client);
        break;
      case 'join':
        await handleJoinSession(interaction, session, sessionId, client);
        break;
      case 'leave':
        await handleLeaveSession(interaction, session, sessionId, client);
        break;
      case 'voice':
        await handleCreateVoice(interaction, session, sessionId, client);
        break;
      case 'ready':
        await handleReadyUp(interaction, session, sessionId, client);
        break;
      case 'complete':
        await handleRunComplete(interaction, session, sessionId, client);
        break;
      case 'end':
        await handleEndSession(interaction, session, sessionId, client);
        break;
    }
  } catch (error) {
    console.error('[WAGON LFG] Button error:', error);
    interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
  }
}

// ============================================
// SELECT MENU HANDLERS
// ============================================

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('wagon_')) return;
  
  const parts = customId.split('_');
  const type = parts[1]; // delivery, size, or kick
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired or not found.', ephemeral: true });
  }
  
  // Kick handler
  if (type === 'kick') {
    await handleKickPlayer(interaction, session, sessionId, client);
    return;
  }
  
  // Only host can change settings
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can change settings.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  
  if (type === 'delivery') {
    session.deliveryType = value;
  } else if (type === 'size') {
    session.wagonSize = value;
  }
  
  const embed = createSetupEmbed(session);
  const components = createSetupComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleDupeToggle(interaction, session, sessionId) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can change settings.', ephemeral: true });
  }
  
  session.isDupe = !session.isDupe;
  
  const embed = createSetupEmbed(session);
  const components = createSetupComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleStartRecruiting(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can start recruiting.', ephemeral: true });
  }
  
  if (!session.deliveryType) {
    return interaction.reply({ content: '❌ Please select a delivery type first!', ephemeral: true });
  }
  
  session.status = 'recruiting';
  session.startedAt = Date.now();
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  // Announce
  await interaction.channel.send({
    content: `🛒 **WAGON RUN OPEN!** ${session.platform} | ${WAGON_CONFIG.deliveryTypes[session.deliveryType].name} | ${session.isDupe ? '11 Dupes' : 'Single'} | Click Join below!`
  });
}

async function handleJoinSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  // Check if kicked from this session
  const kicked = kickedUsers.get(sessionId);
  if (kicked && kicked.has(userId)) {
    return interaction.reply({ 
      content: '❌ You were removed from this session by the host. You cannot rejoin this wagon run. Wait for the next `?wagon` command.', 
      ephemeral: true 
    });
  }
  
  // Check if already in session
  if (session.players.some(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ You\'re already in this session!', ephemeral: true });
  }
  
  // Check if session is full
  if (session.players.length >= WAGON_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Session is full!', ephemeral: true });
  }
  
  // Check for required role
  const member = interaction.member;
  const requiredRoles = ['Wagon Runner', 'Frontier Outlaw', '🐴 Frontier Outlaw', '🛞 Wagon Runner'];
  const hasRole = member.roles.cache.some(r => requiredRoles.some(req => r.name.includes(req)));
  
  if (!hasRole) {
    // DM the user
    try {
      const rolesChannel = interaction.guild.channels.cache.find(c => c.name === 'roles' || c.name === 'get-roles');
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛒 Wagon LFG - Role Required')
            .setDescription(
              `Hey partner! You need the **Wagon Runner** or **Frontier Outlaw** role to join wagon runs.\n\n` +
              `${rolesChannel ? `Head to <#${rolesChannel.id}> to get your roles!` : 'Check the roles channel in the server.'}`
            )
            .setColor(0xFF6B6B)
        ]
      });
    } catch (e) {
      // DMs might be disabled
    }
    
    return interaction.reply({ 
      content: '❌ You need the **Wagon Runner** or **Frontier Outlaw** role! Check your DMs for more info.', 
      ephemeral: true 
    });
  }
  
  // Add player
  session.players.push({ userId: userId, name: interaction.user.username });
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  // Notify
  await interaction.channel.send({
    content: `🤠 **${interaction.user.username}** joined the wagon! (${session.players.length}/${WAGON_CONFIG.maxPlayers})`
  });
}

async function handleLeaveSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  // Host can't leave (must cancel)
  if (userId === session.host) {
    return interaction.reply({ content: '❌ As host, use "End Session" to close the wagon run.', ephemeral: true });
  }
  
  const playerIndex = session.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ You\'re not in this session.', ephemeral: true });
  }
  
  session.players.splice(playerIndex, 1);
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleKickPlayer(interaction, session, sessionId, client) {
  // Only host can kick
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can kick players.', ephemeral: true });
  }
  
  const kickUserId = interaction.values[0];
  
  // Find and remove player
  const playerIndex = session.players.findIndex(p => p.userId === kickUserId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ Player not found in session.', ephemeral: true });
  }
  
  const kickedPlayer = session.players[playerIndex];
  session.players.splice(playerIndex, 1);
  
  // Add to kicked list so they can't rejoin
  const kicked = kickedUsers.get(sessionId);
  if (kicked) kicked.add(kickUserId);
  
  // DM the kicked player
  try {
    const kickedMember = await interaction.guild.members.fetch(kickUserId);
    await kickedMember.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🛒 Removed from Wagon Run')
          .setDescription(
            `You were removed from **${session.hostName}**'s wagon run.\n\n` +
            `You cannot rejoin this session. Wait for the next \`?wagon\` command to join a new one.`
          )
          .setColor(0xFF6B6B)
      ]
    });
  } catch (e) {
    // DMs might be disabled
  }
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `👢 **${kickedPlayer.name}** was removed from the wagon by the host.`
  });
}

async function handleCreateVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can create voice channels.', ephemeral: true });
  }
  
  if (session.voiceChannel) {
    return interaction.reply({ content: `🔊 Voice channel already exists: <#${session.voiceChannel}>`, ephemeral: true });
  }
  
  try {
    const category = interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('rdo') || c.name.toLowerCase().includes('red dead'))
    );
    
    const voiceChannel = await interaction.guild.channels.create({
      name: `🛒 Wagon - ${session.hostName}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: WAGON_CONFIG.maxPlayers
    });
    
    session.voiceChannel = voiceChannel.id;
    
    const embed = createRecruitingEmbed(session);
    const components = createRecruitingComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    
    await interaction.channel.send({
      content: `🔊 Voice channel created! <#${voiceChannel.id}>`
    });
  } catch (error) {
    console.error('[WAGON LFG] Voice create error:', error);
    await interaction.reply({ content: '❌ Failed to create voice channel.', ephemeral: true });
  }
}

async function handleReadyUp(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can start the run.', ephemeral: true });
  }
  
  if (session.players.length < WAGON_CONFIG.minPlayers) {
    return interaction.reply({ content: `❌ Need at least ${WAGON_CONFIG.minPlayers} players!`, ephemeral: true });
  }
  
  session.status = 'in_progress';
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  await interaction.channel.send({
    content: `🚀 **WAGON RUN STARTING!** ${mentions}\n\nGood luck out there, partners! 🤠`
  });
}

async function handleRunComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can mark runs complete.', ephemeral: true });
  }
  
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  let payout = wagonInfo.payout;
  if (session.deliveryType === 'distant') {
    payout = Math.floor(payout * 1.25);
  }
  
  if (session.isDupe) {
    session.dupesCompleted++;
  } else {
    session.deliveriesCompleted++;
  }
  session.totalEarnings += payout;
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `💰 **${session.isDupe ? 'DUPE' : 'DELIVERY'} #${session.dupesCompleted + session.deliveriesCompleted} COMPLETE!** +$${payout.toLocaleString()} | Total: $${session.totalEarnings.toLocaleString()}`
  });
}

async function handleCancelSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can cancel.', ephemeral: true });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle('❌ Wagon Run Cancelled')
        .setDescription(`**${session.hostName}** cancelled the wagon run.`)
        .setColor(0xFF0000)
    ],
    components: []
  });
}

async function handleEndSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can end the session.', ephemeral: true });
  }
  
  userCooldowns.set(session.host, Date.now());
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 Wagon Run Complete!')
    .setDescription(`**Host:** ${session.hostName}`)
    .addFields(
      { name: '💰 Total Earnings', value: `$${session.totalEarnings.toLocaleString()}`, inline: true },
      { name: '🔄 Dupes', value: `${session.dupesCompleted}`, inline: true },
      { name: '📦 Deliveries', value: `${session.deliveriesCompleted}`, inline: true },
      { name: '👥 Crew', value: session.players.map(p => p.name).join(', '), inline: false }
    )
    .setColor(0x00FF00)
    .setTimestamp();
  
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function cleanupSession(session, client) {
  if (session.voiceChannel) {
    try {
      const channel = await client.channels.fetch(session.voiceChannel);
      if (channel) await channel.delete();
    } catch (e) {}
  }
}

function checkSessionTimeouts(client) {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions) {
    if (now - session.createdAt > WAGON_CONFIG.sessionTimeout) {
      cleanupSession(session, client);
      activeSessions.delete(sessionId);
      kickedUsers.delete(sessionId);
      console.log(`[WAGON LFG] Session ${sessionId} timed out`);
    }
  }
}

async function createTables(client) {
  // No database tables needed for this version - all in memory
  console.log('[WAGON LFG] Using in-memory session storage');
}

module.exports = {
  initialize,
  createSession,
  createTables
};
