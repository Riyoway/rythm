const { getLocale } = require('../engine/i18n');
const { getVoiceConnection } = require('@discordjs/voice');
const { queues } = require('../engine/player');

module.exports = async function ownerCommands(message, args, prefix, client, settings) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();

  // !sync — Hot-reload all command/engine modules without restarting
  if (cmd === `${prefix.set}sync`) {
    await message.channel.sendTyping();
    if (message.author.id !== process.env.OWNER_ID) {
      return message.channel.send(m['not-owner']);
    }
    try {
      // --- Disconnect from voice channel if connected ---
      const connection = getVoiceConnection(message.guild.id);
      if (connection) {
        const queue = queues.get(message.guild.id);
        if (queue && queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();
        connection.destroy();
        queues.delete(message.guild.id);
      }

      // Clear require cache for all reloadable modules
      const path = require('path');
      const base = path.resolve(__dirname, '..');
      const modulePaths = [
        'commands/settings.js',
        'commands/music.js',
        'commands/playback.js',
        'commands/queue.js',
        'commands/general.js',
        'commands/owner.js',
        'engine/player.js',
        'engine/helpers.js',
        'engine/i18n.js',
      ];
      for (const mod of modulePaths) {
        const fullPath = path.resolve(base, mod);
        delete require.cache[require.resolve(fullPath)];
      }
      message.channel.send('🔄 **Synced!** *All modules reloaded*');
    } catch (e) {
      console.error('SYNC ERROR:', e);
      message.channel.send(`❌ **Sync failed:** \`${e.message}\``);
    }
    return true;
  }

  return false;
};
