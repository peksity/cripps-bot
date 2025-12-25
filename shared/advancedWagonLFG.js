/**
 * ADVANCED WAGON DELIVERY LFG SYSTEM v4
 * - EPHEMERAL SETUP (only host sees until recruiting)
 * - PSN username required
 * - Up to 6 players
 * - Kick + blacklist
 * - Role ping when recruiting starts
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

const WAGON_CONFIG = {
  deliveryTypes: {
    'local': { name: '📍 Local Delivery', payout: 500, description: 'Short distance, safe. No PvP risk.' },
    'distant': { name: '🗺️ Distant Delivery', payout: 625, description: 'Long distance, HIGH RISK! 25% more payout.' }
  },
  wagonSizes: {
    'small': { name: '📦 Small Wagon', goods: 25, payout: 250, description: '25 goods' },
    'medium': { name: '📦📦 Medium Wagon', goods: 50, payout: 500, description: '50 goods' },
    'large': { name: '🚚 Large Wagon', goods: 100, payout: 625, description: '100 goods - MAX' }
  },
  dupeInfo: { description: 'Duplicate wagon 11 times for massive profits!' },
  maxPlayers: 6,
  minPlayers: 2,
  sessionTimeout: 45 * 60 * 1000,
  roleName: 'Wagon Runner' // Role to ping
};

const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

function initialize(client) {
  console.log('[WAGON LFG] Initializing v4 (ephemeral setup)...');
  
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) await handleButton(interaction, client);
      if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction, client);
      if (interaction.isModalSubmit()) await handleModal(interaction, client);
    } catch (e) {
      console.error('[WAGON LFG] Error:', e);
    }
  });
  
  setInterval(() => checkTimeouts(client), 60000);
  console.log('[WAGON LFG] ✅ v4 initialized');
}

// ============================================
// CREATE SESSION - Ephemeral Setup
// ============================================

async function createSession(message, client) {
  const userId = message.author.id;
  
  // Check cooldown
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    const remaining = Math.ceil((3 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    const reply = await message.reply({ content: `⏳ Wait ${remaining}s before hosting another wagon.` });
    setTimeout(() => { message.delete().catch(() => {}); reply.delete().catch(() => {}); }, 5000);
    return;
  }
  
  // Check existing session
  for (const [, session] of activeSessions) {
    if (session.userId === userId) {
      const reply = await message.reply({ content: `❌ You already have an active session!` });
      setTimeout(() => { message.delete().catch(() => {}); reply.delete().catch(() => {}); }, 5000);
      return;
    }
  }
  
  // Delete the command message
  await message.delete().catch(() => {});
  
  // Get platform
  const member = await message.guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4'));
  const platform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  const sessionId = `wagon_${Date.now()}_${userId}`;
  
  const session = {
    id: sessionId,
    userId: userId,
    username: message.author.username,
    psnUsername: null,
    platform,
    players: [],
    deliveryType: null,
    wagonSize: 'large',
    isDupe: true,
    status: 'setup',
    voiceChannel: null,
    setupMessageId: null, // DM message for setup
    publicMessageId: null, // Public message when recruiting
    channelId: message.channel.id,
    guildId: message.guild.id,
    createdAt: Date.now(),
    totalEarnings: 0,
    dupesCompleted: 0,
    deliveriesCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  activeSessions.set(sessionId, session);
  
  // Send EPHEMERAL setup via DM
  try {
    const setupEmbed = new EmbedBuilder()
      .setTitle('🛒 WAGON DELIVERY - SETUP')
      .setDescription(
        `Setting up wagon run for **#${message.channel.name}**\n\n` +
        `Click below to enter your PSN and configure your run.\n` +
        `**Only you can see this until you start recruiting.**`
      )
      .setColor(0x8B4513)
      .setFooter({ text: 'Setup is private until you start recruiting' });
    
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
    
    const dm = await message.author.send({ embeds: [setupEmbed], components: [row] });
    session.setupMessageId = dm.id;
    
    // Confirm in channel (then delete)
    const confirm = await message.channel.send({ content: `<@${userId}> Check your DMs to set up your wagon! 📩` });
    setTimeout(() => confirm.delete().catch(() => {}), 5000);
    
  } catch (dmError) {
    // DMs disabled - use ephemeral-like approach in channel
    const setupEmbed = new EmbedBuilder()
      .setTitle('🛒 WAGON DELIVERY - SETUP')
      .setDescription(`**${message.author.username}** is setting up a wagon run...\nClick below to configure (host only).`)
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
    session.setupMessageId = msg.id;
    session.setupInChannel = true;
  }
  
  return session;
}

// ============================================
// MODAL HANDLER
// ============================================

async function handleModal(interaction, client) {
  const customId = interaction.customId;
  
  // Host PSN input (during setup)
  if (customId.startsWith('wagon_modal_')) {
    const sessionId = customId.replace('wagon_modal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.psnUsername = psn;
    session.players.push({ userId: session.userId, username: session.username, psn });
    
    // Update with setup options (still private)
    const embed = createSetupEmbed(session);
    const components = createSetupComponents(sessionId, session);
    await interaction.update({ embeds: [embed], components });
  }
  
  // Player joining
  if (customId.startsWith('wagon_joinmodal_')) {
    const sessionId = customId.replace('wagon_joinmodal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.players.push({ userId: interaction.user.id, username: interaction.user.username, psn });
    
    // Update PUBLIC message
    const channel = await client.channels.fetch(session.channelId);
    const msg = await channel.messages.fetch(session.publicMessageId);
    
    const embed = createRecruitingEmbed(session);
    const components = createRecruitingComponents(sessionId, session);
    await msg.edit({ embeds: [embed], components });
    
    await interaction.reply({ content: `✅ Joined! You're in slot ${session.players.length}.`, ephemeral: true });
    await channel.send({ content: `🤠 **${psn}** joined the wagon! (${session.players.length}/${WAGON_CONFIG.maxPlayers})` });
  }
}

// ============================================
// BUTTON HANDLER
// ============================================

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('wagon_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  // PSN Entry Modal
  if (action === 'enterpsn') {
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Only the host can do this.', ephemeral: true });
    
    const modal = new ModalBuilder()
      .setCustomId(`wagon_modal_${sessionId}`)
      .setTitle('Enter Your PSN Username');
    
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('psn_input')
        .setLabel('PSN Username')
        .setPlaceholder('Your PlayStation Network username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(16)
    ));
    
    return interaction.showModal(modal);
  }
  
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
  
  switch (action) {
    case 'dupe':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      session.isDupe = !session.isDupe;
      await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
      break;
      
    case 'start':
      await handleStartRecruiting(interaction, session, sessionId, client);
      break;
      
    case 'cancel':
      await handleCancel(interaction, session, sessionId, client);
      break;
      
    case 'join':
      await handleJoin(interaction, session, sessionId, client);
      break;
      
    case 'leave':
      await handleLeave(interaction, session, sessionId, client);
      break;
      
    case 'voice':
      await handleVoice(interaction, session, sessionId, client);
      break;
      
    case 'ready':
      await handleReady(interaction, session, sessionId, client);
      break;
      
    case 'complete':
      await handleComplete(interaction, session, sessionId, client);
      break;
      
    case 'end':
      await handleEnd(interaction, session, sessionId, client);
      break;
  }
}

// ============================================
// START RECRUITING - Goes Public + Pings Role
// ============================================

async function handleStartRecruiting(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  if (!session.deliveryType) return interaction.reply({ content: '❌ Select a delivery type first!', ephemeral: true });
  
  session.status = 'recruiting';
  
  // Delete/update the setup message
  await interaction.update({ 
    embeds: [new EmbedBuilder().setTitle('✅ Wagon Posted!').setDescription('Check the LFG channel.').setColor(0x00FF00)],
    components: [] 
  });
  
  // Get the LFG channel
  const channel = await client.channels.fetch(session.channelId);
  
  // Find the wagon role to ping
  const guild = await client.guilds.fetch(session.guildId);
  const wagonRole = guild.roles.cache.find(r => 
    r.name.toLowerCase().includes('wagon') || 
    r.name.toLowerCase().includes('frontier') ||
    r.name.toLowerCase().includes('trader')
  );
  
  // Create PUBLIC recruiting message
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  const publicMsg = await channel.send({ 
    content: wagonRole ? `${wagonRole} **WAGON RUN OPEN!**` : '🛒 **WAGON RUN OPEN!**',
    embeds: [embed], 
    components 
  });
  
  session.publicMessageId = publicMsg.id;
  
  // Announcement
  const deliveryInfo = WAGON_CONFIG.deliveryTypes[session.deliveryType];
  await channel.send({
    content: `🛒 **${session.psnUsername}** (${session.platform}) is running a **${deliveryInfo.name}** | ${session.isDupe ? '🔄 Dupe: ON' : 'Single'} | Click Join!`
  });
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
  if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
  
  // Kick handler (public)
  if (type === 'kick') {
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    const kickId = interaction.values[0];
    const idx = session.players.findIndex(p => p.userId === kickId);
    if (idx === -1) return;
    const kicked = session.players.splice(idx, 1)[0];
    kickedUsers.get(sessionId)?.add(kickId);
    
    try { 
      const u = await client.users.fetch(kickId); 
      await u.send({ embeds: [new EmbedBuilder().setTitle('❌ Removed from Wagon').setDescription(`You were removed from ${session.psnUsername}'s wagon.`).setColor(0xFF0000)] }); 
    } catch (e) {}
    
    const channel = await client.channels.fetch(session.channelId);
    const msg = await channel.messages.fetch(session.publicMessageId);
    await msg.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    await interaction.reply({ content: `👢 Kicked **${kicked.psn}**`, ephemeral: true });
    await channel.send({ content: `👢 **${kicked.psn}** was removed from the wagon.` });
    return;
  }
  
  // Settings (host only, during setup)
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  const value = interaction.values[0];
  if (type === 'delivery') session.deliveryType = value;
  else if (type === 'size') session.wagonSize = value;
  
  await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
}

// ============================================
// EMBEDS
// ============================================

function createSetupEmbed(session) {
  const deliveryInfo = session.deliveryType ? WAGON_CONFIG.deliveryTypes[session.deliveryType] : null;
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  
  return new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - SETUP')
    .setDescription(`**Host:** ${session.username}\n**PSN:** ${session.psnUsername}\n**Platform:** ${session.platform}`)
    .addFields(
      { name: '📍 Delivery', value: deliveryInfo ? `✅ **${deliveryInfo.name}**\n${deliveryInfo.description}` : '❓ Not selected', inline: false },
      { name: '📦 Wagon', value: `✅ **${wagonInfo.name}**\n${wagonInfo.description}`, inline: false },
      { name: '🔄 Dupe', value: session.isDupe ? '✅ **ON** (11 dupes)' : '❌ OFF', inline: false }
    )
    .setColor(0x8B4513)
    .setFooter({ text: '🔒 Only you can see this. Click Start Recruiting to post publicly.' })
    .setTimestamp();
}

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
      playerList += `${i + 1}. ⬜ *Open*\n`;
    }
  }
  
  let potential = wagonInfo.payout;
  if (session.deliveryType === 'distant') potential = Math.floor(potential * 1.25);
  if (session.isDupe) potential *= 11;
  
  return new EmbedBuilder()
    .setTitle('🛒 WAGON DELIVERY - RECRUITING')
    .setDescription(`**Host:** ${session.psnUsername} (${session.platform})\n**${deliveryInfo.name}** | **${wagonInfo.name}** | ${session.isDupe ? '🔄 Dupe ON' : 'Single'}`)
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Info', value: `Slots: **${session.players.length}/${WAGON_CONFIG.maxPlayers}**\nPotential: **$${potential.toLocaleString()}**`, inline: true }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0xFFD700)
    .setTimestamp();
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
      { label: 'Distant Delivery', description: 'Risky, $625 base', value: 'distant', emoji: '🗺️', default: session.deliveryType === 'distant' }
    ]);
  
  const wagonSelect = new StringSelectMenuBuilder()
    .setCustomId(`wagon_size_${sessionId}`)
    .setPlaceholder(`✅ ${WAGON_CONFIG.wagonSizes[session.wagonSize].name}`)
    .addOptions([
      { label: 'Small Wagon', description: '25 goods', value: 'small', emoji: '📦', default: session.wagonSize === 'small' },
      { label: 'Medium Wagon', description: '50 goods', value: 'medium', emoji: '🛒', default: session.wagonSize === 'medium' },
      { label: 'Large Wagon', description: '100 goods', value: 'large', emoji: '🚚', default: session.wagonSize === 'large' }
    ]);
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wagon_dupe_${sessionId}`).setLabel(session.isDupe ? 'Dupe: ON' : 'Dupe: OFF').setStyle(session.isDupe ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId(`wagon_start_${sessionId}`).setLabel('Start Recruiting').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`wagon_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
  
  return [
    new ActionRowBuilder().addComponents(deliverySelect),
    new ActionRowBuilder().addComponents(wagonSelect),
    buttons
  ];
}

function createRecruitingComponents(sessionId, session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wagon_join_${sessionId}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('🤠'),
    new ButtonBuilder().setCustomId(`wagon_leave_${sessionId}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`wagon_voice_${sessionId}`).setLabel('Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wagon_ready_${sessionId}`).setLabel('Start Run').setStyle(ButtonStyle.Success).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`wagon_complete_${sessionId}`).setLabel('Done').setStyle(ButtonStyle.Primary).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`wagon_end_${sessionId}`).setLabel('End').setStyle(ButtonStyle.Danger).setEmoji('🛑')
  );
  
  const components = [row1, row2];
  
  // Kick dropdown
  if (session.players.length > 1) {
    const kickOptions = session.players.filter(p => p.userId !== session.userId).map(p => ({ label: `Kick ${p.psn}`, value: p.userId, emoji: '👢' }));
    if (kickOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`wagon_kick_${sessionId}`).setPlaceholder('👢 Kick player').addOptions(kickOptions)
      ));
    }
  }
  
  return components;
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleJoin(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (kickedUsers.get(sessionId)?.has(userId)) {
    return interaction.reply({ content: '❌ You were removed from this session.', ephemeral: true });
  }
  if (session.players.some(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ Already joined!', ephemeral: true });
  }
  if (session.players.length >= WAGON_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Session full!', ephemeral: true });
  }
  
  // Show PSN modal
  const modal = new ModalBuilder().setCustomId(`wagon_joinmodal_${sessionId}`).setTitle('Enter Your PSN');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function handleLeave(interaction, session, sessionId, client) {
  if (interaction.user.id === session.userId) {
    return interaction.reply({ content: '❌ Host must use End.', ephemeral: true });
  }
  const idx = session.players.findIndex(p => p.userId === interaction.user.id);
  if (idx === -1) return interaction.reply({ content: '❌ Not in session.', ephemeral: true });
  
  const left = session.players.splice(idx, 1)[0];
  
  const channel = await client.channels.fetch(session.channelId);
  const msg = await channel.messages.fetch(session.publicMessageId);
  await msg.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
  
  await interaction.reply({ content: '👋 You left the wagon.', ephemeral: true });
}

async function handleVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  if (session.voiceChannel) return interaction.reply({ content: `🔊 <#${session.voiceChannel}>`, ephemeral: true });
  
  const guild = await client.guilds.fetch(session.guildId);
  const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('rdo'));
  
  const vc = await guild.channels.create({
    name: `🛒 ${session.psnUsername}`,
    type: ChannelType.GuildVoice,
    parent: cat?.id,
    userLimit: WAGON_CONFIG.maxPlayers
  });
  
  session.voiceChannel = vc.id;
  await interaction.reply({ content: `🔊 Voice: <#${vc.id}>`, ephemeral: false });
}

async function handleReady(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  if (session.players.length < WAGON_CONFIG.minPlayers) return interaction.reply({ content: `❌ Need ${WAGON_CONFIG.minPlayers}+ players!`, ephemeral: true });
  
  session.status = 'in_progress';
  
  const channel = await client.channels.fetch(session.channelId);
  const msg = await channel.messages.fetch(session.publicMessageId);
  await msg.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  await channel.send({ content: `🚀 **WAGON STARTING!** ${mentions}` });
  await interaction.reply({ content: '✅ Started!', ephemeral: true });
}

async function handleComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  const wagonInfo = WAGON_CONFIG.wagonSizes[session.wagonSize];
  let payout = wagonInfo.payout;
  if (session.deliveryType === 'distant') payout = Math.floor(payout * 1.25);
  
  if (session.isDupe) session.dupesCompleted++;
  else session.deliveriesCompleted++;
  session.totalEarnings += payout;
  
  const channel = await client.channels.fetch(session.channelId);
  const msg = await channel.messages.fetch(session.publicMessageId);
  await msg.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
  
  await channel.send({ content: `💰 **${session.isDupe ? 'DUPE' : 'DELIVERY'} #${session.dupesCompleted + session.deliveriesCompleted}!** +$${payout.toLocaleString()}` });
  await interaction.reply({ content: '✅ Logged!', ephemeral: true });
}

async function handleCancel(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  await cleanup(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelled').setColor(0xFF0000)], components: [] });
}

async function handleEnd(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  userCooldowns.set(session.userId, Date.now());
  
  // DM all players
  for (const p of session.players.filter(x => x.userId !== session.userId)) {
    try {
      const u = await client.users.fetch(p.userId);
      await u.send({ embeds: [new EmbedBuilder().setTitle('🛒 Wagon Ended').setDescription(`${session.psnUsername}'s wagon ended.\nTotal: $${session.totalEarnings.toLocaleString()}`).setColor(0x00FF00)] });
    } catch (e) {}
  }
  
  // Announce
  const channel = await client.channels.fetch(session.channelId);
  if (session.players.length > 1) {
    const mentions = session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ');
    await channel.send({ content: `🛒 **WAGON ENDED** | ${mentions} | Total: $${session.totalEarnings.toLocaleString()}` });
  }
  
  await cleanup(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  // Update public message
  const msg = await channel.messages.fetch(session.publicMessageId).catch(() => null);
  if (msg) {
    await msg.edit({ 
      embeds: [new EmbedBuilder()
        .setTitle('🛒 Wagon Complete!')
        .setDescription(`**Host:** ${session.psnUsername}\n**Total:** $${session.totalEarnings.toLocaleString()}\n**Crew:** ${session.players.map(p => p.psn).join(', ')}`)
        .setColor(0x00FF00)],
      components: []
    });
  }
  
  await interaction.reply({ content: '✅ Session ended!', ephemeral: true });
}

async function cleanup(session, client) {
  if (session.voiceChannel) {
    try { const ch = await client.channels.fetch(session.voiceChannel); if (ch) await ch.delete(); } catch (e) {}
  }
}

function checkTimeouts(client) {
  for (const [id, s] of activeSessions) {
    if (Date.now() - s.createdAt > WAGON_CONFIG.sessionTimeout) {
      cleanup(s, client);
      activeSessions.delete(id);
      kickedUsers.delete(id);
    }
  }
}

async function createTables() { console.log('[WAGON] In-memory'); }

module.exports = { initialize, createSession, createTables };
