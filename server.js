const commissar = require('./commissar');
const config = require('./config');
const Discord = require('discord.js');

// Set up Discord events.
const client = new Discord.Client();
client.on('ready', () => commissar.ready(client));
client.on('guildMemberAdd', commissar.guildMemberAdd);
client.on('guildMemberRemove', commissar.guildMemberRemove);
client.on('voiceStateUpdate', commissar.voiceStateUpdate);

// Login the Commissar bot to Discord.
client.login(config.discordBotToken);

// Set up heartbeat events for the bot.
setInterval(() => commissar.hourHeartbeat(client), 60 * 60 * 1000);
setInterval(() => commissar.minuteHeartbeat(client), 60 * 1000);
