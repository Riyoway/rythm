const { EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, createAudioPlayer, joinVoiceChannel, getVoiceConnection, entersState } = require('@discordjs/voice');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const { queues, playNext } = require('../engine/player');
const { getLocale } = require('../engine/i18n');
const { isDJ, formatDuration, requireVoiceQueue, djBlocked } = require('../engine/helpers');
const config = require('../config.json');

// --- YouTube Playlist URL detection ---
function isYouTubePlaylist(str) {
  return /[?&]list=/.test(str) && /youtube\.com|youtu\.be/.test(str);
}

function extractPlaylistId(str) {
  const match = str.match(/[?&]list=([^&]+)/);
  return match ? match[1] : null;
}

// --- Duration helper ---
function totalSecondsFromQueue(songs, startIndex = 1) {
  return songs.slice(startIndex).reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
}

// --- Create or fetch guild queue ---
async function getOrCreateQueue(message, settings) {
  let queue = queues.get(message.guild.id);
  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
    // Play through brief subscriber gaps (e.g. voice-server moves) instead of
    // auto-pausing, which resumes with stutter/silence packets.
    const player = createAudioPlayer({ behaviors: { noSubscriberBehavior: NoSubscriberBehavior.Play } });
    const savedSettings = (await settings.get(message.guild.id)) || {};
    const vol = savedSettings.defaultvolume !== undefined ? savedSettings.defaultvolume : 100;

    queue = {
      textChannel: message.channel,
      voiceChannel: message.member.voice.channel,
      connection, player,
      songs: [],
      loopMode: 'off',
      forceReplay: false,
      volume: vol,
      playing: true,
      settings, // Cache settings instance for playNext
    };
    queues.set(message.guild.id, queue);
    queue.connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      if (queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();

      const playedMs = queue.startedAt ? Date.now() - queue.startedAt : Infinity;
      const delay = playedMs < 2000 ? 1500 : 0;

      if (queue.forceReplay) {
        queue.forceReplay = false;
      } else if (queue.loopMode === 'song') {
        // keep current
      } else if (queue.loopMode === 'queue') {
        queue.songs.push(queue.songs[0]);
        queue.songs.shift();
      } else {
        queue.songs.shift();
      }

      if (delay > 0) {
        setTimeout(() => playNext(message.guild.id, queue.textChannel), delay);
      } else {
        playNext(message.guild.id, queue.textChannel);
      }
    });

    player.on('error', error => {
      console.error('Player error:', error);
      if (queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();
      queue.songs.shift();
      playNext(message.guild.id, queue.textChannel);
    });

    // Discord periodically moves idle bots to a new voice server. Give it a
    // moment to re-signal; only tear down on a genuine disconnect.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
        // Reconnecting to a new voice server — let it recover.
      } catch {
        if (queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();
        try { connection.destroy(); } catch { /* already destroyed */ }
        queues.delete(message.guild.id);
      }
    });
  }
  return queue;
}

// --- Build "Added to queue" embed matching Rythm screenshot ---
function buildAddedToQueueEmbed(song, queue, m, conf, message) {
  const position = queue.songs.length - 1;
  const estimatedSec = totalSecondsFromQueue(queue.songs, 1);
  const estimatedTime = formatDuration(estimatedSec);
  const channelName = song.author?.name || song.channelName || 'Unknown';

  return new EmbedBuilder()
    .setColor(conf.color)
    .setAuthor({ name: `${m.music['added-to-queue']}`, iconURL: message.author.displayAvatarURL({ extension: 'png' }) })
    .setDescription(`[${song.title}](${song.url})`)
    .setThumbnail(song.thumbnail || conf.thumbnail)
    .addFields([
      { name: m.music.channel, value: channelName, inline: true },
      { name: m.music['song-duration'], value: song.durationRaw || '--:--', inline: true },
      { name: m.music['estimated-time'], value: estimatedTime || '0:00', inline: true },
      { name: m.music['position-in-queue'], value: `${position}`, inline: true },
    ]);
}

