/**
 * ██╗    ██╗ █████╗  ██████╗  ██████╗ ███╗   ██╗    ██╗     ███████╗ ██████╗ 
 * ██║    ██║██╔══██╗██╔════╝ ██╔═══██╗████╗  ██║    ██║     ██╔════╝██╔════╝ 
 * ██║ █╗ ██║███████║██║  ███╗██║   ██║██╔██╗ ██║    ██║     █████╗  ██║  ███╗
 * ██║███╗██║██╔══██║██║   ██║██║   ██║██║╚██╗██║    ██║     ██╔══╝  ██║   ██║
 * ╚███╔███╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║    ███████╗██║     ╚██████╔╝
 *  ╚══╝╚══╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝      ╚═════╝ 
 * 
 * ADVANCED WAGON DELIVERY LFG - OUTLAW EDITION
 * 
 * Features:
 * - Western luxury theme with modern touches
 * - Blacklist system integration
 * - Delivery route display
 * - Earnings calculator
 * - Session analytics
 * - Voice channel auto-creation
 * - Ephemeral setup (private until recruiting)
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

// ═══════════════════════════════════════════════════════════════════
// OUTLAW COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════
const COLORS = {
  gold: 0xFFD700,
  leather: 0x8B4513,
  rust: 0xB7410E,
  cream: 0xFFFDD0,
  forest: 0x228B22,
  blood: 0x8B0000,
  sunset: 0xFF6B35,
  success: 0x00FF88,
  danger: 0xFF3366
};

// ═══════════════════════════════════════════════════════════════════
// SESSION STORAGE
// ═══════════════════════════════════════════════════════════════════
const activeSessions = new Map();
const setupSessions = new Map();

// ═══════════════════════════════════════════════════════════════════
// WAGON DATA
// ═══════════════════════════════════════════════════════════════════
const DELIVERY_TYPES = {
  local: { 
    name: 'Local Delivery', 
    emoji: '📦', 
    payout: '$500', 
    risk: 'LOW',
    description: 'Short route, minimal danger'
  },
  long: { 
    name: 'Long Distance', 
    emoji: '🛤️', 
    payout: '$625', 
    risk: 'HIGH',
    description: 'Longer route, rival attacks possible'
  }
};

const WAGON_SIZES = {
  small: { name: 'Small Wagon', capacity: '25 goods', emoji: '🛒' },
  medium: { name: 'Medium Wagon', capacity: '50 goods', emoji: '🚃' },
  large: { name: 'Large Wagon', capacity: '100 goods', emoji: '🚂' }
};

const PLATFORMS = {
  ps5: { name: 'PlayStation 5', short: 'PS5' },
  ps4: { name: 'PlayStation 4', short: 'PS4' },
  crossgen: { name: 'Cross-Gen', short: 'CROSS' }
};

// ═══════════════════════════════════════════════════════════════════
// DATABASE & BLACKLIST
// ═══════════════════════════════════════════════════════════════════
let pool = null;
let blacklistSystem = null;

function initialize(client, dbPool) {
  pool = dbPool;
  
  try {
    const { getBlacklistSystem } = require('./blacklistSystem');
    blacklistSystem = getBlacklistSystem(pool);
    blacklistSystem.initialize();
  } catch (e) {
    console.log('[WAGON] Blacklist not found');
  }
  
  client.on('interactionCreate', handleInteraction);
  console.log('[WAGON LFG] ✅ Outlaw Edition initialized');
}

// ═══════════════════════════════════════════════════════════════════
// CREATE SESSION
// ═══════════════════════════════════════════════════════════════════
async function createSession(message, client) {
  const userId = message.author.id;
  
  if (activeSessions.has(userId)) {
    return message.reply({ content: '❌ You already have an active session.', ephemeral: true });
  }

  await message.delete().catch(() => {});

  const setupId = `wagon_${userId}_${Date.now()}`;
  setupSessions.set(setupId, {
    hostId: userId,
    hostUsername: message.author.username,
    channelId: message.channel.id,
    guildId: message.guild.id,
    step: 1,
    data: {}
  });

  const embed = createSetupEmbed(1, {});
  const row = createPlatformSelect(setupId);

  try {
    await message.author.send({ embeds: [embed], components: [row] });
    const confirm = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setDescription(`📩 **${message.author.username}**, check your DMs to set up your wagon run!`)
        .setColor(COLORS.gold)
      ]
    });
    setTimeout(() => confirm.delete().catch(() => {}), 5000);
  } catch (e) {
    message.channel.send({ content: `❌ **${message.author.username}**, enable DMs!` });
  }
}

// ═══════════════════════════════════════════════════════════════════
// SETUP EMBEDS
// ═══════════════════════════════════════════════════════════════════
function createSetupEmbed(step, data) {
  const totalSteps = 4;
  const progress = '▰'.repeat(step) + '▱'.repeat(totalSteps - step);
  
  const embed = new EmbedBuilder()
    .setTitle('```🛒 WAGON DELIVERY SETUP```')
    .setColor(COLORS.leather)
    .setFooter({ text: `Step ${step}/${totalSteps} • Cripps Trading Co.` });

  switch (step) {
    case 1:
      embed.setDescription(`
\`${progress}\`

**SELECT YOUR PLATFORM**

Choose your PlayStation version.
      `);
      break;
    case 2:
      embed.setDescription(`
\`${progress}\`

**ENTER YOUR PSN**
      `);
      break;
    case 3:
      embed.setDescription(`
\`${progress}\`

**SELECT DELIVERY TYPE**

${Object.entries(DELIVERY_TYPES).map(([k, v]) => 
  `${v.emoji} **${v.name}**\n└ ${v.payout} • Risk: \`${v.risk}\``
).join('\n\n')}
      `);
      break;
    case 4:
      embed.setDescription(`
\`${progress}\`

**FINAL OPTIONS**
      `);
      embed.addFields({ name: '📋 Summary', value: formatSummary(data) });
      break;
  }
  
  return embed;
}

function formatSummary(data) {
  const lines = [];
  if (data.platform) lines.push(`**Platform:** ${PLATFORMS[data.platform]?.name}`);
  if (data.psn) lines.push(`**PSN:** ${data.psn}`);
  if (data.deliveryType) lines.push(`**Delivery:** ${DELIVERY_TYPES[data.deliveryType]?.emoji} ${DELIVERY_TYPES[data.deliveryType]?.name}`);
  if (data.wagonCount) lines.push(`**Wagons:** ${data.wagonCount}`);
  return lines.join('\n') || 'No selections yet';
}

// ═══════════════════════════════════════════════════════════════════
// SETUP COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function createPlatformSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`wagon_platform_${setupId}`)
      .setPlaceholder('🎮 Select Platform')
      .addOptions([
        { label: 'PlayStation 5', value: 'ps5', emoji: '🎮' },
        { label: 'PlayStation 4', value: 'ps4', emoji: '🎮' },
        { label: 'Cross-Gen', value: 'crossgen', emoji: '🔄' }
      ])
  );
}

function createDeliverySelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`wagon_delivery_${setupId}`)
      .setPlaceholder('📦 Select Delivery Type')
      .addOptions(Object.entries(DELIVERY_TYPES).map(([key, val]) => ({
        label: val.name,
        description: `${val.payout} • Risk: ${val.risk}`,
        value: key,
        emoji: val.emoji
      })))
  );
}

function createFinalOptions(setupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_count_1_${setupId}`).setLabel('1 Wagon').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wagon_count_2_${setupId}`).setLabel('2 Wagons').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wagon_count_3_${setupId}`).setLabel('3+ Wagons').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_voice_yes_${setupId}`).setLabel('🔊 Voice Channel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wagon_voice_no_${setupId}`).setLabel('🔇 No Voice').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_start_${setupId}`).setLabel('START RECRUITING').setStyle(ButtonStyle.Success).setEmoji('🚀')
    )
  ];
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SESSION EMBED
// ═══════════════════════════════════════════════════════════════════
function createMainSessionEmbed(session) {
  const delivery = DELIVERY_TYPES[session.deliveryType];
  const platform = PLATFORMS[session.platform];
  
  const crewList = session.crew.length > 0 
    ? session.crew.map((c, i) => `\`${i + 1}\` <@${c.userId}> • \`${c.psn}\``).join('\n')
    : '```\nWaiting for posse...\n```';
  
  const spotsLeft = 7 - session.crew.length - 1;
  
  // Calculate payout
  const basePay = session.deliveryType === 'long' ? 625 : 500;
  const totalPay = basePay * (session.wagonCount || 1);
  
  const embed = new EmbedBuilder()
    .setAuthor({ name: 'CRIPPS TRADING CO.' })
    .setTitle(`${delivery.emoji} ${delivery.name.toUpperCase()}`)
    .setDescription(`
\`\`\`ansi
[2;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[0m
\`\`\`
**Risk Level:** \`${delivery.risk}\`
**Wagons:** ${session.wagonCount || 1}
    `)
    .addFields(
      { name: '👤 HOST', value: `>>> <@${session.hostId}>\n\`${session.hostPsn}\``, inline: true },
      { name: '🎮 PLATFORM', value: `>>> ${platform?.short}`, inline: true },
      { name: '💰 PAYOUT', value: `>>> \`$${totalPay}\``, inline: true },
      { name: `🤠 POSSE ${session.crew.length + 1}/7`, value: `>>> ${crewList}`, inline: false }
    )
    .setColor(session.status === 'recruiting' ? COLORS.gold : COLORS.success)
    .setFooter({ text: `⏱️ ${getTimeAgo(session.createdAt)} • ID: ${session.id.slice(-6)}` })
    .setTimestamp();

  return embed;
}

function createSessionControls(session) {
  const rows = [];
  
  if (session.status === 'recruiting' && session.crew.length < 6) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_join_${session.id}`).setLabel('JOIN POSSE').setStyle(ButtonStyle.Success).setEmoji('🤠')
    ));
  }
  
  const hostRow = new ActionRowBuilder();
  if (session.crew.length > 0) {
    hostRow.addComponents(
      new ButtonBuilder().setCustomId(`wagon_kick_menu_${session.id}`).setLabel('Kick').setStyle(ButtonStyle.Danger).setEmoji('👢')
    );
  }
  
  if (session.status === 'recruiting') {
    hostRow.addComponents(
      new ButtonBuilder().setCustomId(`wagon_ready_${session.id}`).setLabel('Ready').setStyle(ButtonStyle.Primary).setEmoji('✅')
    );
  } else if (session.status === 'ready') {
    hostRow.addComponents(
      new ButtonBuilder().setCustomId(`wagon_complete_${session.id}`).setLabel('COMPLETE').setStyle(ButtonStyle.Success).setEmoji('🏆')
    );
  }
  
  hostRow.addComponents(
    new ButtonBuilder().setCustomId(`wagon_cancel_${session.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌')
  );
  rows.push(hostRow);
  
  return rows;
}

// ═══════════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════
async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('wagon_')) return;
  
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const id = parts.slice(2).join('_');
  
  try {
    switch (action) {
      case 'platform':
        await handlePlatformSelect(interaction, id);
        break;
      case 'delivery':
        await handleDeliverySelect(interaction, id);
        break;
      case 'count':
        await handleWagonCount(interaction, id, parts[2]);
        break;
      case 'voice':
        await handleVoiceSelect(interaction, id, parts[2] === 'yes');
        break;
      case 'start':
        await handleStartRecruiting(interaction, id);
        break;
      case 'join':
        await handleJoin(interaction, id);
        break;
      case 'kick':
        await handleKick(interaction, id, parts[2]);
        break;
      case 'ready':
        await handleReady(interaction, id);
        break;
      case 'complete':
        await handleComplete(interaction, id);
        break;
      case 'cancel':
        await handleCancel(interaction, id);
        break;
    }
  } catch (e) {
    console.error('[WAGON] Error:', e);
  }
}

async function handlePlatformSelect(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  
  session.data.platform = interaction.values[0];
  
  const modal = new ModalBuilder()
    .setCustomId(`wagon_psn_modal_${setupId}`)
    .setTitle('Enter Your PSN');
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('psn_input')
        .setLabel('PSN Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );
  
  await interaction.showModal(modal);
  
  const filter = i => i.customId === `wagon_psn_modal_${setupId}`;
  try {
    const modalInt = await interaction.awaitModalSubmit({ filter, time: 120000 });
    session.data.psn = modalInt.fields.getTextInputValue('psn_input');
    session.step = 3;
    
    await modalInt.update({ 
      embeds: [createSetupEmbed(3, session.data)], 
      components: [createDeliverySelect(setupId)] 
    });
  } catch (e) {}
}

async function handleDeliverySelect(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  
  session.data.deliveryType = interaction.values[0];
  session.step = 4;
  session.data.wagonCount = 1;
  session.data.voice = false;
  
  await interaction.update({ 
    embeds: [createSetupEmbed(4, session.data)], 
    components: createFinalOptions(setupId) 
  });
}

async function handleWagonCount(interaction, setupId, count) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  
  session.data.wagonCount = parseInt(count);
  await interaction.update({ embeds: [createSetupEmbed(4, session.data)], components: createFinalOptions(setupId) });
}

async function handleVoiceSelect(interaction, setupId, wantsVoice) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  
  session.data.voice = wantsVoice;
  await interaction.update({ embeds: [createSetupEmbed(4, session.data)], components: createFinalOptions(setupId) });
}

async function handleStartRecruiting(interaction, setupId) {
  const setup = setupSessions.get(setupId);
  if (!setup) return;
  
  const sessionId = `wagon_${Date.now()}_${setup.hostId.slice(-4)}`;
  
  let voiceChannel = null;
  if (setup.data.voice) {
    try {
      const guild = interaction.client.guilds.cache.get(setup.guildId);
      // Find Red Dead category specifically
      const category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo') || c.name.toLowerCase().includes('rdr'))
      );
      
      voiceChannel = await guild.channels.create({
        name: `🛒 ${setup.hostUsername}'s Wagon`,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        userLimit: 7,
        reason: 'Wagon LFG Session'
      });
    } catch (e) {
      console.error('[WAGON] Voice creation error:', e.message);
    }
  }
  
  const session = {
    id: sessionId,
    hostId: setup.hostId,
    hostUsername: setup.hostUsername,
    hostPsn: setup.data.psn,
    platform: setup.data.platform,
    deliveryType: setup.data.deliveryType,
    wagonCount: setup.data.wagonCount,
    crew: [],
    status: 'recruiting',
    voiceChannelId: voiceChannel?.id,
    createdAt: Date.now(),
    channelId: setup.channelId,
    messageId: null
  };
  
  const lfgChannel = interaction.client.channels.cache.get(setup.channelId);
  const embed = createMainSessionEmbed(session);
  const components = createSessionControls(session);
  
  const pingRole = lfgChannel.guild.roles.cache.find(r => r.name.toLowerCase().includes('wagon') || r.name.toLowerCase().includes('trader'));
  
  const lfgMessage = await lfgChannel.send({
    content: pingRole ? `<@&${pingRole.id}>` : '🛒 **New Wagon Run!**',
    embeds: [embed],
    components
  });
  
  session.messageId = lfgMessage.id;
  activeSessions.set(setup.hostId, session);
  activeSessions.set(sessionId, session);
  setupSessions.delete(setupId);
  
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle('🚀 WAGON RUN LIVE!').setDescription(`[Go to session](https://discord.com/channels/${setup.guildId}/${setup.channelId}/${lfgMessage.id})`).setColor(COLORS.success)],
    components: []
  });
}

async function handleJoin(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session not found.', ephemeral: true });
  
  if (session.hostId === interaction.user.id || session.crew.some(c => c.userId === interaction.user.id)) {
    return interaction.reply({ content: '❌ Already in session.', ephemeral: true });
  }
  
  if (session.crew.length >= 6) {
    return interaction.reply({ content: '❌ Session full.', ephemeral: true });
  }
  
  if (blacklistSystem) {
    const blocked = await blacklistSystem.isBlacklisted(session.hostId, interaction.user.id);
    if (blocked) return interaction.reply({ content: '🚫 You\'re blacklisted by this host.', ephemeral: true });
  }
  
  const modal = new ModalBuilder().setCustomId(`wagon_join_psn_${sessionId}`).setTitle('Join Wagon Run');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('psn_input').setLabel('Your PSN').setStyle(TextInputStyle.Short).setRequired(true)
    )
  );
  
  await interaction.showModal(modal);
  
  const filter = i => i.customId === `wagon_join_psn_${sessionId}`;
  try {
    const modalInt = await interaction.awaitModalSubmit({ filter, time: 60000 });
    const psn = modalInt.fields.getTextInputValue('psn_input');
    
    session.crew.push({ userId: modalInt.user.id, username: modalInt.user.username, psn, joinedAt: Date.now() });
    await updateSessionMessage(interaction.client, session);
    await modalInt.reply({ content: `✅ Joined! PSN: \`${psn}\``, ephemeral: true });
  } catch (e) {}
}

async function handleKick(interaction, sessionId, subAction) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) {
    return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  }
  
  if (subAction === 'menu') {
    if (session.crew.length === 0) return interaction.reply({ content: '❌ No one to kick.', ephemeral: true });
    
    const select = new StringSelectMenuBuilder()
      .setCustomId(`wagon_kick_select_${sessionId}`)
      .setPlaceholder('Select player')
      .addOptions(session.crew.map(c => ({ label: c.username, value: c.userId })));
    
    await interaction.reply({ content: '👢 Select player to kick:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    
    const filter = i => i.customId === `wagon_kick_select_${sessionId}`;
    try {
      const selectInt = await interaction.channel.awaitMessageComponent({ filter, time: 30000 });
      const kickedId = selectInt.values[0];
      const kicked = session.crew.find(c => c.userId === kickedId);
      
      session.crew = session.crew.filter(c => c.userId !== kickedId);
      await updateSessionMessage(interaction.client, session);
      
      if (blacklistSystem) {
        const { embed, row } = blacklistSystem.createBlacklistPrompt(session.hostId, kickedId, kicked.username);
        await selectInt.update({ embeds: [embed], components: [row] });
      } else {
        await selectInt.update({ content: `✅ Kicked ${kicked.username}`, components: [] });
      }
    } catch (e) {}
  }
}

async function handleReady(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return;
  
  session.status = 'ready';
  await updateSessionMessage(interaction.client, session);
  await interaction.reply({ content: '🚀 Wagon run starting!', ephemeral: true });
}

async function handleComplete(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) {
    return interaction.reply({ content: '❌ Only the host can complete.', ephemeral: true });
  }
  
  // Delete voice channel
  if (session.voiceChannelId) {
    try {
      const vc = interaction.client.channels.cache.get(session.voiceChannelId);
      await vc?.delete('LFG Session completed');
    } catch (e) {}
  }
  
  // Update message to show completed
  try {
    const channel = interaction.client.channels.cache.get(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    
    const delivery = DELIVERY_TYPES[session.deliveryType];
    const completedEmbed = new EmbedBuilder()
      .setTitle('🏆 DELIVERY COMPLETED')
      .setDescription(`**${delivery.emoji} ${delivery.name}** was a success!\n\n**Host:** <@${session.hostId}>\n**Posse:** ${session.crew.map(c => `<@${c.userId}>`).join(', ') || 'Solo'}`)
      .setColor(COLORS.success)
      .setTimestamp();
    
    await msg.edit({ embeds: [completedEmbed], components: [] });
  } catch (e) {}
  
  // Cleanup
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  
  await interaction.reply({ content: '🏆 **Delivery completed!** Voice channel closed.', ephemeral: true });
}

async function handleCancel(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return;
  
  if (session.voiceChannelId) {
    try { await interaction.client.channels.cache.get(session.voiceChannelId)?.delete(); } catch (e) {}
  }
  
  try {
    const channel = interaction.client.channels.cache.get(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    await msg.delete();
  } catch (e) {}
  
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  await interaction.reply({ content: '✅ Cancelled.', ephemeral: true });
}

async function updateSessionMessage(client, session) {
  try {
    const channel = client.channels.cache.get(session.channelId);
    const message = await channel.messages.fetch(session.messageId);
    await message.edit({ embeds: [createMainSessionEmbed(session)], components: createSessionControls(session) });
  } catch (e) {}
}

function getTimeAgo(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

module.exports = { initialize, createSession };
