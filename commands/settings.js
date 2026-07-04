const { EmbedBuilder } = require('discord.js');
const { getLocale } = require('../engine/i18n');
const config = require('../config.json');

// Default settings values
const DEFAULTS = {
  autoplay: false,
  announcesongs: true,
  maxqueuelength: 0, // 0 = disabled
  maxusersongs: 0,   // 0 = disabled
  preventduplicates: false,
  defaultvolume: 100,
  djplaylists: false,
  djonly: false,
  djrole: null,      // role ID
  blacklist: [],     // array of channel IDs
};

async function getGuildSettings(settings, guildId) {
  return { ...DEFAULTS, ...(await settings.get(guildId)) };
}

async function updateGuildSettings(settings, guildId, patch) {
  const current = await getGuildSettings(settings, guildId);
  await settings.set(guildId, { ...current, ...patch });
}

module.exports = async function settingsCommands(message, args, prefix, prefixs, settings, defaultPrefix) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();
  const f = m['other-cmds']['rythm-settings'].field;

  // !settings (main menu)
  if (cmd === `${prefix.set}settings`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const desc = m['other-cmds']['rythm-settings'].desc.replace('{prefix}', prefix.set);
    message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle(m['other-cmds']['rythm-settings'].title)
          .setDescription(desc)
          .addFields([
            { name: f.prefix, value: `\`${prefix.set}settings prefix\``, inline: true },
            { name: f.blacklist, value: `\`${prefix.set}settings blacklist\``, inline: true },
            { name: f.autoplay, value: `\`${prefix.set}settings autoplay\``, inline: true },
            { name: f['announce-songs'], value: `\`${prefix.set}settings announcesongs\``, inline: true },
            { name: f['max-queue-length'], value: `\`${prefix.set}settings maxqueuelength\``, inline: true },
            { name: f['max-user-songs'], value: `\`${prefix.set}settings maxusersongs\``, inline: true },
            { name: f['duplicate-song-prevention'], value: `\`${prefix.set}settings preventduplicates\``, inline: true },
            { name: f['def-volume'], value: `\`${prefix.set}settings defaultvolume\``, inline: true },
            { name: f['dj-only-playlist'], value: `\`${prefix.set}settings djplaylists\``, inline: true },
            { name: f['dj-only'], value: `\`${prefix.set}settings djonly\``, inline: true },
            { name: f['set-dj-role'], value: `\`${prefix.set}settings djrole\``, inline: true },
            { name: f.reset, value: `\`${prefix.set}settings reset\``, inline: true },
          ]),
      ],
    });
    return true;
  }

  // !settings prefix
  if (cmd.startsWith(`${prefix.set}settings prefix`)) {
    await message.channel.sendTyping();
    const setpre = args[1];
    const miss = m.settings.prefix.miss;

    if (!setpre) {
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle(miss.title)
            .setDescription(miss.desc)
            .addFields([
              { name: miss.current, value: `\`${prefix.set}\``, inline: false },
              { name: miss.update, value: `\`${prefix.set}${miss['update-val']}\``, inline: false },
              { name: miss.valid, value: miss['valid-val'], inline: false },
            ]),
        ],
      });
    } else if (setpre.length >= 5) {
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle(miss.title)
            .setDescription(miss.desc)
            .addFields([
              { name: miss.valid, value: miss['valid-val'], inline: false },
            ]),
        ],
      });
    } else {
      prefixs.set(message.guild.id, { set: setpre });
      message.channel.send(`${m.settings.prefix.ok} \`${setpre}\``);
    }
    return true;
  }

  // !settings blacklist [#channel]
  if (cmd.startsWith(`${prefix.set}settings blacklist`)) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const channel = message.mentions.channels.first();

    if (!channel) {
      const list = s.blacklist.length > 0
        ? s.blacklist.map(id => `<#${id}>`).join(', ')
        : 'None';
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle('Rythm Settings - 🚫 Blacklist')
            .setDescription('Prevent Rythm from being used in specific text channels.')
            .addFields([
              { name: '📄 Currently Blacklisted:', value: list, inline: false },
              { name: '✏️ Toggle:', value: `\`${prefix.set}settings blacklist #channel\``, inline: false },
            ]),
        ],
      });
    } else {
      const idx = s.blacklist.indexOf(channel.id);
      if (idx >= 0) {
        s.blacklist.splice(idx, 1);
        await updateGuildSettings(settings, message.guild.id, { blacklist: s.blacklist });
        message.channel.send(`✅ **Removed** <#${channel.id}> **from the blacklist.**`);
      } else {
        s.blacklist.push(channel.id);
        await updateGuildSettings(settings, message.guild.id, { blacklist: s.blacklist });
        message.channel.send(`✅ **Added** <#${channel.id}> **to the blacklist.**`);
      }
    }
    return true;
  }

  // !settings autoplay
  if (cmd === `${prefix.set}settings autoplay`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const newVal = !s.autoplay;
    await updateGuildSettings(settings, message.guild.id, { autoplay: newVal });
    message.channel.send(`🎵 **Autoplay** has been **${newVal ? 'enabled' : 'disabled'}**.`);
    return true;
  }

  // !settings announcesongs
  if (cmd === `${prefix.set}settings announcesongs`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const newVal = !s.announcesongs;
    await updateGuildSettings(settings, message.guild.id, { announcesongs: newVal });
    message.channel.send(`🔔 **Announce Songs** has been **${newVal ? 'enabled' : 'disabled'}**.`);
    return true;
  }

  // !settings maxqueuelength [number|disable]
  if (cmd.startsWith(`${prefix.set}settings maxqueuelength`)) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const val = args[1];

    if (!val) {
      const current = s.maxqueuelength > 0 ? `\`${s.maxqueuelength}\`` : '`Disabled`';
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle('Rythm Settings - :hash: Max Queue Length')
            .setDescription('Limit the number of songs that can be in the queue at once.')
            .addFields([
              { name: '📄 Current Setting:', value: current, inline: false },
              { name: '✏️ Update:', value: `\`${prefix.set}settings maxqueuelength <number|disable>\``, inline: false },
            ]),
        ],
      });
    } else if (val === 'disable' || val === '0') {
      await updateGuildSettings(settings, message.guild.id, { maxqueuelength: 0 });
      message.channel.send(':hash: **Max Queue Length** has been **disabled**.');
    } else {
      const num = parseInt(val);
      if (isNaN(num) || num < 1 || num > 10000) {
        return message.channel.send(':x: **Please enter a number between 1 and 10000, or `disable`.**');
      }
      await updateGuildSettings(settings, message.guild.id, { maxqueuelength: num });
      message.channel.send(`:hash: **Max Queue Length** set to **${num}**.`);
    }
    return true;
  }

  // !settings maxusersongs [number|disable]
  if (cmd.startsWith(`${prefix.set}settings maxusersongs`)) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const val = args[1];

    if (!val) {
      const current = s.maxusersongs > 0 ? `\`${s.maxusersongs}\`` : '`Disabled`';
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle('Rythm Settings - 🔢 Max User Songs')
            .setDescription('Limit the number of songs a single user can have in the queue.')
            .addFields([
              { name: '📄 Current Setting:', value: current, inline: false },
              { name: '✏️ Update:', value: `\`${prefix.set}settings maxusersongs <number|disable>\``, inline: false },
            ]),
        ],
      });
    } else if (val === 'disable' || val === '0') {
      await updateGuildSettings(settings, message.guild.id, { maxusersongs: 0 });
      message.channel.send('🔢 **Max User Songs** has been **disabled**.');
    } else {
      const num = parseInt(val);
      if (isNaN(num) || num < 1 || num > 10000) {
        return message.channel.send(':x: **Please enter a number between 1 and 10000, or `disable`.**');
      }
      await updateGuildSettings(settings, message.guild.id, { maxusersongs: num });
      message.channel.send(`🔢 **Max User Songs** set to **${num}**.`);
    }
    return true;
  }

  // !settings preventduplicates
  if (cmd === `${prefix.set}settings preventduplicates`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const newVal = !s.preventduplicates;
    await updateGuildSettings(settings, message.guild.id, { preventduplicates: newVal });
    message.channel.send(`:notes: **Duplicate Song Prevention** has been **${newVal ? 'enabled' : 'disabled'}**.`);
    return true;
  }

  // !settings defaultvolume [1-200]
  if (cmd.startsWith(`${prefix.set}settings defaultvolume`)) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const val = args[1];

    if (!val) {
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle('Rythm Settings - 🔊 Default Volume')
            .setDescription('Set the default volume for new playback sessions.')
            .addFields([
              { name: '📄 Current Setting:', value: `\`${s.defaultvolume}\``, inline: false },
              { name: '✏️ Update:', value: `\`${prefix.set}settings defaultvolume <1-200>\``, inline: false },
            ]),
        ],
      });
    } else {
      const num = parseInt(val);
      if (isNaN(num) || num < 1 || num > 200) {
        return message.channel.send(':x: **Volume must be between 1 and 200.**');
      }
      await updateGuildSettings(settings, message.guild.id, { defaultvolume: num });
      message.channel.send(`🔊 **Default Volume** set to **${num}**.`);
    }
    return true;
  }

  // !settings djplaylists
  if (cmd === `${prefix.set}settings djplaylists`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const newVal = !s.djplaylists;
    await updateGuildSettings(settings, message.guild.id, { djplaylists: newVal });
    message.channel.send(`🔢 **DJ Only Playlists** has been **${newVal ? 'enabled' : 'disabled'}**.`);
    return true;
  }

  // !settings djonly
  if (cmd === `${prefix.set}settings djonly`) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const newVal = !s.djonly;
    await updateGuildSettings(settings, message.guild.id, { djonly: newVal });
    message.channel.send(`🚷 **DJ Only** mode has been **${newVal ? 'enabled' : 'disabled'}**.`);
    return true;
  }

  // !settings djrole [@role]
  if (cmd.startsWith(`${prefix.set}settings djrole`)) {
    await message.channel.sendTyping();
    const s = await getGuildSettings(settings, message.guild.id);
    const role = message.mentions.roles.first();

    if (!role) {
      const currentRole = s.djrole ? `<@&${s.djrole}>` : '`Not set` (defaults to any role named "DJ")';
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color)
            .setTitle('Rythm Settings - 📃 Set DJ Role')
            .setDescription('Set which role is considered the DJ role for DJ-restricted commands.')
            .addFields([
              { name: '📄 Current Setting:', value: currentRole, inline: false },
              { name: '✏️ Update:', value: `\`${prefix.set}settings djrole @role\``, inline: false },
              { name: '🗑️ Clear:', value: `\`${prefix.set}settings djrole clear\``, inline: false },
            ]),
        ],
      });
    } else {
      await updateGuildSettings(settings, message.guild.id, { djrole: role.id });
      message.channel.send(`📃 **DJ Role** set to <@&${role.id}>.`);
    }

    // Handle "clear"
    if (args[1] === 'clear') {
      await updateGuildSettings(settings, message.guild.id, { djrole: null });
      message.channel.send('📃 **DJ Role** has been **cleared**.');
    }
    return true;
  }

  // !settings reset
  if (cmd === `${prefix.set}settings reset`) {
    await message.channel.sendTyping();
    prefixs.set(message.guild.id, { set: defaultPrefix });
    await settings.set(message.guild.id, { ...DEFAULTS });
    message.channel.send(m['settings-reset']);
    return true;
  }

  return false;
};

// Export helpers for use in other modules
module.exports.getGuildSettings = async function(settings, guildId) {
  return { ...DEFAULTS, ...(await settings.get(guildId)) };
};
