// ============================================
// LFG SYSTEM V2 - With Temp Voice Channels
// ============================================
// - LFG channels are command-only
// - Creates temp voice channels
// - PlayStation/Discord connection info
// - Auto-delete VC when empty

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

class LFGSystem {
  constructor(pool, botName) {
    this.pool = pool;
    this.botName = botName;
    this.activeSessions = new Map();
    this.tempVoiceChannels = new Map(); // messageId -> voiceChannelId
  }

  // Check if message is in LFG channel
  isLFGChannel(channelName) {
    const lfgChannels = ['cayo-lfg', 'wagon-lfg', 'bounty-lfg', 'heist-lfg'];
    return lfgChannels.some(name => channelName.includes(name) || channelName.includes('lfg'));
  }

  // Get the chat channel for redirect messages
  getChatChannel(guild, lfgType) {
    if (lfgType === 'cayo' || lfgType === 'heist') {
      return guild.channels.cache.find(c => c.name === 'gta-chat');
    } else {
      return guild.channels.cache.find(c => c.name === 'rdo-chat');
    }
  }

  // Enforce LFG channel - delete non-commands
  async enforceChannel(message, prefix, allowedCommands) {
    if (!this.isLFGChannel(message.channel.name)) return false;
    
    // If it starts with prefix, it might be a command - let it through
    if (message.content.startsWith(prefix)) {
      const cmd = message.content.slice(prefix.length).trim().split(/ +/)[0].toLowerCase();
      if (allowedCommands.includes(cmd)) {
        return false; // Valid command, don't delete
      }
    }
    
    // Not a valid command - delete and warn
    await message.delete().catch(() => {});
    
    const chatChannel = this.getChatChannel(message.guild, message.channel.name);
    const chatMention = chatChannel ? `<#${chatChannel.id}>` : '#rdo-chat or #gta-chat';
    
    const warning = await message.channel.send({
      content: `<@${message.author.id}> This channel is for LFG commands only. Use ${chatMention} for chatting.`
    });
    
    setTimeout(() => warning.delete().catch(() => {}), 8000);
    return true; // Message was deleted
  }

  // Create temporary voice channel
  async createTempVoiceChannel(guild, session, lfgType) {
    try {
      // Find the parent category (GTA or RDO)
      let parentCategory;
      if (lfgType === 'cayo' || lfgType === 'heist') {
        parentCategory = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name.includes('GTA')
        );
      } else {
        parentCategory = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name.includes('RED DEAD')
        );
      }

      const channelName = this.getTempVCName(lfgType, session.hostPsn || session.hostName);
      
      const voiceChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: parentCategory?.id,
        userLimit: (session.spotsTotal || 4) + 1, // +1 for host
        reason: `Temp LFG Voice Channel for ${session.hostPsn || session.hostName}`
      });

      this.tempVoiceChannels.set(session.messageId, voiceChannel.id);
      
      return voiceChannel;
    } catch (error) {
      console.error('Error creating temp voice channel:', error);
      return null;
    }
  }

  getTempVCName(lfgType, hostName) {
    const names = {
      'cayo': `🏝️ Cayo - ${hostName}`,
      'heist': `🚁 Heist - ${hostName}`,
      'wagon': `🛞 Wagon - ${hostName}`,
      'bounty': `⭐ Bounty - ${hostName}`,
      'legendary': `🏆 Legendary - ${hostName}`,
      'posse': `🤠 Posse - ${hostName}`
    };
    return names[lfgType] || `🎮 LFG - ${hostName}`;
  }

  // Get PlayStation/Discord connection instructions
  getVCInstructions(voiceChannel) {
    return `
**🎧 Voice Chat Ready!**
<#${voiceChannel.id}>

**How to join from PlayStation:**
1. On PS5: Go to **Settings** → **Users and Accounts** → **Linked Services** → **Discord**
2. Or use the **PlayStation App** → **Settings** → **Linked Services** → **Discord**
3. Once linked, you can join Discord voice from your PS console!
4. On PS5: Press **PS button** → **Game Base** → **Discord** → Join the voice channel

**Or just join from your phone/PC** - whatever's easiest!`;
  }

  // Notify crew about voice channel
  async notifyCrew(channel, session, voiceChannel, newMemberId = null) {
    const vcInstructions = this.getVCInstructions(voiceChannel);
    
    let mentions = `<@${session.hostId}>`;
    if (session.crew && session.crew.length > 0) {
      mentions += ' ' + session.crew.map(c => `<@${c.id}>`).join(' ');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎮 Voice Channel Created!')
      .setDescription(`${vcInstructions}`)
      .setColor(0x5865F2)
      .setFooter({ text: 'Voice channel will auto-delete when everyone leaves or LFG ends' });

    const msg = await channel.send({
      content: mentions,
      embeds: [embed]
    });

    // Delete after 60 seconds
    setTimeout(() => msg.delete().catch(() => {}), 60000);
  }

  // Notify new member about VC
  async notifyNewMember(channel, memberId, voiceChannel, session) {
    const msg = await channel.send({
      content: `<@${memberId}> joined! Voice chat available: <#${voiceChannel.id}>\n` +
               `**Tip:** You can join Discord voice directly from PlayStation if your accounts are linked!`
    });
    setTimeout(() => msg.delete().catch(() => {}), 20000);
  }

  // Delete temp voice channel
  async deleteTempVoiceChannel(messageId, guild) {
    const vcId = this.tempVoiceChannels.get(messageId);
    if (!vcId) return;

    try {
      const voiceChannel = guild.channels.cache.get(vcId);
      if (voiceChannel) {
        await voiceChannel.delete('LFG session ended');
      }
    } catch (error) {
      console.error('Error deleting temp voice channel:', error);
    }

    this.tempVoiceChannels.delete(messageId);
  }

  // Check if voice channel is empty and delete if so
  async checkAndDeleteEmptyVC(voiceChannel, messageId) {
    if (!voiceChannel) return;
    
    // Give a small delay to check if someone is connecting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Re-fetch the channel to get current state
    try {
      const channel = await voiceChannel.fetch();
      if (channel.members.size === 0) {
        await channel.delete('Empty voice channel cleanup');
        this.tempVoiceChannels.delete(messageId);
      }
    } catch (error) {
      // Channel might already be deleted
    }
  }

  // Setup voice state handler for auto-delete
  setupVoiceStateHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
      // Check if someone left a voice channel
      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const vcId = oldState.channelId;
        
        // Check if this is one of our temp channels
        for (const [messageId, tempVcId] of this.tempVoiceChannels) {
          if (tempVcId === vcId) {
            const channel = oldState.guild.channels.cache.get(vcId);
            if (channel && channel.members.size === 0) {
              // Wait a bit then delete
              setTimeout(async () => {
                try {
                  const recheckChannel = oldState.guild.channels.cache.get(vcId);
                  if (recheckChannel && recheckChannel.members.size === 0) {
                    await recheckChannel.delete('All members left voice channel');
                    this.tempVoiceChannels.delete(messageId);
                    console.log(`Deleted empty temp VC: ${recheckChannel.name}`);
                  }
                } catch (e) {}
              }, 10000); // 10 second grace period
            }
            break;
          }
        }
      }
    });
  }

  // Get session by message ID
  getSession(messageId) {
    return this.activeSessions.get(messageId);
  }

  // Set session
  setSession(messageId, session) {
    this.activeSessions.set(messageId, session);
  }

  // Delete session
  deleteSession(messageId) {
    this.activeSessions.delete(messageId);
  }
}

module.exports = LFGSystem;
