/**
 * ██████╗ ██╗      █████╗  ██████╗██╗  ██╗██╗     ██╗███████╗████████╗
 * ██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝██║     ██║██╔════╝╚══██╔══╝
 * ██████╔╝██║     ███████║██║     █████╔╝ ██║     ██║███████╗   ██║   
 * ██╔══██╗██║     ██╔══██║██║     ██╔═██╗ ██║     ██║╚════██║   ██║   
 * ██████╔╝███████╗██║  ██║╚██████╗██║  ██╗███████╗██║███████║   ██║   
 * ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝   ╚═╝   
 * 
 * LFG BLACKLIST SYSTEM
 * 
 * Allows hosts to permanently blacklist players from their LFGs
 * - Works across ALL LFG types (wagon, cayo, bounty)
 * - Persists in database
 * - Confirmation before blacklisting
 * - Can unblock from any LFG channel
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { Pool } = require('pg');

class LFGBlacklist {
  constructor(pool) {
    this.pool = pool || new Pool({ 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    this.pendingBlacklists = new Map(); // userId -> { userId, userId, userId }
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS lfg_blacklist (
          id SERIAL PRIMARY KEY,
          blocker_id VARCHAR(50) NOT NULL,
          blocker_username VARCHAR(100),
          blocked_id VARCHAR(50) NOT NULL,
          blocked_username VARCHAR(100),
          reason TEXT,
          lfg_type VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(blocker_id, blocked_id)
        )
      `);
      console.log('[BLACKLIST] ✅ Database initialized');
    } catch (e) {
      console.error('[BLACKLIST] Init error:', e.message);
    }
  }

  /**
   * Check if a user is blacklisted by a host
   */
  async isBlacklisted(hostId, userId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM lfg_blacklist WHERE blocker_id = $1 AND blocked_id = $2',
        [hostId, userId]
      );
      return result.rows.length > 0;
    } catch (e) {
      console.error('[BLACKLIST] Check error:', e.message);
      return false;
    }
  }

  /**
   * Add to blacklist
   */
  async addToBlacklist(blockerId, blockerUsername, blockedId, blockedUsername, reason = null, lfgType = null) {
    try {
      await this.pool.query(`
        INSERT INTO lfg_blacklist (blocker_id, blocker_username, blocked_id, blocked_username, reason, lfg_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      `, [blockerId, blockerUsername, blockedId, blockedUsername, reason, lfgType]);
      console.log(`[BLACKLIST] ${blockerUsername} blacklisted ${blockedUsername}`);
      return true;
    } catch (e) {
      console.error('[BLACKLIST] Add error:', e.message);
      return false;
    }
  }

  /**
   * Remove from blacklist
   */
  async removeFromBlacklist(blockerId, blockedId) {
    try {
      const result = await this.pool.query(
        'DELETE FROM lfg_blacklist WHERE blocker_id = $1 AND blocked_id = $2 RETURNING *',
        [blockerId, blockedId]
      );
      return result.rowCount > 0;
    } catch (e) {
      console.error('[BLACKLIST] Remove error:', e.message);
      return false;
    }
  }

  /**
   * Get user's blacklist
   */
  async getBlacklist(blockerId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM lfg_blacklist WHERE blocker_id = $1 ORDER BY created_at DESC',
        [blockerId]
      );
      return result.rows;
    } catch (e) {
      console.error('[BLACKLIST] Get error:', e.message);
      return [];
    }
  }

  /**
   * Show blacklist prompt after kick
   */
  createBlacklistPrompt(userId, userId, blockedUsername) {
    const promptId = `bl_prompt_${Date.now()}`;
    
    this.pendingBlacklists.set(promptId, {
      userId,
      userId,
      blockedUsername,
      expiresAt: Date.now() + 60000 // 1 minute
    });

    const embed = new EmbedBuilder()
      .setTitle('🚫 Blacklist Player?')
      .setDescription(`Do you want to **permanently blacklist** **${blockedUsername}** from all your future LFGs?\n\nThey won't be able to join any of your Wagon, Cayo, or Bounty sessions.`)
      .setColor(0xFF6600)
      .setFooter({ text: 'This will apply to ALL your LFGs' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bl_yes_${promptId}`)
        .setLabel('Yes, Blacklist')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚫'),
      new ButtonBuilder()
        .setCustomId(`bl_no_${promptId}`)
        .setLabel('No, Just Kick')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embed, row, promptId };
  }

  /**
   * Show confirmation before final blacklist
   */
  createConfirmation(promptId, blockedUsername) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Blacklist')
      .setDescription(`Are you **absolutely sure** you want to blacklist **${blockedUsername}**?\n\n**This means:**\n• They can NEVER join your LFGs again\n• Applies to Wagon, Cayo, AND Bounty\n• You can undo this with \`?unblock @user\``)
      .setColor(0xFF0000);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bl_confirm_${promptId}`)
        .setLabel('Confirm Blacklist')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⛔'),
      new ButtonBuilder()
        .setCustomId(`bl_cancel_${promptId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embed, row };
  }

  /**
   * Handle blacklist button interactions
   */
  async handleInteraction(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('bl_')) return false;

    const parts = customId.split('_');
    const action = parts[1];
    const promptId = parts.slice(2).join('_');

    const pending = this.pendingBlacklists.get(promptId);
    
    if (!pending) {
      await interaction.reply({ content: '❌ This prompt has expired.', ephemeral: true });
      return true;
    }

    if (interaction.user.id !== pending.userId) {
      await interaction.reply({ content: '❌ Only the host can do this.', ephemeral: true });
      return true;
    }

    switch (action) {
      case 'yes':
        // Show confirmation
        const confirm = this.createConfirmation(promptId, pending.blockedUsername);
        await interaction.update({ embeds: [confirm.embed], components: [confirm.row] });
        break;

      case 'no':
        this.pendingBlacklists.delete(promptId);
        await interaction.update({ 
          embeds: [new EmbedBuilder().setTitle('👢 Kicked Only').setDescription(`${pending.blockedUsername} was kicked but NOT blacklisted.`).setColor(0x00FF00)],
          components: []
        });
        break;

      case 'confirm':
        await this.addToBlacklist(
          pending.userId,
          interaction.user.username,
          pending.userId,
          pending.blockedUsername,
          'Kicked from LFG',
          'lfg'
        );
        this.pendingBlacklists.delete(promptId);
        
        // Try to DM the blocked user
        try {
          const blockedUser = await interaction.client.users.fetch(pending.userId);
          await blockedUser.send({
            embeds: [new EmbedBuilder()
              .setTitle('🚫 You\'ve Been Blacklisted')
              .setDescription(`**${interaction.user.username}** has blacklisted you from their LFG sessions.\n\nYou will not be able to join any of their future Wagon, Cayo, or Bounty sessions.`)
              .setColor(0xFF0000)
            ]
          });
        } catch (e) {}

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('⛔ Blacklisted')
            .setDescription(`**${pending.blockedUsername}** has been permanently blacklisted from all your LFGs.\n\nUse \`?unblock @${pending.blockedUsername}\` in any LFG channel to remove them.`)
            .setColor(0xFF0000)
          ],
          components: []
        });
        break;

      case 'cancel':
        this.pendingBlacklists.delete(promptId);
        await interaction.update({
          embeds: [new EmbedBuilder().setTitle('❌ Cancelled').setDescription('Blacklist cancelled.').setColor(0x888888)],
          components: []
        });
        break;
    }

    return true;
  }

  /**
   * Handle ?myblacklist command
   */
  async handleMyBlacklistCommand(message) {
    const blacklist = await this.getBlacklist(message.author.id);

    if (blacklist.length === 0) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📋 Your LFG Blacklist')
          .setDescription('Your blacklist is empty.\n\nBlacklist players by kicking them from an LFG and selecting "Yes, Blacklist".')
          .setColor(0x888888)
        ]
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Your LFG Blacklist')
      .setDescription(`You have **${blacklist.length}** blacklisted player(s):\n\n` + 
        blacklist.map((b, i) => `${i + 1}. **${b.blocked_username}** - ${new Date(b.created_at).toLocaleDateString()}`).join('\n'))
      .setColor(0xFF6600)
      .setFooter({ text: 'Use ?unblock @user to remove someone' });

    // Create unblock dropdown if there are entries
    const components = [];
    if (blacklist.length > 0 && blacklist.length <= 25) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`bl_unblock_select_${message.author.id}`)
        .setPlaceholder('🔓 Select player to unblock')
        .addOptions(blacklist.map(b => ({
          label: b.blocked_username,
          description: `Blacklisted ${new Date(b.created_at).toLocaleDateString()}`,
          value: b.blocked_id
        })));
      components.push(new ActionRowBuilder().addComponents(select));
    }

    return message.reply({ embeds: [embed], components });
  }

  /**
   * Handle ?unblock @user command
   */
  async handleUnblockCommand(message) {
    const target = message.mentions.users.first();
    
    if (!target) {
      return message.reply('❌ Usage: `?unblock @user`');
    }

    const removed = await this.removeFromBlacklist(message.author.id, target.id);
    
    if (removed) {
      // Notify the unblocked user
      try {
        await target.send({
          embeds: [new EmbedBuilder()
            .setTitle('✅ You\'ve Been Unblocked')
            .setDescription(`**${message.author.username}** has removed you from their LFG blacklist.\n\nYou can now join their sessions again.`)
            .setColor(0x00FF00)
          ]
        });
      } catch (e) {}

      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Unblocked')
          .setDescription(`**${target.username}** can now join your LFGs again.`)
          .setColor(0x00FF00)
        ]
      });
    } else {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Not Found')
          .setDescription(`**${target.username}** wasn't on your blacklist.`)
          .setColor(0xFF0000)
        ]
      });
    }
  }

  /**
   * Handle unblock from dropdown
   */
  async handleUnblockSelect(interaction) {
    if (!interaction.customId.startsWith('bl_unblock_select_')) return false;
    
    const hostId = interaction.customId.replace('bl_unblock_select_', '');
    if (interaction.user.id !== hostId) {
      await interaction.reply({ content: '❌ This isn\'t your blacklist.', ephemeral: true });
      return true;
    }

    const blockedId = interaction.values[0];
    const removed = await this.removeFromBlacklist(hostId, blockedId);

    if (removed) {
      // Try to notify
      try {
        const user = await interaction.client.users.fetch(blockedId);
        await user.send({
          embeds: [new EmbedBuilder()
            .setTitle('✅ You\'ve Been Unblocked')
            .setDescription(`**${interaction.user.username}** has removed you from their LFG blacklist.`)
            .setColor(0x00FF00)
          ]
        });
      } catch (e) {}

      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Unblocked')
          .setDescription(`Player has been removed from your blacklist.`)
          .setColor(0x00FF00)
        ],
        components: []
      });
    }

    return true;
  }

  /**
   * Cleanup expired pending blacklists
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.pendingBlacklists) {
      if (value.expiresAt < now) {
        this.pendingBlacklists.delete(key);
      }
    }
  }
}

// Singleton
let instance = null;

function getBlacklistSystem(pool) {
  if (!instance) {
    instance = new LFGBlacklist(pool);
  }
  return instance;
}

module.exports = { LFGBlacklist, getBlacklistSystem };
