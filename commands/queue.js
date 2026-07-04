const { EmbedBuilder } = require('discord.js');
const { getLocale } = require('../engine/i18n');
const { requireVoiceQueue, djBlocked } = require('../engine/helpers');
const config = require('../config.json');
const pagequeue = require('../functions/pagequeue');

module.exports = async function queueCommands(message, args, prefix, client, settings) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();
  const s = (await settings.get(message.guild.id)) || {};

  if (await djBlocked(message, s, prefix, ['clear', 'remove', 'move', 'removedupes'])) return true;

  const isQ = cmd === `${prefix.set}q` || cmd.startsWith(`${prefix.set}q `) || cmd === `${prefix.set}queue` || cmd.startsWith(`${prefix.set}queue `);
  if (isQ) {
    const queue = await requireVoiceQueue(message, m);
    if (!queue) return true;

    const songStrings = [];
    for (let i = 1; i < queue.songs.length; i++) {
      const s = queue.songs[i];
      songStrings.push(`\`${i}.\` [${s.title}](${s.url}) | ${s.durationRaw} - ${m.music['queue-desc']['requested-by']} ${s.user}\n`);
    }

    const pagesNum = Math.ceil(Math.max(queue.songs.length, 1) / 10) || 1;
    const queueLoopOn = queue.loopMode === 'queue' ? '✅' : '❌';
    const songLoopOn = queue.loopMode === 'song' ? '✅' : '❌';

    const queueTitle = `${m.music['queue-title']} ${message.guild.name}`;

    const pages = [];
    for (let i = 0; i < pagesNum; i++) {
      const str = songStrings.slice(i * 10, i * 10 + 10).join('');
      const embed = new EmbedBuilder()
        .setTitle(queueTitle)
        .setColor(config.color)
        .setDescription(
          `${m.music['queue-desc']['now-playing']}\n` +
          `[${queue.songs[0].title}](${queue.songs[0].url}) | ${queue.songs[0].durationRaw} ${m.music['queue-desc']['requested-by']} ${queue.songs[0].user}\n\n` +
          `${m.music['queue-desc']['up-next']}${str === '' ? `  ${m.music['queue-desc'].nothing}` : '\n' + str}\n\n` +
          `**${queue.songs.length} ${m.music['queue-desc']['songs-in-queue']}**\n`
        )
        .setFooter({ text: `Page ${i + 1}/${pagesNum} | Loop: ${songLoopOn} | Queue Loop: ${queueLoopOn}` });
      pages.push(embed);
    }

    if (!args[0]) {
      if (pages.length > 1) pagequeue(client, message, pages, 60000, queue.songs.length, 'N/A');
      else message.channel.send({ embeds: [pages[0]] });
    } else {
      if (isNaN(args[0])) return message.channel.send(m.music['queue-must-be-a-number']);
      if (args[0] > pagesNum) {
        return message.channel.send(m.music['queue-only-pages'].replace('{pages}', pagesNum));
      }
      const pageNum = args[0] == 0 ? 1 : args[0] - 1;
      message.channel.send({ embeds: [pages[pageNum]] });
    }
    return true;
  }

  // !clear
  if (cmd === `${prefix.set}clear`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    queue.songs.splice(1);
    message.channel.send(m.music.cleared);
    return true;
  }

  // !remove <n>
  if (cmd.startsWith(`${prefix.set}remove`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const pos = parseInt(args[0]);
    if (isNaN(pos) || pos < 1 || pos >= queue.songs.length) {
      return message.channel.send(m.music['invalid-position']);
    }
    const removed = queue.songs.splice(pos, 1)[0];
    message.channel.send(`${m.music.removed} \`${removed.title}\``);
    return true;
  }

  // !move <from> [to]
  if (cmd.startsWith(`${prefix.set}move`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const from = parseInt(args[0]);
    const to = parseInt(args[1]) || 1;
    if (isNaN(from) || from < 1 || from >= queue.songs.length) {
      return message.channel.send(m.music['invalid-position']);
    }
    const [movedSong] = queue.songs.splice(from, 1);
    queue.songs.splice(to, 0, movedSong);
    message.channel.send(`${m.music.moved} \`${movedSong.title}\` → \`${to}\``);
    return true;
  }

  // !removedupes
  if (cmd === `${prefix.set}removedupes`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const seen = new Set([queue.songs[0].url]);
    const before = queue.songs.length;
    queue.songs = [queue.songs[0], ...queue.songs.slice(1).filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })];
    if (before === queue.songs.length) return message.channel.send(m.music['no-dupes']);
    message.channel.send(m.music.removedupes);
    return true;
  }

  return false;
};
