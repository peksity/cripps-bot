/**
 * ADVANCED WAGON DELIVERY LFG - OUTLAW EDITION
 * Features: Dupe counter, wagon sizes, accurate payouts, in-channel setup
 */

const { 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, ChannelType
} = require('discord.js');

const COLORS = { gold: 0xFFD700, leather: 0x8B4513, success: 0x00FF88, danger: 0xFF3366 };

// Accurate payouts based on wagon size
const WAGON_SIZES = {
  small: { name: 'Small Wagon', capacity: 25, emoji: '🐌', localPay: 62.50, distantPay: 78 },
  medium: { name: 'Medium Wagon', capacity: 50, emoji: '🚚', localPay: 150, distantPay: 187.50 },
  large: { name: 'Large Wagon', capacity: 100, emoji: '🐂', localPay: 500, distantPay: 625 }
};

const DELIVERY_TYPES = {
  local: { name: 'Local Delivery', emoji: '📦', risk: 'LOW' },
  distant: { name: 'Long Distance', emoji: '🛤️', risk: 'HIGH (+25% bonus)' }
};

const PLATFORMS = {
  ps5: { name: 'PlayStation 5', short: 'PS5' },
  ps4: { name: 'PlayStation 4', short: 'PS4' },
  crossgen: { name: 'Cross-Gen', short: 'CROSS' }
};

let pool = null;
let blacklistSystem = null;
const activeSessions = new Map();
const setupSessions = new Map();

function initialize(client, dbPool) {
  pool = dbPool;
  try {
    const { getBlacklistSystem } = require('./blacklistSystem');
    blacklistSystem = getBlacklistSystem(pool);
    blacklistSystem.initialize();
  } catch (e) {}
  client.on('interactionCreate', handleInteraction);
  console.log('[WAGON LFG] ✅ Initialized with dupe counter');
}

async function createSession(message, client) {
  const userId = message.author.id;
  if (activeSessions.has(userId)) {
    const reply = await message.reply('❌ You already have an active session.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  await message.delete().catch(() => {});

  const setupId = `wagon_setup_${userId}_${Date.now()}`;
  setupSessions.set(setupId, {
    hostId: userId, hostUsername: message.author.username,
    channelId: message.channel.id, guildId: message.guild.id,
    step: 1, data: {}, messageId: null
  });

  const setupMsg = await message.channel.send({
    content: `<@${userId}> **Setting up wagon run...** *(only you can interact)*`,
    embeds: [createSetupEmbed(1, {})],
    components: [createPlatformSelect(setupId)]
  });
  
  setupSessions.get(setupId).messageId = setupMsg.id;
  setTimeout(async () => {
    if (setupSessions.has(setupId)) {
      setupSessions.delete(setupId);
      await setupMsg.delete().catch(() => {});
    }
  }, 120000);
}

function createSetupEmbed(step, data) {
  const progress = '▰'.repeat(step) + '▱'.repeat(5 - step);
  const embed = new EmbedBuilder().setTitle('🛒 WAGON DELIVERY SETUP').setColor(COLORS.gold).setFooter({ text: `Step ${step}/5` });
  
  let desc = `\`${progress}\`\n\n`;
  if (step === 1) desc += '**SELECT PLATFORM**';
  else if (step === 3) {
    desc += '**SELECT WAGON SIZE**\n\n';
    desc += '🐌 **Small** - 25 goods (~$62.50 local)\n';
    desc += '🚚 **Medium** - 50 goods (~$150 local)\n';
    desc += '🐂 **Large** - 100 goods (~$500 local)\n';
  } else if (step === 4) {
    desc += '**SELECT DELIVERY TYPE**\n\n';
    desc += '📦 **Local** - Short route, low risk\n';
    desc += '🛤️ **Long Distance** - +25% bonus, high risk\n';
  } else if (step === 5) {
    const wagon = WAGON_SIZES[data.wagonSize];
    const isDistant = data.deliveryType === 'distant';
    const hostPay = isDistant ? wagon.distantPay : wagon.localPay;
    desc += '**READY TO POST**\n\n';
    desc += `📍 **Platform:** ${PLATFORMS[data.platform]?.name}\n`;
    desc += `🎮 **PSN:** \`${data.psn}\`\n`;
    desc += `${wagon.emoji} **Wagon:** ${wagon.name} (${wagon.capacity} goods)\n`;
    desc += `${DELIVERY_TYPES[data.deliveryType]?.emoji} **Type:** ${DELIVERY_TYPES[data.deliveryType]?.name}\n`;
    desc += `💰 **Host Payout:** $${hostPay.toFixed(2)}\n`;
    desc += `🤝 **Posse Payout:** ~$${(hostPay * 0.5).toFixed(2)} each\n`;
  }
  embed.setDescription(desc);
  return embed;
}

function createPlatformSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`wagon_platform_${setupId}`).setPlaceholder('🎮 Platform')
      .addOptions([
        { label: 'PlayStation 5', value: 'ps5', emoji: '🎮' },
        { label: 'PlayStation 4', value: 'ps4', emoji: '🎮' },
        { label: 'Cross-Gen', value: 'crossgen', emoji: '🔄' }
      ])
  );
}

function createWagonSizeSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`wagon_size_${setupId}`).setPlaceholder('🛒 Wagon Size')
      .addOptions([
        { label: 'Small Wagon (25 goods)', value: 'small', emoji: '🐌', description: '~$62.50 local / ~$78 distant' },
        { label: 'Medium Wagon (50 goods)', value: 'medium', emoji: '🚚', description: '~$150 local / ~$187 distant' },
        { label: 'Large Wagon (100 goods)', value: 'large', emoji: '🐂', description: '~$500 local / ~$625 distant' }
      ])
  );
}

function createDeliverySelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`wagon_delivery_${setupId}`).setPlaceholder('📦 Delivery Type')
      .addOptions([
        { label: 'Local Delivery', value: 'local', emoji: '📦', description: 'Short route, low risk' },
        { label: 'Long Distance', value: 'distant', emoji: '🛤️', description: '+25% bonus, high risk' }
      ])
  );
}

function createFinalOptions(setupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_dupe_on_${setupId}`).setLabel('🔄 Dupe: ON').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wagon_dupe_off_${setupId}`).setLabel('Dupe: OFF').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wagon_voice_on_${setupId}`).setLabel('🔊 Voice').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wagon_start_${setupId}`).setLabel('🚀 POST WAGON').setStyle(ButtonStyle.Success)
    )
  ];
}

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('wagon_')) return;
  const parts = interaction.customId.split('_');
  const action = parts[1];
  
  try {
    if (action === 'platform') await handlePlatform(interaction);
    else if (action === 'size') await handleSize(interaction);
    else if (action === 'delivery') await handleDelivery(interaction);
    else if (action === 'dupe') await handleSetupDupe(interaction, parts[2] === 'on');
    else if (action === 'voice') await handleVoice(interaction, parts[2] === 'on');
    else if (action === 'start') await handleStart(interaction);
    else if (action === 'join') await handleJoin(interaction);
    else if (action === 'leave') await handleLeave(interaction);
    else if (action === 'voicebtn') await handleVoiceBtn(interaction);
    else if (action === 'startrun') await handleStartRun(interaction);
    else if (action === 'dupenow') await handleDupeNow(interaction);
    else if (action === 'end') await handleEnd(interaction);
    else if (action === 'kick') await handleKick(interaction, parts[2]);
  } catch (e) { console.error('[WAGON]', e); }
}

function getSetupId(customId) { return customId.split('_').slice(2).join('_'); }
function getSessionId(customId) { return customId.split('_').slice(2).join('_'); }

async function handlePlatform(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.platform = interaction.values[0];
  
  const modal = new ModalBuilder().setCustomId(`wagon_psn_${setupId}`).setTitle('Enter PSN')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('psn').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)));
  await interaction.showModal(modal);
  
  try {
    const m = await interaction.awaitModalSubmit({ filter: i => i.customId === `wagon_psn_${setupId}`, time: 60000 });
    setup.data.psn = m.fields.getTextInputValue('psn');
    setup.step = 3;
    await m.update({ embeds: [createSetupEmbed(3, setup.data)], components: [createWagonSizeSelect(setupId)] });
  } catch (e) {}
}

async function handleSize(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.wagonSize = interaction.values[0];
  setup.step = 4;
  await interaction.update({ embeds: [createSetupEmbed(4, setup.data)], components: [createDeliverySelect(setupId)] });
}

async function handleDelivery(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.deliveryType = interaction.values[0];
  setup.data.dupe = false;
  setup.data.voice = true;
  setup.step = 5;
  await interaction.update({ embeds: [createSetupEmbed(5, setup.data)], components: createFinalOptions(setupId) });
}

