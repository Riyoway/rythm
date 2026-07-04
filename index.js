// === Rythm Bot - Entry Point ===
require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const Keyv = require('keyv');

// Database
const prefixs = new Keyv('sqlite://db.sqlite', { table: 'pre' });
const settings = new Keyv('sqlite://db.sqlite', { table: 'settings' });
prefixs.on('error', err => console.error('Keyv connection error:', err));

// Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 24/7 Keep-alive
const app = express();
app.get('/', (req, res) => {
  let count = 0;
  client.guilds.cache.forEach(guild => { count += guild.memberCount });
  res.send(`> **I'm Alive!**\n> • Guild: ${client.guilds.cache.size}\n> • User: ${count}\n> • Ping: ${client.ws.ping}`);
});
app.listen(process.env.PORT || 3000, () => { });

// Ready
client.once('clientReady', () => {
  console.log(`login with ${client.user.tag} account`);
  console.log('all ok');
  client.user.setPresence({ status: 'idle' });
  client.user.setActivity('new website! https://rythm-fm.netlify.app/', { type: ActivityType.Playing });
});

// Command Router — lazy require() so !sync hot-reload works
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const args = message.content.split(' ').slice(1);
  const cfg = require('./config.json');
  const prefix = (await prefixs.get(message.guild.id)) || { set: cfg.prefix };

  // --- 1. Global Blacklist Check ---
  const s = (await settings.get(message.guild.id)) || {};
  if (s.blacklist && s.blacklist.includes(message.channel.id)) {
    if (!message.member.permissions.has('Administrator')) return;
  }

  // Lazy require — picks up fresh modules after !sync
  const settingsCommands = require('./commands/settings');
  const musicCommands = require('./commands/music');
  const playbackCommands = require('./commands/playback');
  const queueCommands = require('./commands/queue');
  const generalCommands = require('./commands/general');
  const ownerCommands = require('./commands/owner');

  if (await settingsCommands(message, args, prefix, prefixs, settings, cfg.prefix)) return;
  if (await musicCommands(message, args, prefix, settings)) return;
  if (await playbackCommands(message, args, prefix, settings)) return;
  if (await queueCommands(message, args, prefix, client, settings)) return;
  if (await generalCommands(message, args, prefix, client, settings)) return;
  if (await ownerCommands(message, args, prefix, client, settings)) return;
});

// Deploy
client.login(process.env.TOKEN);