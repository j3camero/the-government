// Routines for saving and loading the bot's memory.
const Discord = require('discord.js');
const DiscordUtil = require('./discord-util');
const request = require('request');
const TimeUtil = require('./time-util');

// Some JSON keyed by discord guild id. Gets periodically backed to a pinned
// message in a special text chat channel in each guild. When a new instance of
// the bot starts, it loads the latest backup.
const persistentMemory = {};

// A 'dirty' flag that can be flipped to indicate that memory should be backed
// up to database.
let botMemoryNeedsBackup = false;

// Save the bot memory to a special chat channel. Only saves the memory for
// one guild.
function SaveBotMemory(guild) {
  console.log('Saving memory for guild', guild.id);
  const matchingChannels = DiscordUtil.GetAllMatchingTextChannels(guild, 'commissar');
  if (matchingChannels.length < 1) {
    console.log('No commissar channel found. Cannot sync user data.');
    return;
  }
  if (matchingChannels.length > 1) {
    console.log('More than 1 commissar channel found. Cannot sync user data.');
    return;
  }
  const channel = matchingChannels[0];
  channel.fetchPinnedMessages()
    .then((pinned) => {
      if (pinned.size > 1) {
        console.log('Too many pinned messages found. Can\'t save.');
        return;
      }
      const memoriesJson = persistentMemory[guild.id] || {};
      const serialized = JSON.stringify(memoriesJson, null, 2);
      const buffer = Buffer.from(serialized, 'utf8');
      const filename = `commissar-database-${TimeUtil.UtcTimeStamp()}.txt`;
      const attachment = new Discord.Attachment(buffer, filename);
      if (pinned.size === 1) {
        const message = pinned.first();
        message.delete();
      }
      channel.send('My memories', attachment).then((message) => {
        message.pin();
        console.log('Save success');
      });
    })
    .catch(console.error);
}

// Loads the bot's persistent memories. Calls the callback on success. Only
// loads memories for one guild.
function LoadBotMemory(guild, callback) {
  console.log('Loading memory for guild', guild.id);
  const matchingChannels = DiscordUtil.GetAllMatchingTextChannels(guild, 'commissar');
  if (matchingChannels.length < 1) {
    console.log('No commissar channel found. Cannot sync user data.');
    return;
  }
  if (matchingChannels.length > 1) {
    console.log('More than 1 commissar channel found. Cannot sync user data.');
    return;
  }
  const channel = matchingChannels[0];
  channel.fetchPinnedMessages()
    .then((pinned) => {
      if (pinned.size !== 1) {
        console.log('No memory to load. Continuing.');
        callback();
        return;
      }
      const message = pinned.first();
      if (message.attachments.size !== 1) {
        console.log('Too many attachments found. Can\'t load memory.');
        return;
      }
      const attachment = message.attachments.first();
      const useragent = 'Commissar Bot (Jeff Cameron) <cameron.jp@gmail.com>';
      request.get({
        url: attachment.url,
        json: true,
        headers: { 'User-Agent': useragent }
      }, (err, res, data) => {
        if (err) {
          console.log('Error downloading attachment:', err);
        } else if (res.statusCode !== 200) {
          console.log('Bad status downloading attachment:', res.statusCode);
        } else {
          persistentMemory[guild.id] = data;
          console.log('Load success.');
          callback();
        }
      });
    })
    .catch(console.error);
}

module.exports = {
  LoadBotMemory,
  persistentMemory,
  SaveBotMemory,
};