async function handleSetupDupe(interaction, isOn) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  setup.data.dupe = isOn;
  await interaction.update({ embeds: [createSetupEmbed(5, setup.data)], components: createFinalOptions(setupId) });
}

async function handleVoice(interaction, isOn) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  setup.data.voice = isOn;
  await interaction.update({ embeds: [createSetupEmbed(5, setup.data)], components: createFinalOptions(setupId) });
}

async function handleStart(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  const sessionId = `wagon_${Date.now()}_${setup.hostId.slice(-4)}`;
  const wagon = WAGON_SIZES[setup.data.wagonSize];
  const isDistant = setup.data.deliveryType === 'distant';
  const hostPay = isDistant ? wagon.distantPay : wagon.localPay;
  
  let voiceChannel = null;
  if (setup.data.voice) {
    try {
      const guild = interaction.guild;
      // Try specific category ID first, then search by name
      let category = guild.channels.cache.get('1453304762597376094');
      if (!category) {
        category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo')));
      }
      voiceChannel = await guild.channels.create({ name: `🛒 ${setup.hostUsername}'s Wagon`, type: ChannelType.GuildVoice, parent: category?.id, userLimit: 6 });
    } catch (e) { console.error('Voice channel error:', e); }
  }
  
  const session = {
    id: sessionId, hostId: setup.hostId, hostUsername: setup.hostUsername, hostPsn: setup.data.psn,
    platform: setup.data.platform, wagonSize: setup.data.wagonSize, deliveryType: setup.data.deliveryType,
    dupe: setup.data.dupe, hostPay: hostPay, possePay: hostPay * 0.5,
    crew: [], status: 'recruiting', voiceChannelId: voiceChannel?.id, createdAt: Date.now(),
    channelId: setup.channelId, messageId: null, dupeCount: 0, totalEarnings: 0
  };
  
  try { await interaction.message.delete(); } catch (e) {}
  
  const lfgChannel = interaction.channel;
  const pingRole = lfgChannel.guild.roles.cache.find(r => r.name.toLowerCase().includes('wagon') || r.name.toLowerCase().includes('trader'));
  
  const lfgMessage = await lfgChannel.send({
    content: pingRole ? `<@&${pingRole.id}>` : '🛒 **New Wagon Run!**',
    embeds: [createMainEmbed(session)],
    components: createSessionControls(session)
  });
  
  session.messageId = lfgMessage.id;
  activeSessions.set(setup.hostId, session);
  activeSessions.set(sessionId, session);
  setupSessions.delete(setupId);
  
  await interaction.reply({ content: '✅ **Wagon posted!**', ephemeral: true });
}

