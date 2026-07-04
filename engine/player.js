const { createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const youtubedl = require('youtube-dl-exec');
const yts = require('yt-search');
const { getLocale } = require('./i18n');
const { formatDuration } = require('./helpers');

const queues = new Map();

/**
 * Play the next song in queue, optionally seeking to a specific offset.
 */
async function playNext(guildId, textChannel, seekSeconds = 0) {
  const queue = queues.get(guildId);
  if (!queue || !queue.connection) return;

  if (queue.songs.length === 0) {
    const m = getLocale();

    // Check for Autoplay
    const savedSettings = queue.settings ? (await queue.settings.get(guildId)) || {} : {};
    if (savedSettings.autoplay && queue.lastPlayedUrl) {
      try {
        const searchResult = await yts({ videoId: queue.lastPlayedUrl.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || queue.lastPlayedUrl });
        if (searchResult && searchResult.videos && searchResult.videos.length > 0) {
          // Very simple related search for autoplay
          const related = await yts(searchResult.videos[0].title);
          const nextSong = related.videos.find(v => v.url !== queue.lastPlayedUrl) || related.videos[0];
          if (nextSong) {
            queue.songs.push({
              title: nextSong.title,
              url: nextSong.url,
              durationRaw: nextSong.timestamp,
              durationSeconds: nextSong.seconds,
              thumbnail: nextSong.thumbnail,
              channelName: nextSong.author?.name || 'Autoplay',
              user: 'Autoplay',
            });
            return playNext(guildId, textChannel);
          }
        }
      } catch (e) {
        console.error('Autoplay error:', e);
      }
    }

    textChannel.send(m.music['queue-ended']);
    setTimeout(() => {
      const checkQueue = queues.get(guildId);
      if (checkQueue && checkQueue.songs.length === 0) {
        checkQueue.connection.destroy();
        queues.delete(guildId);
      }
    }, 60000);
    return;
  }

  const song = queue.songs[0];
  try {
    if (queue.audioProcess && !queue.audioProcess.killed) queue.audioProcess.kill();
    if (queue.ffmpegProcess && !queue.ffmpegProcess.killed) queue.ffmpegProcess.kill();

    const ytdlArgs = {
      o: '-',
      q: '',
      f: 'bestaudio',
      // ponytail: no -r rate cap — throttling the download starves the realtime
      // pipe on network dips, which is heard as stutter. Pipe backpressure from
      // the player already keeps it near realtime.
    };

    queue.audioProcess = youtubedl.exec(song.url, ytdlArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
    queue.audioProcess.catch(() => { /* Ignore child process kill exceptions */ });

    let inputStream = queue.audioProcess.stdout;

    // If seeking, pipe through ffmpeg to skip the beginning
    if (seekSeconds > 0) {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-ss', seekSeconds.toString(),
        '-f', 'mp3',
        '-acodec', 'libmp3lame',
        'pipe:1',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      ffmpeg.on('error', (err) => console.error('FFmpeg spawn error:', err));
      ffmpeg.stdin.on('error', (err) => {
        // Ignore EPIPE/EOF as they are expected if ffmpeg finishes or is killed
        if (err.code !== 'EPIPE' && err.code !== 'EOF') {
          console.error('FFmpeg stdin error:', err);
        }
      });

      // Log stderr for debugging
      let ffmpegStderr = '';
      ffmpeg.stderr.on('data', (data) => { ffmpegStderr += data.toString(); });
      ffmpeg.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`FFmpeg exited with code ${code}. Stderr: ${ffmpegStderr}`);
        }
      });

      queue.audioProcess.stdout.pipe(ffmpeg.stdin);
      inputStream = ffmpeg.stdout;
      queue.ffmpegProcess = ffmpeg;
    }

    const resource = createAudioResource(inputStream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    // Apply current volume setting
    if (queue.volume !== undefined) {
      resource.volume.setVolume(queue.volume / 100);
    }

    queue.currentResource = resource;
    queue.startedAt = Date.now();
    queue.seekOffset = seekSeconds;
    queue.lastPlayedUrl = song.url;
    queue.player.play(resource);

    // Only announce if not seeking (seeking is silent)
    if (seekSeconds === 0) {
      const savedSettings = queue.settings ? (await queue.settings.get(guildId)) || {} : {};
      if (savedSettings.announcesongs !== false) {
        const m = getLocale();
        textChannel.send(m.music.playing.replace('{title}', song.title));
      }
    }
  } catch (error) {
    console.error('Error generating stream:', error);
    await new Promise(r => setTimeout(r, 1500));
    queue.songs.shift();
    playNext(guildId, textChannel);
  }
}

/**
 * Get the current playback position in seconds.
 */
function getPlaybackPosition(queue) {
  if (!queue || !queue.startedAt) return 0;
  const elapsed = (Date.now() - queue.startedAt) / 1000;
  return Math.floor(elapsed + (queue.seekOffset || 0));
}

module.exports = { queues, playNext, getPlaybackPosition };