module.exports = async function musicCommands(message, args, prefix, settings) {
  const cmd = message.content.toLocaleLowerCase();
  const m = getLocale();
  const s = (await settings.get(message.guild.id)) || {};

  if (await djBlocked(message, s, prefix, ['stop', 'pause', 'pa', 'resume', 're', 'skip', 's', 'skipto', 'loop', 'loopqueue', 'shuffle', 'replay', 'disconnect', 'dc', 'leave'])) return true;

  if (cmd === `${prefix.set}stop` || cmd === `${prefix.set}pause` || cmd === `${prefix.set}pa`) {
    const queue = await requireVoiceQueue(message, m);
    if (!queue) return true;
    if (queue.player.state.status === AudioPlayerStatus.Paused) {
      return message.channel.send(m.music['already-paused']);
    }
    queue.player.pause();
    message.channel.send(m.music.paused);
    return true;
  }

  // !resume / !re
  if (cmd === `${prefix.set}resume` || cmd === `${prefix.set}re`) {
    const queue = await requireVoiceQueue(message, m);
    if (!queue) return true;
    if (queue.player.state.status !== AudioPlayerStatus.Paused) {
      return message.channel.send(m.music['already-resumed']);
    }
    queue.player.unpause();
    message.channel.send(m.music.resume);
    return true;
  }

  // !search / !se
  if (cmd.startsWith(`${prefix.set}search `) || cmd.startsWith(`${prefix.set}se `)) {
    if (cmd.startsWith(`${prefix.set}settings`) || cmd.startsWith(`${prefix.set}seek`)) return false;
    (async () => {
      await message.channel.sendTyping();
      const query = args.join(' ');
      if (!query) return message.channel.send(m.music['nothing-entered']);
      if (!message.member.voice.channel) return message.channel.send(m.music['user-not-in-vc']);

      const yt_info = await yts(query);
      const results = yt_info.videos.slice(0, 10);
      if (!results.length) return message.channel.send(`${m.music['no-result-found']} \`${query}\``);

      const listText = results.map((v, i) => `\`${i + 1}.\` [${v.title}](${v.url}) **[${v.timestamp}]**`).join('\n\n');
      const searchEmbed = new EmbedBuilder()
        .setColor(config.color)
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ extension: 'png' }) })
        .setDescription(listText)
        .setFooter({ text: m.music['search-footer'] });

      await message.channel.send({ embeds: [searchEmbed] });

      const filter = msg => msg.author.id === message.author.id && msg.channel.id === message.channel.id;
      const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async reply => {
        const choice = parseInt(reply.content.trim());
        if (reply.content.trim().toLowerCase() === 'cancel') {
          return message.channel.send(m.music['search-cancelled']);
        }
        if (isNaN(choice) || choice < 1 || choice > results.length) {
          return message.channel.send(m.music['search-invalid']);
        }
        const chosen = results[choice - 1];
        const queue = await getOrCreateQueue(message, settings);

        if (!message.guild.members.me.voice.channel) {
          message.channel.send(m.music.joined.replace('{vc}', message.member.voice.channel.name).replace('{tc}', message.channel));
        }

        const songObj = {
          title: chosen.title,
          url: chosen.url,
          durationRaw: chosen.timestamp,
          durationSeconds: chosen.seconds,
          thumbnail: chosen.thumbnail || config.thumbnail,
          channelName: chosen.author?.name || 'Unknown',
          user: message.author.username,
        };

        if (queue.songs.length === 0) {
          queue.songs.push(songObj);
          playNext(message.guild.id, queue.textChannel);
        } else {
          queue.songs.push(songObj);
          const embed = buildAddedToQueueEmbed(songObj, queue, m, config, message);
          message.channel.send({ embeds: [embed] });
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          message.channel.send(m.music['search-timeout']);
        }
      });
    })();
    return true;
  }

  // !play / !p (no args → invalid usage embed)
  if (cmd === `${prefix.set}play` || cmd === `${prefix.set}p`) {
    await message.channel.sendTyping();
    message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle(':x: Invalid usage')
          .setDescription(`${prefix.set}play [Link or query]`),
      ],
    });
    return true;
  }

  // !play / !p / !playtop / !playskip
  const isPlayTop = cmd.startsWith(`${prefix.set}playtop `);
  const isPlaySkip = cmd.startsWith(`${prefix.set}playskip `);
  const isPlay = cmd.startsWith(`${prefix.set}play `) || cmd.startsWith(`${prefix.set}p `);

  if (isPlayTop || isPlaySkip || isPlay) {
    if (cmd === `${prefix.set}ping` || cmd === `${prefix.set}pa` || cmd === `${prefix.set}pause`) return false;

    (async () => {
      await message.channel.sendTyping();
      const string = args.join(' ');
      if (!string) return message.channel.send(m.music['nothing-entered']);
      if (!message.member.voice.channel) return message.channel.send(m.music['user-not-in-vc']);

      const botMember = message.guild.members.me;
      const botVC = botMember?.voice?.channel;
      if (botVC && botVC.id !== message.member.voice.channel.id) {
        return message.channel.send(m.music['user-not-in-same-vc']);
      }

      // --- PLAYLIST DETECTION ---
      if (isYouTubePlaylist(string)) {
        if (s.djplaylists && !isDJ(message.member, s)) {
          return message.channel.send(':x: **Only DJs can add playlists.**');
        }
        
        // For YouTube playlists, keep the YouTube emoji
        message.channel.send(`${m.music.searching} \`${string}\``);

        try {
          const plResult = await yts({ listId: extractPlaylistId(string) });
          const videos = plResult.videos || [];
          if (!videos.length) return message.channel.send(`${m.music['no-result-found']} \`${string}\``);

          const queue = await getOrCreateQueue(message, settings);
          const positionBefore = queue.songs.length;

          if (!botVC) {
            message.channel.send(m.music.joined.replace('{vc}', message.member.voice.channel.name).replace('{tc}', message.channel));
          }

          for (const video of videos) {
            queue.songs.push({
              title: video.title,
              url: `https://www.youtube.com/watch?v=${video.videoId}`,
              durationRaw: video.duration?.timestamp || '--:--',
              durationSeconds: video.duration?.seconds || 0,
              thumbnail: video.thumbnail || plResult.thumbnail || config.thumbnail,
              channelName: video.author?.name || plResult.author?.name || 'Playlist',
              user: message.author.username,
            });
          }

          if (positionBefore === 0) playNext(message.guild.id, queue.textChannel);

          const totalSec = videos.reduce((a, v) => a + (v.duration?.seconds || 0), 0);
          const embed = new EmbedBuilder()
            .setColor(config.color)
            .setThumbnail(plResult.thumbnail || videos[0]?.thumbnail || config.thumbnail)
            .setAuthor({ name: `${m.music['playlist-added'].title}`, iconURL: message.author.displayAvatarURL({ extension: 'png' }) })
            .setTitle(plResult.title || "Playlist")
            .addFields([
              { name: m.music['playlist-added']['estimated-time'], value: formatDuration(totalSec), inline: true },
              { name: m.music['playlist-added'].position, value: `${positionBefore}`, inline: true },
              { name: m.music['playlist-added'].enqueued, value: `${videos.length} songs`, inline: true },
            ]);
          message.channel.send({ embeds: [embed] });
        } catch (e) {
          console.error('PLAYLIST ERROR:', e);
          message.channel.send(`${m.music['no-result-found']} \`${string}\``);
        }
        return;
      }
      // --- END PLAYLIST ---

      const isYouTube = !/^https?:\/\//.test(string) || /youtube\.com|youtu\.be/.test(string);
      const searchMsg = isYouTube 
        ? m.music.searching 
        : m.music.searching.replace(/<:youtube:\d+>/, '🎵');

      message.channel.send(`${searchMsg} \`${string}\``);

      try {
        let songObj;
        const isUrl = /^https?:\/\//.test(string);

        if (isUrl) {
          // 1. YouTube specific logic (efficient)
          if (/[?&]v=([^&]+)/.test(string) || /youtu\.be\/([^?&]+)/.test(string)) {
            const videoId = string.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
            const info = await yts({ videoId });
            songObj = {
              title: info.title,
              url: info.url,
              durationRaw: info.timestamp,
              durationSeconds: info.seconds,
              thumbnail: info.thumbnail || config.thumbnail,
              channelName: info.author?.name || 'Unknown',
              user: message.author.username,
            };
          } else {
            // 2. Non-YouTube or other generic URL (SoundCloud, Twitch, YouTube Live, etc.)
            const metadata = await youtubedl(string, {
              dumpSingleJson: true,
              noCheckCertificates: true,
              noWarnings: true,
              preferFreeFormats: true,
              addHeader: ['referer:https://www.google.com/']
            });
            songObj = {
              title: metadata.title || 'Unknown Title',
              url: string,
              durationRaw: formatDuration(metadata.duration),
              durationSeconds: metadata.duration || 0,
              thumbnail: metadata.thumbnail || config.thumbnail,
              channelName: metadata.uploader || 'External Source',
              user: message.author.username,
            };
          }
        } else {
          // 3. Keyword search
          const yt_info = await yts(string);
          if (!yt_info.videos || yt_info.videos.length === 0) throw new Error('No result');
          const song = yt_info.videos[0];
          songObj = {
            title: song.title,
            url: song.url,
            durationRaw: song.timestamp,
            durationSeconds: song.seconds,
            thumbnail: song.thumbnail || config.thumbnail,
            channelName: song.author?.name || 'Unknown',
            user: message.author.username,
          };
        }

        const queue = await getOrCreateQueue(message, settings);

        // 2. Check Queue Limits
        if (s.maxqueuelength > 0 && queue.songs.length >= s.maxqueuelength) {
          return message.channel.send(`:x: **The queue is full!** (Max: ${s.maxqueuelength} songs)`);
        }
        if (s.maxusersongs > 0) {
          const userSongs = queue.songs.filter(song => song.user === message.author.username).length;
          if (userSongs >= s.maxusersongs) {
            return message.channel.send(`:x: **You have reached your limit of ${s.maxusersongs} songs in the queue.**`);
          }
        }

        if (!botVC) {
          message.channel.send(m.music.joined.replace('{vc}', message.member.voice.channel.name).replace('{tc}', message.channel));
        }

        // 3. Check Duplicates
        if (s.preventduplicates && queue.songs.some(song => song.url === songObj.url)) {
          return message.channel.send(':x: **This song is already in the queue.**');
        }

        if (isPlaySkip) {
          queue.songs.splice(1, 0, songObj);
          queue.player.stop();
          message.channel.send(`${m.music.playskip} \`${songObj.title}\``);
        } else if (isPlayTop) {
          queue.songs.splice(1, 0, songObj);
          const embed = new EmbedBuilder()
            .setColor(config.color)
            .setDescription(`${m.music.playtop}\n[${songObj.title}](${songObj.url}) \`${songObj.durationRaw}\``)
            .setThumbnail(songObj.thumbnail || config.thumbnail);
          message.channel.send({ embeds: [embed] });
        } else if (queue.songs.length === 0) {
          queue.songs.push(songObj);
          playNext(message.guild.id, queue.textChannel);
        } else {
          queue.songs.push(songObj);
          const embed = buildAddedToQueueEmbed(songObj, queue, m, config, message);
          message.channel.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error('PLAY ERROR:', e);
        message.channel.send(`${m.music['no-result-found']} \`${string}\``);
      }
    })();
    return true;
  }

  // !skip / !s
  if (cmd === `${prefix.set}skip` || cmd === `${prefix.set}s`) {
    const queue = await requireVoiceQueue(message, m);
    if (!queue) return true;
    try {
      queue.player.stop();
      message.channel.send(m.music.skipped);
    } catch (e) {
      queue.connection.destroy();
      queues.delete(message.guild.id);
      message.channel.send(m.music['successfully-dc']);
    }
    return true;
  }

  // !skipto <n>
  if (cmd.startsWith(`${prefix.set}skipto`)) {
    const queue = await requireVoiceQueue(message, m);
    if (!queue) return true;
    const pos = parseInt(args[0]);
    if (isNaN(pos) || pos < 1 || pos >= queue.songs.length) {
      return message.channel.send(m.music['invalid-position']);
    }
    queue.songs.splice(1, pos - 1);
    queue.player.stop();
    message.channel.send(`${m.music.skipto} \`${pos}\``);
    return true;
  }

  // !loop
  if (cmd === `${prefix.set}loop`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    if (queue.loopMode === 'song') {
      queue.loopMode = 'off';
      message.channel.send(m.music['loop-mode'].disabled);
    } else {
      queue.loopMode = 'song';
      message.channel.send(m.music['loop-mode'].enabled);
    }
    return true;
  }

  // !loopqueue
  if (cmd === `${prefix.set}loopqueue`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    if (queue.loopMode === 'queue') {
      queue.loopMode = 'off';
      message.channel.send(m.music['loop-queue-mode'].disabled);
    } else {
      queue.loopMode = 'queue';
      message.channel.send(m.music['loop-queue-mode'].enabled);
    }
    return true;
  }

  // !shuffle
  if (cmd === `${prefix.set}shuffle`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    if (queue.songs.length <= 2) return message.channel.send(m.music['noting-playing']);
    for (let i = queue.songs.length - 1; i > 1; i--) {
      const j = Math.floor(Math.random() * i) + 1;
      [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
    }
    message.channel.send(m.music['queue-shuffle']);
    return true;
  }

  // !replay
  if (cmd === `${prefix.set}replay`) {
    const queue = await requireVoiceQueue(message, m, true);
    if (!queue) return true;
    queue.forceReplay = true;
    queue.player.stop();
    message.channel.send(m.music.replay);
    return true;
  }

  // !disconnect / !dc / !leave
  if (cmd === `${prefix.set}disconnect` || cmd === `${prefix.set}dc` || cmd === `${prefix.set}leave`) {
    await message.channel.sendTyping();
    const botVC = message.guild.members.me?.voice?.channel;
    if (!botVC) return message.channel.send(m.music['noting-playing']);
    const queue = queues.get(message.guild.id);
    if (queue && queue.connection) {
      if (queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();
      queue.connection.destroy();
      queues.delete(message.guild.id);
    } else {
      const connection = getVoiceConnection(message.guild.id);
      if (connection) connection.destroy();
    }
    message.channel.send(m.music['successfully-dc']);
    return true;
  }

  // !join
  if (cmd === `${prefix.set}join`) {
    await message.channel.sendTyping();
    if (!message.member.voice.channel) return message.channel.send(m.music['user-not-in-vc']);
    const botVC = message.guild.members.me?.voice?.channel;
    if (botVC) return message.channel.send(m.music['already-joined']);
    joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
    message.channel.send(m.music.joined.replace('{vc}', message.member.voice.channel.name).replace('{tc}', message.channel));
    return true;
  }

  return false;
};