function createMainEmbed(session) {
  const wagon = WAGON_SIZES[session.wagonSize];
  const delivery = DELIVERY_TYPES[session.deliveryType];
  const platform = PLATFORMS[session.platform];
  
  // Calculate potential earnings
  const totalPosse = session.crew.length + 1;
  const potentialPerRun = session.hostPay + (session.crew.length * session.possePay);
  
  // Build posse list with numbered slots
  let posseList = `1.👑 **${session.hostUsername}** (PSN: ${session.hostPsn})\n`;
  for (let i = 0; i < 5; i++) {
    if (session.crew[i]) {
      posseList += `${i + 2}. ${session.crew[i].username} (PSN: ${session.crew[i].psn})\n`;
    } else {
      posseList += `${i + 2}. 🟡 *Open*\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`🛒 WAGON DELIVERY - ${session.status.toUpperCase()}`)
    .setDescription(`**Host:** ${session.hostUsername} (${session.hostPsn || 'Unknown'})\n${wagon.emoji} ${delivery.name} | ${wagon.emoji} ${wagon.name} | ${session.dupe ? '🔄 Dupe ON' : ''}`)
    .addFields(
      { name: '🤠 Posse', value: posseList, inline: true },
      { name: '📊 Info', value: `Slots: **${totalPosse}/6**\nPotential: **$${potentialPerRun.toFixed(2)}**${session.dupeCount > 0 ? `\n\n💰 **Dupes: ${session.dupeCount}**\n💵 Total: $${session.totalEarnings.toFixed(2)}` : ''}`, inline: true }
    )
    .setColor(session.status === 'recruiting' ? COLORS.gold : session.status === 'in_progress' ? COLORS.leather : COLORS.success)
    .setFooter({ text: `Platform: ${platform.short} • ${getTimeAgo(session.createdAt)}` });

  return embed;
}

function createSessionControls(session) {
  const rows = [];
  
  // Row 1: Join/Leave/Voice buttons
  const row1 = new ActionRowBuilder();
  if (session.status === 'recruiting' && session.crew.length < 5) {
    row1.addComponents(new ButtonBuilder().setCustomId(`wagon_join_${session.id}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('🤠'));
  }
  row1.addComponents(
    new ButtonBuilder().setCustomId(`wagon_leave_${session.id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`wagon_voicebtn_${session.id}`).setLabel('Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  rows.push(row1);
  
  // Row 2: Host controls - Start Run/Dupe/End
  const row2 = new ActionRowBuilder();
  if (session.status === 'recruiting') {
    row2.addComponents(new ButtonBuilder().setCustomId(`wagon_startrun_${session.id}`).setLabel('Start Run').setStyle(ButtonStyle.Primary).setEmoji('🚀'));
  }
  if (session.status === 'in_progress') {
    row2.addComponents(new ButtonBuilder().setCustomId(`wagon_dupenow_${session.id}`).setLabel('Dupe').setStyle(ButtonStyle.Success).setEmoji('💰'));
  }
  row2.addComponents(new ButtonBuilder().setCustomId(`wagon_end_${session.id}`).setLabel('End').setStyle(ButtonStyle.Danger).setEmoji('⭕'));
  rows.push(row2);
  
  return rows;
}

async function handleJoin(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (session.hostId === interaction.user.id) return interaction.reply({ content: '❌ You\'re the host!', ephemeral: true });
  if (session.crew.some(c => c.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already in!', ephemeral: true });
  if (session.crew.length >= 5) return interaction.reply({ content: '❌ Full!', ephemeral: true });
  if (blacklistSystem && await blacklistSystem.isBlacklisted(session.hostId, interaction.user.id)) return interaction.reply({ content: '🚫 Blacklisted.', ephemeral: true });
  
  const modal = new ModalBuilder().setCustomId(`wagon_joinpsn_${sessionId}`).setTitle('Join Wagon')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('psn').setLabel('Your PSN').setStyle(TextInputStyle.Short).setRequired(true)));
  await interaction.showModal(modal);
  
  try {
    const m = await interaction.awaitModalSubmit({ filter: i => i.customId === `wagon_joinpsn_${sessionId}`, time: 60000 });
    session.crew.push({ userId: m.user.id, username: m.user.username, psn: m.fields.getTextInputValue('psn'), joinedAt: Date.now() });
    await updateSession(interaction.client, session);
    
    // Send notification in channel
    const channel = interaction.client.channels.cache.get(session.channelId);
    await channel.send(`🤠 **${m.user.username}** joined the wagon! (${session.crew.length + 1}/6)`);
    
    await m.reply({ content: '✅ Joined!', ephemeral: true });
  } catch (e) {}
}

async function handleLeave(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  
  const idx = session.crew.findIndex(c => c.userId === interaction.user.id);
  if (idx === -1) return interaction.reply({ content: '❌ You\'re not in this wagon.', ephemeral: true });
  
  const left = session.crew.splice(idx, 1)[0];
  await updateSession(interaction.client, session);
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  await channel.send(`🚪 **${left.username}** left the wagon.`);
  
  await interaction.reply({ content: '✅ Left the wagon.', ephemeral: true });
}

async function handleVoiceBtn(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  
  if (session.voiceChannelId) {
    await interaction.reply({ content: `🔊 Join voice: <#${session.voiceChannelId}>`, ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ No voice channel for this session.', ephemeral: true });
  }
}

async function handleStartRun(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  session.status = 'in_progress';
  await updateSession(interaction.client, session);
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  await channel.send(`🚀 **${session.hostUsername}** is running a ${DELIVERY_TYPES[session.deliveryType].emoji} **${DELIVERY_TYPES[session.deliveryType].name}** | ${session.dupe ? '🔄 Dupe: ON' : ''} | Click voice to join!`);
  
  await interaction.reply({ content: '🚀 Run started!', ephemeral: true });
}

async function handleDupeNow(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  // Increment dupe counter
  session.dupeCount++;
  
  // Calculate earnings for this dupe
  const hostEarnings = session.hostPay;
  const posseEarnings = session.possePay;
  const totalThisDupe = hostEarnings + (session.crew.length * posseEarnings);
  session.totalEarnings += totalThisDupe;
  
  // Track cumulative earnings
  if (!session.hostTotalEarnings) session.hostTotalEarnings = 0;
  if (!session.posseTotalEarnings) session.posseTotalEarnings = 0;
  session.hostTotalEarnings += hostEarnings;
  session.posseTotalEarnings += posseEarnings;
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  
  // Delete old message
  try {
    const oldMsg = await channel.messages.fetch(session.messageId);
    await oldMsg.delete();
  } catch (e) {}
  
  // Send dupe notification with earnings breakdown
  let dupeMsg = `💰 **DUPE #${session.dupeCount}!**\n`;
  dupeMsg += `👑 **Host:** +$${hostEarnings.toFixed(2)} (Total: **$${session.hostTotalEarnings.toFixed(2)}**)\n`;
  if (session.crew.length > 0) {
    dupeMsg += `🤠 **Posse:** +$${posseEarnings.toFixed(2)} each (Total: **$${session.posseTotalEarnings.toFixed(2)}** each)`;
  }
  await channel.send(dupeMsg);
  
  // Post new embed at bottom
  const newMsg = await channel.send({
    embeds: [createMainEmbed(session)],
    components: createSessionControls(session)
  });
  
  session.messageId = newMsg.id;
  await updateSession(interaction.client, session);
  
  await interaction.reply({ content: `✅ Dupe #${session.dupeCount} recorded! Host: $${session.hostTotalEarnings.toFixed(2)} | Posse: $${session.posseTotalEarnings.toFixed(2)} each`, ephemeral: true });
}

async function handleEnd(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  // Delete voice channel
  if (session.voiceChannelId) {
    try { await interaction.client.channels.cache.get(session.voiceChannelId)?.delete(); } catch (e) {}
  }
  
  // Update message to show completed
  try {
    const ch = interaction.client.channels.cache.get(session.channelId);
    const msg = await ch.messages.fetch(session.messageId);
    
    const wagon = WAGON_SIZES[session.wagonSize];
    let summary = `**${wagon.emoji} ${wagon.name}** delivered!\n\n`;
    summary += `**Host:** <@${session.hostId}>\n`;
    summary += `**Posse:** ${session.crew.map(c => `<@${c.userId}>`).join(', ') || 'Solo'}\n\n`;
    if (session.dupeCount > 0) {
      summary += `💰 **Total Dupes:** ${session.dupeCount}\n`;
      summary += `💵 **Total Earnings:** $${session.totalEarnings.toFixed(2)}`;
    }
    
    await msg.edit({ 
      embeds: [new EmbedBuilder().setTitle('🏆 DELIVERY COMPLETE').setDescription(summary).setColor(COLORS.success)], 
      components: [] 
    });
  } catch (e) {}
  
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  
  await interaction.reply({ content: `✅ Session ended! ${session.dupeCount > 0 ? `Total dupes: ${session.dupeCount}, Earnings: $${session.totalEarnings.toFixed(2)}` : ''}`, ephemeral: true });
}

async function handleKick(interaction, subAction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (subAction === 'menu') {
    if (!session.crew.length) return interaction.reply({ content: '❌ No crew.', ephemeral: true });
    const select = new StringSelectMenuBuilder().setCustomId(`wagon_kick_sel_${sessionId}`).setPlaceholder('Kick who?')
      .addOptions(session.crew.map(c => ({ label: c.username, value: c.userId })));
    await interaction.reply({ content: '👢 Select:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    
    try {
      const s = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `wagon_kick_sel_${sessionId}`, time: 30000 });
      const kicked = session.crew.find(c => c.userId === s.values[0]);
      session.crew = session.crew.filter(c => c.userId !== s.values[0]);
      await updateSession(interaction.client, session);
      
      const channel = interaction.client.channels.cache.get(session.channelId);
      await channel.send(`👢 **${kicked.username}** was removed from the wagon.`);
      
      if (blacklistSystem) {
        const { embed, row } = blacklistSystem.createBlacklistPrompt(session.hostId, kicked.userId, kicked.username);
        await s.update({ embeds: [embed], components: [row] });
      } else await s.update({ content: `✅ Kicked ${kicked.username}`, components: [] });
    } catch (e) {}
  }
}

async function updateSession(client, session) {
  try { 
    const ch = client.channels.cache.get(session.channelId); 
    const msg = await ch.messages.fetch(session.messageId); 
    await msg.edit({ embeds: [createMainEmbed(session)], components: createSessionControls(session) }); 
  } catch (e) {}
}

function getTimeAgo(ts) { 
  const m = Math.floor((Date.now() - ts) / 60000); 
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`; 
}

module.exports = { initialize, createSession };
