const { EmbedBuilder } = require('discord.js');
const { getLocale } = require('../engine/i18n');
const config = require('../config.json');

module.exports = async function generalCommands(message, args, prefix, client, settings) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();

  // !ping
  if (cmd === `${prefix.set}ping`) {
    await message.channel.sendTyping();
    message.channel.send(`${m['other-cmds']['ping-pong']} \`${client.ws.ping}ms\``);
    return true;
  }

  // !help
  if (cmd === `${prefix.set}help`) {
    await message.channel.sendTyping();
    const helpTitle = `Rythm ${m['other-cmds'].help.title}`;
    const desc = m['other-cmds'].help.desc.replace('{prefix}', prefix.set);
    message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle(helpTitle)
          .setURL(config.website)
          .setDescription(desc),
      ],
    });
    return true;
  }

  // !commands / !aliases
  if (cmd === `${prefix.set}commands` || cmd === `${prefix.set}aliases`) {
    await message.channel.sendTyping();
    const p = prefix.set;
    const commandList = [
      `\`${p}play <song/url>\` - Play a song by name or URL.`,
      `\`${p}playtop <song>\` - Add a song to the top of the queue.`,
      `\`${p}playskip <song>\` - Skip current song and play the requested song.`,
      `\`${p}search <query>\` - Search for a song and choose from results.`,
      `\`${p}skip\` - Skip the current song.`,
      `\`${p}skipto <pos>\` - Skip to a position in the queue.`,
      `\`${p}pause\` - Pause playback.`,
      `\`${p}resume\` - Resume playback.`,
      `\`${p}disconnect\` - Leave the voice channel.`,
      `\`${p}join\` - Join your voice channel.`,
      `\`${p}np\` - Show the currently playing song.`,
      `\`${p}queue [page]\` - View the queue.`,
      `\`${p}volume <1-200>\` - Set the volume.`,
      `\`${p}seek <time>\` - Seek to a position.`,
      `\`${p}forward [time]\` - Forward playback.`,
      `\`${p}rewind [time]\` - Rewind playback.`,
      `\`${p}loop\` - Toggle song loop.`,
      `\`${p}loopqueue\` - Toggle queue loop.`,
      `\`${p}shuffle\` - Shuffle the queue.`,
      `\`${p}replay\` - Replay the current song.`,
      `\`${p}lyrics\` - Get lyrics for the current song.`,
      `\`${p}clear\` - Clear the queue.`,
      `\`${p}remove <pos>\` - Remove a song from the queue.`,
      `\`${p}move <from> [to]\` - Move a song in the queue.`,
      `\`${p}removedupes\` - Remove duplicate songs.`,
      `\`${p}settings\` - View Rythm settings.`,
      `\`${p}ping\` - Check the bot's latency.`,
      `\`${p}help\` - Show this help message.`,
    ].join('\n');

    message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.color)
          .setTitle('Rythm Commands')
          .setDescription(commandList),
      ],
    });
    return true;
  }

  return false;
};
