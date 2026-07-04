# rythm

A self-hosted Discord music bot that recreates the old Rythm bot — same prefix commands, same look. It plays from YouTube (search, links, playlists) and most other sources that yt-dlp supports.

This is a personal reproduction built for learning. It isn't affiliated with the original Rythm.

## Requirements

- Node 18 or newer

FFmpeg and yt-dlp are pulled in automatically on install (`ffmpeg-static` and `youtube-dl-exec`), so there's nothing else to set up.

## Setup

Create a bot in the [Discord developer portal](https://discord.com/developers/applications) and copy its token. Under Privileged Gateway Intents, turn on **Message Content** — the bot can't read any commands without it. Invite the bot with the Send Messages, Connect, and Speak permissions.

Then:

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```dotenv
TOKEN=your-bot-token
OWNER_ID=your-discord-user-id   # needed for the !sync command
# PORT=3000                     # optional
```

Start it with `npm start` (or double-click `start.bat` on Windows).

## Configuration

Secrets and anything that changes per install live in `.env`:

- `TOKEN` — the bot token.
- `OWNER_ID` — your user ID; only this account can run `!sync`.
- `PORT` — port for the keep-alive server, defaults to 3000.

`config.json` only holds cosmetic defaults and is safe to commit: the default `prefix`, embed `color`, the `website` link shown in `!help`, and a fallback `thumbnail` used when a track has no artwork.

Note that `config.json` is cached at startup, so edit it and restart to pick up changes.

## Commands

The default prefix is `!` and can be changed per server with `!settings prefix`. Aliases are listed next to each command.

**Playing**

| Command | Does |
| --- | --- |
| `play`, `p` `<query/url>` | Play or queue a song, link, or playlist |
| `playtop` `<query>` | Add to the top of the queue |
| `playskip` `<query>` | Skip the current song and play this now |
| `search`, `se` `<query>` | Search and pick a result by number |
| `join` | Join your voice channel |
| `disconnect`, `dc`, `leave` | Leave the channel |

**Controls**

| Command | Does |
| --- | --- |
| `pause`, `pa` / `resume`, `re` | Pause / resume |
| `skip`, `s` | Skip the current song |
| `skipto` `<n>` | Skip to a position in the queue |
| `seek` `<time>` | Jump to a timestamp, e.g. `1:30` |
| `forward`, `ff` / `rewind`, `rw` `[secs]` | Jump forward / back, 10s by default |
| `volume`, `vol`, `v` `<1-200>` | Set volume (no argument shows the current one) |
| `loop` / `loopqueue` | Loop the song / the whole queue |
| `shuffle` | Shuffle the queue |
| `replay` | Restart the current song |

**Queue and info**

| Command | Does |
| --- | --- |
| `nowplaying`, `np` | Show the current song with a progress bar |
| `lyrics`, `l`, `lyric` | Fetch lyrics for the current song |
| `queue`, `q` `[page]` | Show the queue |
| `clear` | Empty the queue |
| `remove` `<n>` | Remove a song |
| `move` `<from> [to]` | Move a song |
| `removedupes` | Drop duplicate songs |

**Other**

| Command | Does |
| --- | --- |
| `help` | Basic help |
| `commands`, `aliases` | Full command list |
| `ping` | Show latency |
| `sync` | Owner only — hot-reload the modules without restarting |

## Server settings

`!settings` opens the menu; change any item with `!settings <item>`. Settings are stored per server.

| Item | Does |
| --- | --- |
| `prefix <text>` | Change the prefix (up to 4 characters) |
| `blacklist [#channel]` | Toggle a channel where the bot is ignored |
| `autoplay` | Keep playing related songs after the queue ends |
| `announcesongs` | Toggle the "now playing" message |
| `maxqueuelength <n\|disable>` | Cap the queue size |
| `maxusersongs <n\|disable>` | Cap songs per user |
| `preventduplicates` | Block songs already in the queue |
| `defaultvolume <1-200>` | Starting volume for new sessions |
| `djplaylists` | Restrict adding playlists to DJs |
| `djonly` | Restrict playback controls to DJs |
| `djrole [@role\|clear]` | Set the DJ role |
| `reset` | Restore defaults |

When `djonly` is on, playback controls are limited to DJs. Someone counts as a DJ if they have the Administrator permission, have the role set with `djrole`, or — if no role is set — have a role simply named "DJ".

## Staying online

There's a small HTTP server that responds on `/` with the current guild count, user count, and ping. Point an uptime pinger at it to keep free hosts from sleeping.

## Data

Per-server prefixes and settings are kept in `db.sqlite` (via Keyv). It's runtime data, so it's gitignored rather than committed.

## License

MIT
