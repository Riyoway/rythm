const { EmbedBuilder } = require('discord.js');
const { queues, getPlaybackPosition, playNext } = require('../engine/player');
const { generateProgressBar, formatDuration, parseTime, cleanSongTitle, requireVoiceQueue, djBlocked } = require('../engine/helpers');
const { getLocale } = require('../engine/i18n');
const lyricsFinder = require('lyrics-finder');
const config = require('../config.json');

module.exports = async function playbackCommands(message, args, prefix, settings) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();
  const s = (await settings.get(message.guild.id)) || {};

  if (await djBlocked(message, s, prefix, ['volume', 'vol', 'v', 'seek', 'forward', 'ff', 'rewind', 'rw'])) return true;

  if (cmd === `${prefix.set}np` || cmd === `${prefix.set}nowplaying`) {
    const queue = queues.get(message.guild.id);
    await message.channel.sendTyping();
    if (!queue || queue.songs.length === 0) return message.channel.send(m.music['noting-playing']);
    const song = queue.songs[0];
    const currentPos = getPlaybackPosition(queue);
    const totalDuration = song.durationSeconds || 0;
    const bar = generateProgressBar(currentPos, totalDuration);
    const embed = new EmbedBuilder()
      .setColor(config.color)
      .setDescription(
        `${m.music['now-playing'].title}\n` +
        `[${song.title}](${song.url})\n\n` +
        `${bar}\n\n` +
        `${m.music['now-playing'].time} \`${formatDuration(currentPos)} / ${song.durationRaw}\`\n` +
        `${m.music['requested-by']} ${song.user}`
      )
      .setThumbnail(song.thumbnail || config.thumbnail);
    message.channel.send({ embeds: [embed] });
    return true;
  }

  // !volume / !vol / !v
  if (cmd.startsWith(`${prefix.set}volume`) || cmd.startsWith(`${prefix.set}vol`) || cmd.startsWith(`${prefix.set}v`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    if (!args[0]) {
      return message.channel.send(`${m.music['volume-set']} \`${queue.volume || 100}\``);
    }
    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 1 || vol > 200) {
      return message.channel.send(m.music['volume-invalid']);
    }
    queue.volume = vol;
    await settings.set(message.guild.id, { ...(await settings.get(message.guild.id)), volume: vol });
    if (queue.currentResource && queue.currentResource.volume) {
      queue.currentResource.volume.setVolume(vol / 100);
    }
    message.channel.send(`${m.music['volume-set']} \`${vol}\``);
    return true;
  }

  // !seek
  if (cmd.startsWith(`${prefix.set}seek`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const seekTo = parseTime(args[0]);
    if (isNaN(seekTo)) return message.channel.send(m.music['invalid-position']);
    playNext(message.guild.id, queue.textChannel, seekTo);
    message.channel.send(`${m.music.seeked} \`${formatDuration(seekTo)}\``);
    return true;
  }

  // !forward / !ff
  if (cmd.startsWith(`${prefix.set}forward`) || cmd.startsWith(`${prefix.set}ff`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const fwdAmount = parseTime(args[0]) || 10;
    const newPos = getPlaybackPosition(queue) + fwdAmount;
    playNext(message.guild.id, queue.textChannel, newPos);
    message.channel.send(`${m.music.forwarded} \`${formatDuration(newPos)}\``);
    return true;
  }

  // !rewind / !rw
  if (cmd.startsWith(`${prefix.set}rewind`) || cmd.startsWith(`${prefix.set}rw`)) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    const rwAmount = parseTime(args[0]) || 10;
    const newPos = Math.max(0, getPlaybackPosition(queue) - rwAmount);
    playNext(message.guild.id, queue.textChannel, newPos);
    message.channel.send(`${m.music.rewound} \`${formatDuration(newPos)}\``);
    return true;
  }

  // !lyrics / !l / !lyric
  if (cmd === `${prefix.set}lyric` || cmd === `${prefix.set}l` || cmd === `${prefix.set}lyrics`) {
    (async () => {
      const queue = await requireVoiceQueue(message, m, true);
      if (!queue) return;
      try {
        const song = queue.songs[0];
        let titleToSearch = song.title;
        let artistToSearch = song.channelName || '';

        if (titleToSearch.includes(' - ')) {
          const parts = titleToSearch.split(' - ');
          artistToSearch = parts[0];
          titleToSearch = parts.slice(1).join(' - ');
        }

        const cleanedArtist = cleanSongTitle(artistToSearch);
        const cleanedTitle = cleanSongTitle(titleToSearch);
        const searchDisplay = cleanedArtist ? `${cleanedArtist} - ${cleanedTitle}` : cleanedTitle;

        message.channel.send(`${m.music['searching-lyrics']} \`${searchDisplay}\``);

        let lyrics = await lyricsFinder(cleanedArtist, cleanedTitle);
        if (!lyrics || lyrics === 'none') {
          lyrics = await lyricsFinder('', `${cleanedArtist} ${cleanedTitle}`.trim());
        }

        if (!lyrics) lyrics = 'none';
        if (lyrics.length > 2048) return message.channel.send(m.music['lyrics-long-to-display']);
        if (lyrics === 'none') return message.channel.send(m.music['lyrics-not-found']);
        message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(song.title)
              .setDescription(lyrics)
              .setThumbnail(song.thumbnail || config.thumbnail)
              .setColor(config.color)
              .setFooter({ text: `${m.music['requested-by']} ${message.author.username}`, iconURL: message.author.displayAvatarURL({ extension: 'png' }) }),
          ],
        });
      } catch {
        message.channel.send(m.music['lyrics-not-found']);
      }
    })();
    return true;
  }

  return false;
};
