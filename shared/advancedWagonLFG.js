/**
 * ADVANCED WAGON DELIVERY LFG SYSTEM v3
 * - Username/PSN input required
 * - Up to 6 players (1 host + 5 crew)
 * - Host can kick players (blacklisted for session)
 * - DM notifications on end/cancel
 * - Selection shows what was picked
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

// ============================================
// WAGON CONFIGURATION
// ============================================

const WAGON_CONFIG = {
  deliveryTypes: {
    'local': { 
      name: '📍 Local Delivery', 
      payout: 500, 
      description: 'Short distance, safe delivery. No PvP risk.'
    },
    'distant': { 
      name: '🗺️ Distant Delivery', 
      payout: 625, 
      description: 'Long distance, HIGH RISK! Other players can attack. 25% more payout.'
    }
  },
  
  wagonSizes: {
    'small': { name: '📦 Small Wagon', goods: 25, payout: 250, description: '25 goods. Quick fill.' },
    'medium': { name: '📦📦 Medium Wagon', goods: 50, payout: 500, description: '50 goods. Balanced.' },
    'large': { name: '🚚 Large Wagon', goods: 100, payout: 625, description: '100 goods. Max payout!' }
  },
  
  dupeInfo: {
    description: 'Duplicate your wagon 11 times for massive profits!'
  },
  
  maxPlayers: 6,
  minPlayers: 2,
  sessionTimeout: 45 * 60 * 1000
};

const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

// ============================================
// INITIALIZE
// ============================================

function initialize(client) {
  console.log('[WAGON LFG] Initializing v3...');
  
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) await handleButton(interaction, client);
      if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction, client);
      if (interaction.isModalSubmit()) await handleModal(interaction, client);
    } catch (e) {
      console.error('[WAGON LFG] Interaction error:', e);
    }
  });
  
  setInterval(() => checkSessionTimeouts(client), 60000);
  console.log('[WAGON LFG] ✅ v3 initialized');
}

// ============================================
// CREATE SESSION - Shows Modal for Username
// ============================================

async function createSession(message, client) {
  const userId = message.author.id;
  
  // Check cooldown
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    const remaining = Math.ceil((3 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    return message.reply(`⏳ Wait ${remaining} seconds before hosting another wagon.`);
  }
  
  // Check existing session
  for (const [, session] of activeSessions) {
    if (session.userId === userId) {
      return message.reply(`❌ You already have an active session!`);
    }
  }
  
  // Get platform
  const member = await message.guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4'));
  const platform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  const sessionId = `wagon_${Date.now()}_${userId}`;
  
  const session = {
    id: sessionId,
    userId: userId,
    userIdName: message.author.username,
    psnUsername: null, // Will be set
    platform,
    players: [],
    deliveryType: null,
    wagonSize: 'large',
    isDupe: true,
    status: 'setup',
    voiceChannel: null,
    messageId: null,
    channelId: message.channel.id,
    guildId: message.guild.id,
    createdAt: Date.now(),
    totalEarnings: 0,
    dupesCompleted: 0,
    deliveriesCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  activeSessions.set(sessionId, session);
  
  // Show modal for username input
  // Since we can't show modal from message, we'll use a button first
  const setupEmbed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - ENTER PSN')
    .setDescription(`**Host:** ${session.userIdName}\n**Platform:** ${platform}\n\nClick the button below to enter your PSN username and start setup.`)
    .setColor(0x8B4513);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wagon_enterpsn_${sessionId}`)
      .setLabel('Enter PSN Username')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎮'),
    new ButtonBuilder()
      .setCustomId(`wagon_cancel_${sessionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );
  
  const msg = await message.channel.send({ embeds: [setupEmbed], components: [row] });
  session.messageId = msg.id;
  
  return session;
}

// ============================================
// HANDLE MODAL (Username Input)
// ============================================

async function handleModal(interaction, client) {
  const customId = interaction.customId;
  
  // Host PSN input
  if (customId.startsWith('wagon_modal_')) {
    const sessionId = customId.replace('wagon_modal_', '');
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }
    
    const psnUsername = interaction.fields.getTextInputValue('psn_input');
    session.psnUsername = psnUsername;
    session.players.push({ userId: session.userId, username: session.username, psn: psnUsername });
    
    // Now show the setup embed with dropdowns
    const embed = createSetupEmbed(session);
    const components = createSetupComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    return;
  }
  
  // Player join PSN input
  if (customId.startsWith('wagon_joinmodal_')) {
    const sessionId = customId.replace('wagon_joinmodal_', '');
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.players.push({ userId: interaction.user.id, username: interaction.user.username, psn });
    
    const embed = createRecruitingEmbed(session);
    const components = createRecruitingComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    await interaction.channel.send({ content: `🤠 **${psn}** joined the wagon! (${session.players.length}/${WAGON_CONFIG.maxPlayers})` });
    return;
  }
}

// ============================================
// SETUP EMBED
// ============================================

function createSetupEmbed(session) {
  const deliveryInfo = session.deliveryType ? WAGON_CONFIG.deliveryTypes[session.deliveryType] : null;
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - SETUP')
    .setDescription(
      `**Host:** ${session.userIdName}\n` +
      `**PSN:** ${session.psnUsername || 'Not set'}\n` +
      `**Platform:** ${session.platform}\n\n` +
      `*Configure your wagon run below*`
    )
    .addFields(
      { 
        name: '📍 Delivery Type', 
        value: deliveryInfo 
          ? `✅ **${deliveryInfo.name}**\n${deliveryInfo.description}` 
          : '❓ **Not selected** - Choose from dropdown', 
        inline: false 
      },
      { 
        name: '📦 Wagon Size', 
        value: `✅ **${wagonInfo.name}**\n${wagonInfo.description}`, 
        inline: false 
      },
      { 
        name: '🔄 Dupe Method', 
        value: session.isDupe 
          ? `✅ **ON** (11 dupes)\n${WAGON_CONFIG.dupeInfo.description}` 
          : '❌ **OFF** (single delivery)', 
        inline: false 
      }
    )
    .setColor(0x8B4513)
    .setFooter({ text: 'Select options, then click "Start Recruiting"' })
    .setTimestamp();
  
  return embed;
}

// ============================================
// RECRUITING EMBED
// ============================================

function createRecruitingEmbed(session) {
  const deliveryInfo = WAGON_CONFIG.deliveryTypes[session.deliveryType];
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  let playerList = '';
  for (let i = 0; i < WAGON_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const p = session.players[i];
      const isHost = p.userId === session.userId;
      playerList += `${i + 1}. ${isHost ? '👑' : '🤠'} **${p.psn}** ${isHost ? '(Host)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open Slot*\n`;
    }
  }
  
  let potential = wagonInfo.payout;
  if (session.deliveryType === 'distant') potential = Math.floor(potential * 1.25);
  if (session.isDupe) potential *= 11;
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - RECRUITING')
    .setDescription(
      `**Host:** ${session.psnUsername} (${session.platform})\n\n` +
      `**${deliveryInfo.name}** • **${wagonInfo.name}** • ${session.isDupe ? '**Dupe: ON**' : 'Single'}`
    )
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Info', value: 
        `Slots: **${session.players.length}/${WAGON_CONFIG.maxPlayers}**\n` +
        `Potential: **$${potential.toLocaleString()}**\n` +
        `Status: ${session.status === 'in_progress' ? '🟢 **IN PROGRESS**' : '🟡 **RECRUITING**'}`,
        inline: true 
      }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0xFFD700)
    .setFooter({ text: `Click Join to hop on! | Session: ${session.id.slice(-8)}` })
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
// COMPONENTS
// ============================================

function createSetupComponents(sessionId, session) {
  const deliverySelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_delivery_${sessionId}`)
    .setPlaceholder(session.deliveryType ? `✅ ${WAGON_CONFIG.deliveryTypes[session.deliveryType].name}` : '📍 Select Delivery Type')
    .addOptions([
      { label: 'Local Delivery', description: 'Safe, $500 base', value: 'local', emoji: '📍', default: session.deliveryType === 'local' },
      { label: 'Distant Delivery', description: 'Risky PvP, $625 base', value: 'distant', emoji: '🗺️', default: session.deliveryType === 'distant' }
    ]);
  
  const wagonSelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_size_${sessionId}`)
    .setPlaceholder(`✅ ${WAGON_CONFIG.wagonSizes[session.wagonSize].name}`)
    .addOptions([
      { label: 'Small Wagon', description: '25 goods', value: 'small', emoji: '📦', default: session.wagonSize === 'small' },
      { label: 'Medium Wagon', description: '50 goods', value: 'medium', emoji: '🛒', default: session.wagonSize === 'medium' },
      { label: 'Large Wagon', description: '100 goods - MAX', value: 'large', emoji: '🚚', default: session.wagonSize === 'large' }
    ]);
  
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
  );
  
  return [
    new ActionRowBuilder().addComponents(deliverySelect),
    new ActionRowBuilder().addComponents(wagonSelect),
    buttons
  ];
}

function createRecruitingComponents(sessionId, session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wagon_join_${sessionId}`).setLabel('Join Posse').setStyle(ButtonStyle.Success).setEmoji('🤠'),
    new ButtonBuilder().setCustomId(`wagon_leave_${sessionId}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`wagon_voice_${sessionId}`).setLabel('Create Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wagon_ready_${sessionId}`).setLabel('Start Run').setStyle(ButtonStyle.Success).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`wagon_complete_${sessionId}`).setLabel('Complete').setStyle(ButtonStyle.Primary).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`wagon_end_${sessionId}`).setLabel('End Session').setStyle(ButtonStyle.Danger).setEmoji('🛑')
  );
  
  const components = [row1, row2];
  
  // Kick dropdown if more than host
  if (session.players.length > 1) {
    const kickOptions = session.players
      .filter(p => p.userId !== session.userId)
      .map(p => ({ label: `Kick ${p.psn}`, value: p.userId, emoji: '👢' }));
    
    if (kickOptions.length > 0) {
      const kickSelect = new StringSelectMenuBuilder()
        .setCustomId(`wagon_kick_${sessionId}`)
        .setPlaceholder('👢 Kick a player (Host only)')
        .addOptions(kickOptions);
      components.push(new ActionRowBuilder().addComponents(kickSelect));
    }
  }
  
  return components;
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
  
  // Handle PSN input button
  if (action === 'enterpsn') {
    const modal = new ModalBuilder()
      .setCustomId(`wagon_modal_${sessionId}`)
      .setTitle('Enter Your PSN Username');
    
    const psnInput = new TextInputBuilder()
      .setCustomId('psn_input')
      .setLabel('PSN Username')
      .setPlaceholder('Your PlayStation Network username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(16);
    
    modal.addComponents(new ActionRowBuilder().addComponents(psnInput));
    return interaction.showModal(modal);
  }
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
  }
  
  switch (action) {
    case 'dupe': await handleDupe(interaction, session, sessionId); break;
    case 'start': await handleStart(interaction, session, sessionId, client); break;
    case 'cancel': await handleCancel(interaction, session, sessionId, client); break;
    case 'join': await handleJoin(interaction, session, sessionId, client); break;
    case 'leave': await handleLeave(interaction, session, sessionId, client); break;
    case 'voice': await handleVoice(interaction, session, sessionId, client); break;
    case 'ready': await handleReady(interaction, session, sessionId, client); break;
    case 'complete': await handleComplete(interaction, session, sessionId, client); break;
    case 'end': await handleEnd(interaction, session, sessionId, client); break;
  }
}

// ============================================
// SELECT MENU HANDLERS
// ============================================

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('wagon_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
  }
  
  if (type === 'kick') {
    return handleKick(interaction, session, sessionId, client);
  }
  
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only the host can change settings.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  
  if (type === 'delivery') session.deliveryType = value;
  else if (type === 'size') session.wagonSize = value;
  
  const embed = createSetupEmbed(session);
  const components = createSetupComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleDupe(interaction, session, sessionId) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can change this.', ephemeral: true });
  }
  session.isDupe = !session.isDupe;
  const embed = createSetupEmbed(session);
  const components = createSetupComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
}

async function handleStart(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can start.', ephemeral: true });
  }
  if (!session.deliveryType) {
    return interaction.reply({ content: '❌ Select a delivery type first!', ephemeral: true });
  }
  
  session.status = 'recruiting';
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `🛒 **WAGON RUN OPEN!** ${session.platform} | ${WAGON_CONFIG.deliveryTypes[session.deliveryType].name} | ${session.isDupe ? '11 Dupes' : 'Single'} | Click Join!`
  });
}

async function handleJoin(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  // Check if kicked
  const kicked = kickedUsers.get(sessionId);
  if (kicked?.has(userId)) {
    return interaction.reply({ 
      content: '❌ You were removed from this session. Wait for the next `?wagon`.', 
      ephemeral: true 
    });
  }
  
  if (session.players.some(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ Already in session!', ephemeral: true });
  }
  
  if (session.players.length >= WAGON_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Session full!', ephemeral: true });
  }
  
  // Check role
  const member = interaction.member;
  const hasRole = member.roles.cache.some(r => 
    r.name.includes('Wagon') || r.name.includes('Frontier') || r.name.includes('RDO')
  );
  
  if (!hasRole) {
    try {
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setTitle('🛒 Role Required')
          .setDescription('You need a **Wagon Runner** or **Frontier Outlaw** role to join wagon runs.')
          .setColor(0xFF6B6B)]
      });
    } catch (e) {}
    return interaction.reply({ content: '❌ You need the proper role! Check DMs.', ephemeral: true });
  }
  
  // Show modal for PSN
  const modal = new ModalBuilder()
    .setCustomId(`wagon_joinmodal_${sessionId}`)
    .setTitle('Enter Your PSN Username');
  
  const psnInput = new TextInputBuilder()
    .setCustomId('psn_input')
    .setLabel('PSN Username')
    .setPlaceholder('Your PlayStation Network username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  
  modal.addComponents(new ActionRowBuilder().addComponents(psnInput));
  
  // Store pending join
  session.pendingJoin = userId;
  
  return interaction.showModal(modal);
}

async function handleLeave(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (userId === session.userId) {
    return interaction.reply({ content: '❌ Host must use End Session.', ephemeral: true });
  }
  
  const idx = session.players.findIndex(p => p.userId === userId);
  if (idx === -1) {
    return interaction.reply({ content: '❌ You\'re not in this session.', ephemeral: true });
  }
  
  session.players.splice(idx, 1);
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
}

async function handleKick(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can kick.', ephemeral: true });
  }
  
  const kickId = interaction.values[0];
  const idx = session.players.findIndex(p => p.userId === kickId);
  if (idx === -1) return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  
  const kickedPlayer = session.players[idx];
  session.players.splice(idx, 1);
  
  // Blacklist
  kickedUsers.get(sessionId)?.add(kickId);
  
  // DM kicked player
  try {
    const kickedUser = await client.users.fetch(kickId);
    await kickedUser.send({
      embeds: [new EmbedBuilder()
        .setTitle('🛒 Removed from Wagon Run')
        .setDescription(`You were removed from **${session.psnUsername}**'s wagon. You cannot rejoin this session.`)
        .setColor(0xFF0000)]
    });
  } catch (e) {}
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({ content: `👢 **${kickedPlayer.psn}** was removed from the wagon.` });
}

async function handleVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can create voice.', ephemeral: true });
  }
  
  if (session.voiceChannel) {
    return interaction.reply({ content: `🔊 Voice exists: <#${session.voiceChannel}>`, ephemeral: true });
  }
  
  try {
    const category = interaction.guild.channels.cache.find(c => 
      c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('rdo')
    );
    
    const vc = await interaction.guild.channels.create({
      name: `🛒 Wagon - ${session.psnUsername}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: WAGON_CONFIG.maxPlayers
    });
    
    session.voiceChannel = vc.id;
    await interaction.reply({ content: `🔊 Voice created: <#${vc.id}>`, ephemeral: false });
  } catch (e) {
    await interaction.reply({ content: '❌ Failed to create voice.', ephemeral: true });
  }
}

async function handleReady(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can start.', ephemeral: true });
  }
  
  if (session.players.length < WAGON_CONFIG.minPlayers) {
    return interaction.reply({ content: `❌ Need at least ${WAGON_CONFIG.minPlayers} players!`, ephemeral: true });
  }
  
  session.status = 'in_progress';
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  await interaction.channel.send({ content: `🚀 **WAGON RUN STARTING!** ${mentions}\n\nGood luck, partners! 🤠` });
}

async function handleComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can mark complete.', ephemeral: true });
  }
  
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  let payout = wagonInfo.payout;
  if (session.deliveryType === 'distant') payout = Math.floor(payout * 1.25);
  
  if (session.isDupe) session.dupesCompleted++;
  else session.deliveriesCompleted++;
  session.totalEarnings += payout;
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `💰 **${session.isDupe ? 'DUPE' : 'DELIVERY'} #${session.dupesCompleted + session.deliveriesCompleted} COMPLETE!** +$${payout.toLocaleString()} | Total: $${session.totalEarnings.toLocaleString()}`
  });
}

async function handleCancel(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can cancel.', ephemeral: true });
  }
  
  // DM all players
  for (const p of session.players) {
    if (p.userId !== session.userId) {
      try {
        const user = await client.users.fetch(p.userId);
        await user.send({
          embeds: [new EmbedBuilder()
            .setTitle('🛒 Wagon Run Cancelled')
            .setDescription(`**${session.psnUsername}** cancelled the wagon run.`)
            .setColor(0xFF0000)]
        });
      } catch (e) {}
    }
  }
  
  // Announce in channel
  if (session.players.length > 1) {
    const mentions = session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ');
    await interaction.channel.send({ content: `❌ **WAGON CANCELLED** | ${mentions} - The host ended the session.` });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setTitle('❌ Wagon Run Cancelled')
      .setDescription(`**${session.psnUsername}** cancelled the wagon run.`)
      .setColor(0xFF0000)],
    components: []
  });
}

async function handleEnd(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: '❌ Only host can end.', ephemeral: true });
  }
  
  userCooldowns.set(session.userId, Date.now());
  
  // DM all players
  for (const p of session.players) {
    if (p.userId !== session.userId) {
      try {
        const user = await client.users.fetch(p.userId);
        await user.send({
          embeds: [new EmbedBuilder()
            .setTitle('🛒 Wagon Run Ended')
            .setDescription(`**${session.psnUsername}**'s wagon run has ended!\n\n**Total Earnings:** $${session.totalEarnings.toLocaleString()}\n**Dupes:** ${session.dupesCompleted}`)
            .setColor(0x00FF00)]
        });
      } catch (e) {}
    }
  }
  
  // Announce in channel
  if (session.players.length > 1) {
    const mentions = session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ');
    await interaction.channel.send({ content: `🛒 **WAGON RUN ENDED** | ${mentions} - Session complete! Total: $${session.totalEarnings.toLocaleString()}` });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 Wagon Run Complete!')
    .setDescription(`**Host:** ${session.psnUsername}`)
    .addFields(
      { name: '💰 Total', value: `$${session.totalEarnings.toLocaleString()}`, inline: true },
      { name: '🔄 Dupes', value: `${session.dupesCompleted}`, inline: true },
      { name: '📦 Deliveries', value: `${session.deliveriesCompleted}`, inline: true },
      { name: '👥 Crew', value: session.players.map(p => p.psn).join(', ') || 'Solo', inline: false }
    )
    .setColor(0x00FF00)
    .setTimestamp();
  
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// UTILITY
// ============================================

async function cleanupSession(session, client) {
  if (session.voiceChannel) {
    try {
      const ch = await client.channels.fetch(session.voiceChannel);
      if (ch) await ch.delete();
    } catch (e) {}
  }
}

function checkSessionTimeouts(client) {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (now - session.createdAt > WAGON_CONFIG.sessionTimeout) {
      cleanupSession(session, client);
      activeSessions.delete(id);
      kickedUsers.delete(id);
    }
  }
}

async function createTables() {
  console.log('[WAGON LFG] In-memory storage');
}

module.exports = { initialize, createSession, createTables };
