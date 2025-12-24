/**
 * ██╗    ██╗ █████╗  ██████╗  ██████╗ ███╗   ██╗    ██╗     ███████╗ ██████╗ 
 * ██║    ██║██╔══██╗██╔════╝ ██╔═══██╗████╗  ██║    ██║     ██╔════╝██╔════╝ 
 * ██║ █╗ ██║███████║██║  ███╗██║   ██║██╔██╗ ██║    ██║     █████╗  ██║  ███╗
 * ██║███╗██║██╔══██║██║   ██║██║   ██║██║╚██╗██║    ██║     ██╔══╝  ██║   ██║
 * ╚███╔███╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║    ███████╗██║     ╚██████╔╝
 *  ╚══╝╚══╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝      ╚═════╝ 
 * 
 * ADVANCED WAGON DELIVERY LFG SYSTEM
 * Trader wagon duplication & delivery matchmaking
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
  // Delivery types
  deliveryTypes: {
    'local': { name: '📍 Local Delivery', payout: 500, distance: 'Short', risk: 'Low' },
    'distant': { name: '🗺️ Distant Delivery', payout: 625, distance: 'Long', risk: 'High (PvP enabled)' }
  },
  
  // Wagon sizes
  wagonSizes: {
    'small': { name: '📦 Small Wagon', goods: 25, emoji: '📦' },
    'medium': { name: '📦📦 Medium Wagon', goods: 50, emoji: '🛒' },
    'large': { name: '📦📦📦 Large Wagon', goods: 100, emoji: '🚚' }
  },
  
  // Dupe method info
  dupeInfo: {
    name: 'Wagon Dupe Glitch',
    dupeCount: 11,
    timeEstimate: '15 minutes',
    payoutPerDupe: 250 // Per dupe for distant
  },
  
  // Session settings
  minPlayers: 2,
  maxPlayers: 4,
  sessionTimeout: 45 * 60 * 1000, // 45 minutes
  voiceChannelTimeout: 10 * 60 * 1000
};

// Active sessions storage
const activeSessions = new Map();
const userCooldowns = new Map();

// ============================================
// INITIALIZE LFG SYSTEM
// ============================================

function initialize(client) {
  console.log('[WAGON LFG] Initializing advanced Wagon LFG system...');
  
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      await handleButton(interaction, client);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, client);
    }
  });
  
  setInterval(() => checkSessionTimeouts(client), 60000);
  
  console.log('[WAGON LFG] ✅ Advanced Wagon LFG system initialized');
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
      return message.reply(`❌ You already have an active session! End it first with \`?endwagon\``);
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
    wagonSize: 'large', // Default to large
    isDupe: true, // Default to dupe method
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
  
  const setupEmbed = await createSetupEmbed(session, guild);
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
// EMBEDS
// ============================================

async function createSetupEmbed(session, guild) {
  const host = await guild.members.fetch(session.host).catch(() => null);
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - SETUP')
    .setDescription(`**Host:** ${host?.user.tag || 'Unknown'}\n**Platform:** ${session.platform}\n\n*Configure your wagon run below*`)
    .addFields(
      { name: '📍 Delivery Type', value: session.deliveryType ? WAGON_CONFIG.deliveryTypes[session.deliveryType].name : '❓ Not selected', inline: true },
      { name: '📦 Wagon Size', value: WAGON_CONFIG.wagonSizes[session.wagonSize].name, inline: true },
      { name: '🔄 Dupe Method', value: session.isDupe ? '✅ Yes (11 dupes)' : '❌ No (single delivery)', inline: true }
    )
    .setColor(0x8B4513)
    .setFooter({ text: 'Select your options, then click "Start Recruiting"' })
    .setTimestamp();
  
  if (session.deliveryType && session.isDupe) {
    const basePayoutPerDupe = session.deliveryType === 'distant' ? 250 : 200;
    const totalEstimate = basePayoutPerDupe * 11;
    embed.addFields({ name: '💰 Estimated Earnings', value: `~$${totalEstimate.toLocaleString()} per person (11 dupes)`, inline: false });
  }
  
  return embed;
}

async function createRecruitingEmbed(session, guild) {
  const host = await guild.members.fetch(session.host).catch(() => null);
  const elapsed = session.startedAt ? formatTime(Date.now() - session.startedAt) : '0:00';
  
  let playerList = '';
  for (let i = 0; i < WAGON_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const player = session.players[i];
      const isHost = player.userId === session.host;
      playerList += `${i + 1}. ${isHost ? '👑' : '🤠'} **${player.name}** ${isHost ? '(Host)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Empty Slot*\n`;
    }
  }
  
  const deliveryInfo = WAGON_CONFIG.deliveryTypes[session.deliveryType];
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  const embed = new EmbedBuilder()
    .setTitle(`🛒 WAGON ${session.isDupe ? 'DUPE ' : ''}RUN - RECRUITING`)
    .setDescription(`
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
${wagonInfo.emoji} **Wagon:** ${wagonInfo.name}
📍 **Delivery:** ${deliveryInfo.name}
🔄 **Method:** ${session.isDupe ? 'Dupe Glitch (11x)' : 'Single Delivery'}
🎮 **Platform:** ${session.platform} Only
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
    `)
    .addFields(
      { name: `🤠 Posse (${session.players.length}/${WAGON_CONFIG.maxPlayers})`, value: playerList, inline: false }
    )
    .setColor(session.players.length >= WAGON_CONFIG.minPlayers ? 0x00FF00 : 0xCD853F)
    .setFooter({ text: `Session ID: ${session.id.slice(-8)} • ⏱️ ${elapsed}` })
    .setTimestamp();
  
  if (session.voiceChannel) {
    embed.addFields({ name: '🔊 Voice Channel', value: `<#${session.voiceChannel}>`, inline: true });
  }
  
  if (session.dupesCompleted > 0 || session.deliveriesCompleted > 0) {
    embed.addFields(
      { name: '🔄 Dupes Done', value: `${session.dupesCompleted}`, inline: true },
      { name: '🚚 Deliveries', value: `${session.deliveriesCompleted}`, inline: true },
      { name: '💰 Total Earned', value: `$${session.totalEarnings.toLocaleString()}`, inline: true }
    );
  }
  
  return embed;
}

// ============================================
// COMPONENTS
// ============================================

function createSetupComponents(sessionId, session) {
  const deliverySelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_delivery_${sessionId}`)
    .setPlaceholder('📍 Select Delivery Type')
    .addOptions(
      Object.entries(WAGON_CONFIG.deliveryTypes).map(([key, value]) => ({
        label: value.name.replace(/[^\w\s]/g, '').trim(),
        description: `$${value.payout} | ${value.distance} distance | ${value.risk}`,
        value: key
      }))
    );
  
  const wagonSelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_size_${sessionId}`)
    .setPlaceholder('📦 Select Wagon Size')
    .addOptions(
      Object.entries(WAGON_CONFIG.wagonSizes).map(([key, value]) => ({
        label: value.name.replace(/[^\w\s]/g, '').trim(),
        description: `${value.goods} goods capacity`,
        value: key,
        emoji: value.emoji
      }))
    );
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_dupe_${sessionId}`)
      .setLabel(`Dupe: ${session.isDupe ? 'ON' : 'OFF'}`)
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

function createRecruitingComponents(sessionId, session) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_join_${sessionId}`)
      .setLabel(`Join Posse (${session.players.length}/${WAGON_CONFIG.maxPlayers})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji('🤠')
      .setDisabled(session.players.length >= WAGON_CONFIG.maxPlayers),
    new ButtonBuilder()
      .setCustomId(`wagon_leave_${sessionId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚪'),
    new ButtonBuilder()
      .setCustomId(`wagon_ready_${sessionId}`)
      .setLabel('Saddle Up!')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🐴')
      .setDisabled(session.players.length < WAGON_CONFIG.minPlayers)
  );
  
  const hostButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_dupe_complete_${sessionId}`)
      .setLabel('+1 Dupe')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔄')
      .setDisabled(!session.isDupe),
    new ButtonBuilder()
      .setCustomId(`wagon_delivery_complete_${sessionId}`)
      .setLabel('+1 Delivery')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚚'),
    new ButtonBuilder()
      .setCustomId(`wagon_voice_${sessionId}`)
      .setLabel('Create Voice')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔊')
      .setDisabled(session.voiceChannel !== null),
    new ButtonBuilder()
      .setCustomId(`wagon_end_${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🛑')
  );
  
  return [buttons, hostButtons];
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
  
  // Handle special case for dupe_complete and delivery_complete
  let actualAction = action;
  let actualSessionId = sessionId;
  
  if (action === 'dupe' && parts[2] === 'complete') {
    actualAction = 'dupe_complete';
    actualSessionId = parts.slice(3).join('_');
  } else if (action === 'delivery' && parts[2] === 'complete') {
    actualAction = 'delivery_complete';
    actualSessionId = parts.slice(3).join('_');
  }
  
  const session = activeSessions.get(actualSessionId);
  
  if (!session) {
    return interaction.reply({ content: '❌ Session not found or expired.', ephemeral: true });
  }
  
  try {
    switch (actualAction) {
      case 'dupe':
        await handleDupeToggle(interaction, session, actualSessionId);
        break;
      case 'start':
        await handleStartRecruiting(interaction, session, actualSessionId, client);
        break;
      case 'cancel':
        await handleCancelSession(interaction, session, actualSessionId, client);
        break;
      case 'join':
        await handleJoinSession(interaction, session, actualSessionId, client);
        break;
      case 'leave':
        await handleLeaveSession(interaction, session, actualSessionId, client);
        break;
      case 'ready':
        await handleReadyUp(interaction, session, actualSessionId, client);
        break;
      case 'dupe_complete':
        await handleDupeComplete(interaction, session, actualSessionId, client);
        break;
      case 'delivery_complete':
        await handleDeliveryComplete(interaction, session, actualSessionId, client);
        break;
      case 'voice':
        await handleCreateVoice(interaction, session, actualSessionId, client);
        break;
      case 'end':
        await handleEndSession(interaction, session, actualSessionId, client);
        break;
    }
  } catch (error) {
    console.error('[WAGON LFG] Button error:', error);
    interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
  }
}

async function handleDupeToggle(interaction, session, sessionId) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can change settings.', ephemeral: true });
  }
  
  session.isDupe = !session.isDupe;
  
  const embed = await createSetupEmbed(session, interaction.guild);
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
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const deliveryInfo = WAGON_CONFIG.deliveryTypes[session.deliveryType];
  await interaction.channel.send({
    content: `🛒 **WAGON RUN OPEN!** ${deliveryInfo.name} | ${session.isDupe ? 'Dupe Method' : 'Single Run'} | ${session.platform} | Click below to join!`,
    allowedMentions: { parse: [] }
  });
}

async function handleCancelSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can cancel.', ephemeral: true });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle('❌ Wagon Run Cancelled')
    .setDescription('The host cancelled this session.')
    .setColor(0xFF0000);
  
  await interaction.update({ embeds: [embed], components: [] });
}

async function handleJoinSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (session.players.find(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ You\'re already in this posse!', ephemeral: true });
  }
  
  // Platform check
  const member = await interaction.guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5') || r.name.includes('Primary: PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4') || r.name.includes('Primary: PS4'));
  const userPlatform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  if (session.platform !== 'Unknown' && userPlatform !== 'Unknown' && session.platform !== userPlatform) {
    return interaction.reply({ 
      content: `❌ Platform mismatch! This session is for **${session.platform}** players only.`, 
      ephemeral: true 
    });
  }
  
  if (session.players.length >= WAGON_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Posse is full!', ephemeral: true });
  }
  
  session.players.push({ userId: userId, name: interaction.user.username });
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `🤠 **${interaction.user.username}** joined the posse! (${session.players.length}/${WAGON_CONFIG.maxPlayers})`,
    allowedMentions: { parse: [] }
  });
}

async function handleLeaveSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (userId === session.host) {
    return interaction.reply({ content: '❌ You\'re the host! Use "End Session" to close.', ephemeral: true });
  }
  
  const playerIndex = session.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ You\'re not in this posse.', ephemeral: true });
  }
  
  session.players.splice(playerIndex, 1);
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleReadyUp(interaction, session, sessionId, client) {
  if (session.players.length < WAGON_CONFIG.minPlayers) {
    return interaction.reply({ content: `❌ Need at least ${WAGON_CONFIG.minPlayers} cowboys!`, ephemeral: true });
  }
  
  session.status = 'in_progress';
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  embed.setTitle('🛒 WAGON RUN - IN PROGRESS');
  embed.setColor(0x00FF00);
  
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  await interaction.channel.send({
    content: `🐴 **SADDLE UP!** ${mentions}\n\nTime to make some money, partner! 🤠`
  });
}

async function handleDupeComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can mark dupes complete.', ephemeral: true });
  }
  
  const payout = session.deliveryType === 'distant' ? 250 : 200;
  session.dupesCompleted++;
  session.totalEarnings += payout * session.players.length;
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  embed.setTitle('🛒 WAGON RUN - IN PROGRESS');
  embed.setColor(0x00FF00);
  
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `🔄 **DUPE #${session.dupesCompleted} COMPLETE!** +$${payout.toLocaleString()}/person | Total: $${session.totalEarnings.toLocaleString()}`,
    allowedMentions: { parse: [] }
  });
}

async function handleDeliveryComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can mark deliveries complete.', ephemeral: true });
  }
  
  const payout = WAGON_CONFIG.deliveryTypes[session.deliveryType].payout;
  session.deliveriesCompleted++;
  session.totalEarnings += payout * session.players.length;
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  embed.setTitle('🛒 WAGON RUN - IN PROGRESS');
  embed.setColor(0x00FF00);
  
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await recordCompletion(session, client);
  
  await interaction.channel.send({
    content: `🚚 **DELIVERY #${session.deliveriesCompleted} COMPLETE!** +$${payout.toLocaleString()}/person | Total: $${session.totalEarnings.toLocaleString()}`,
    allowedMentions: { parse: [] }
  });
}

async function handleCreateVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can create voice channels.', ephemeral: true });
  }
  
  try {
    const category = interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo'))
    );
    
    const voiceChannel = await interaction.guild.channels.create({
      name: `🛒 Wagon - ${session.hostName}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: WAGON_CONFIG.maxPlayers,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] },
        ...session.players.map(p => ({
          id: p.userId,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }))
      ]
    });
    
    session.voiceChannel = voiceChannel.id;
    
    const embed = await createRecruitingEmbed(session, interaction.guild);
    const components = createRecruitingComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    
    await interaction.channel.send({
      content: `🔊 Voice channel created! <#${voiceChannel.id}>`,
      allowedMentions: { parse: [] }
    });
    
  } catch (error) {
    console.error('[WAGON LFG] Voice channel error:', error);
    await interaction.reply({ content: '❌ Failed to create voice channel.', ephemeral: true });
  }
}

async function handleEndSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can end the session.', ephemeral: true });
  }
  
  session.status = 'completed';
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  userCooldowns.set(session.host, Date.now());
  
  const embed = new EmbedBuilder()
    .setTitle('✅ WAGON SESSION COMPLETE')
    .setDescription(`
**Host:** ${session.hostName}
**Dupes:** ${session.dupesCompleted} | **Deliveries:** ${session.deliveriesCompleted}
**Total Earnings:** $${session.totalEarnings.toLocaleString()}
**Posse:** ${session.players.map(p => p.name).join(', ')}
    `)
    .setColor(0x00FF00)
    .setFooter({ text: 'Thanks for using Cripps\' LFG system!' })
    .setTimestamp();
  
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// SELECT MENU HANDLER
// ============================================

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  
  if (!customId.startsWith('wagon_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return interaction.reply({ content: '❌ Session not found.', ephemeral: true });
  }
  
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the host can change settings.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  
  switch (type) {
    case 'delivery':
      session.deliveryType = value;
      break;
    case 'size':
      session.wagonSize = value;
      break;
  }
  
  const embed = await createSetupEmbed(session, interaction.guild);
  await interaction.update({ embeds: [embed] });
}

// ============================================
// UTILITIES
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
    }
  }
}

async function recordCompletion(session, client) {
  try {
    await client.db.query(
      `INSERT INTO wagon_completions (session_id, host_id, players, delivery_type, dupes, deliveries, earnings, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [session.id, session.host, JSON.stringify(session.players.map(p => p.userId)), session.deliveryType, session.dupesCompleted, session.deliveriesCompleted, session.totalEarnings]
    );
  } catch (e) {
    console.error('[WAGON LFG] Record error:', e);
  }
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

async function createTables(client) {
  try {
    await client.db.query(`
      CREATE TABLE IF NOT EXISTS wagon_completions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64),
        host_id VARCHAR(32),
        players JSONB,
        delivery_type VARCHAR(32),
        dupes INTEGER DEFAULT 0,
        deliveries INTEGER DEFAULT 0,
        earnings INTEGER DEFAULT 0,
        completed_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error('[WAGON LFG] Table error:', e);
  }
}

module.exports = { initialize, createSession, createTables, WAGON_CONFIG };
