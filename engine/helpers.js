
/**
 * Generate a text progress bar like [▬▬▬🔘▬▬▬▬▬▬]
 */
function generateProgressBar(current, total, length = 20) {
  if (!total || total === 0) return `[${'▬'.repeat(length)}]`;
  const progress = Math.max(0, Math.min(length - 1, Math.round((current / total) * length)));
  const empty = length - progress - 1;
  const bar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(Math.max(0, empty));
  return `[${bar}]`;
}

/**
 * Format seconds to mm:ss or hh:mm:ss
 */
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parse a time string like "1:30", "90", "1m30s" into seconds
 */
function parseTime(str) {
  if (!str) return NaN;
  // mm:ss or hh:mm:ss
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  // plain number (seconds)
  const num = Number(str);
  if (!isNaN(num)) return num;
  return NaN;
}

/**
 * Clean a song title for better search results (remove "Official Video", brackets, etc.)
 */
function cleanSongTitle(title) {
  if (!title) return '';
  return title
    .replace(/\(.*?\)/g, '') // Remove everything in parentheses
    .replace(/\[.*?\]/g, '') // Remove everything in brackets
    .replace(/\s(feat\.|ft\.|featuring)\s.*/gi, '') // Remove "feat. Artist" suffix
    .replace(/Official\s*Video|Official\s*Audio|Lyrics|Video|Audio/gi, '') // Keywords
    .replace(/\s{2,}/g, ' ') // Remove double spaces
    .replace(/^[\s\-\|]+|[\s\-\|]+$/g, '') // Remove leading/trailing dashes/pipes
    .trim();
}
/**
 * Check if a member is a DJ.
 */
function isDJ(member, s) {
  if (member.permissions.has('Administrator')) return true;
  if (s.djrole && member.roles.cache.has(s.djrole)) return true;
  if (!s.djrole && member.roles.cache.some(r => r.name.toLowerCase() === 'dj')) return true;
  return false;
}

/**
 * Shared voice/queue guard used by nearly every playback command.
 * Sends the matching error and returns null on failure, else the guild queue.
 * @param {boolean} songs also require a non-empty queue
 */
async function requireVoiceQueue(message, m, songs = false) {
  const { queues } = require('./player'); // lazy: avoids helpers<->player cycle
  const queue = queues.get(message.guild.id);
  await message.channel.sendTyping();
  const fail = key => { message.channel.send(m.music[key]); return null; };
  if (!queue || (songs && queue.songs.length === 0)) return fail('noting-playing');
  if (!message.member.voice.channel) return fail('user-not-in-vc');
  if (message.guild.members.me.voice.channel !== message.member.voice.channel) return fail('user-not-in-same-vc');
  return queue;
}

/**
 * DJ-only gate. Returns true (and warns) when djonly is on and the caller
 * isn't a DJ for one of the restricted base commands.
 */
async function djBlocked(message, s, prefix, djOnlyCmds) {
  const baseCmd = message.content.slice(prefix.set.length).split(' ')[0].toLowerCase();
  if (s.djonly && djOnlyCmds.includes(baseCmd) && !isDJ(message.member, s)) {
    await message.channel.sendTyping();
    message.channel.send(':x: **This command is restricted to DJs only.**');
    return true;
  }
  return false;
}

module.exports = {
  generateProgressBar,
  formatDuration,
  parseTime,
  cleanSongTitle,
  isDJ,
  requireVoiceQueue,
  djBlocked,
};
