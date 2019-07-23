const Discord = require('discord.js');
const DiscordStrategy = require('passport-discord').Strategy;
const passport = require('passport');
const rank = require('./rank');
const request = require('request');

const token = '***REMOVED***';

const rankMetaData = [
  {index: 0, title: 'n00b', insignia: '(n00b)', role: null},
  {index: 1, title: 'Recruit', insignia: '●', role: 'Grunts'},
  {index: 2, title: 'Corporal', insignia: '●●', role: 'Grunts'},
  {index: 3, title: 'Sergeant', insignia: '●●●', role: 'Grunts'},
  {index: 4, title: 'Lieutenant', insignia: '●', role: 'Officers'},
  {index: 5, title: 'Captain', insignia: '●●', role: 'Officers'},
  {index: 6, title: 'Major', insignia: '●●●', role: 'Officers'},
  {index: 7, title: 'Colonel', insignia: '●●●●', role: 'Officers'},
  {index: 8, title: 'General', insignia: '★', role: 'Generals'},
  {index: 9, title: 'General', insignia: '★★', role: 'Generals'},
  {index: 10, title: 'General', insignia: '★★★', role: 'Generals'},
  {index: 11, title: 'General', insignia: '★★★★', role: 'Generals'},
];

// Daily decay of 0.9962 implies a half-life of 6 months (183 days).
const participationDecay = 0.9962;

const client = new Discord.Client();

function GetRoleByName(guild, roleName) {
  for (let role of guild.roles.values()) {
    if (role.name === roleName) {
        return role.id;
    }
  }
}

// Update the rank of a Discord guild member.
//   rank: a JSON object with some info about the member's new updated rank.
//   member: the Discord member object.
//   guild: the Discord guild object.
//   oldUser: the member's old user record.
function ApplyRankToMember(rank, member, guild, oldUser) {
  const nickname = member.user.username + ' ' + rank.insignia;
  const guildDB = persistentMemory[guild.id];
  const newUser = {
    nickname,
    rankIndex: rank.index,
  };
  // Update the participation score.
  const today = UtcDateStamp();
  const yesterday = YesterdayDateStamp();
  if (!oldUser || !oldUser.participationScore ||
      !oldUser.participationUpdateDate) {
    // The user has no participation score. Start them off with zero.
    newUser.participationScore = 0;
    // The update date is yesterday in case they want to take part today.
    newUser.participationUpdateDate = yesterday;
  } else if (oldUser.participationUpdateDate !== today &&
             oldUser.participationUpdateDate !== yesterday) {
    // The user has a participation score, but it's from before yesterday.
    const op = oldUser.participationScore;
    // Decay the score.
    newUser.participationScore = op * participationDecay;
    // The update date is yesterday in case they want to take part today.
    newUser.participationUpdateDate = yesterday;
  } else {
    newUser.participationScore = oldUser.participationScore;
    newUser.participationUpdateDate = oldUser.participationUpdateDate;
  }
  guildDB.users[member.user.id] = newUser;
  if (member.user.id == guild.ownerID) {
    // Don't update the owner because it causes permission issues with the bot.
    return;
  }
  if (member.nickname != nickname) {
    console.log('Update', nickname);
    member.setNickname(nickname);
  }
  const role = GetRoleByName(guild, rank.role);
  if (member._roles.indexOf(role) < 0) {
    member.setRoles([role]);
  }
  if (oldUser && oldUser.rankIndex && rank.index > oldUser.rankIndex) {
    const msg = `${nickname} is promoted to ${rank.title} ${rank.insignia}`;
    guild.defaultChannel.send(msg);
    //member.createDM().then(dm => dm.send(msg));
  }
}

function RankGuildMembers(guild) {
  let candidates = [];
  for (let member of guild.members.values()) {
    if (!member.user.bot) {
        candidates.push(member);
    }
  }
  // Sort the guild members for ranking purposes.
  candidates.sort((a, b) => {
    // Users tie with themselves.
    if (a.user.id == b.user.id) {
        return 0;
    }
    // The ower of the guild sorts to the bottom.
    if (a.user.id == guild.ownerID) {
        return -1;
    }
    if (b.user.id == guild.ownerID) {
        return 1;
    }
    // Try to load participation scores from the database.
    const guildDB = persistentMemory[guild.id];
    if (!guildDB || !guildDB.users) {
      // If no database found, revert to pure seniority.
      return b.joinedTimestamp - a.joinedTimestamp;
    }
    const aDB = guildDB.users[a.user.id];
    const bDB = guildDB.users[b.user.id];
    if (!aDB && !bDB) {
      // If no database found, revert to pure seniority.
      return b.joinedTimestamp - a.joinedTimestamp;
    }
    // If one user has a database entry and the other doesn't, they win.
    if (!aDB) {
      return -1;
    }
    if (!bDB) {
      return 1;
    }
    const ap = aDB.participationScore || 0;
    const bp = bDB.participationScore || 0;
    const threshold = 0.0000000001;
    if (Math.abs(ap - bp) <= threshold) {
      // If the participation scores are close to equal, revert to seniority.
      return b.joinedTimestamp - a.joinedTimestamp;
    } else {
      // If all data is available, rank users by participation score.
      return ap - bp;
    }
  });
  console.log('Ranking', candidates.length, 'members.');
  const defaultGuildDB = {
    users: {},
  };
  const guildDB = persistentMemory[guild.id] || defaultGuildDB;
  const oldUsers = guildDB.users;
  guildDB.users = {};
  persistentMemory[guild.id] = guildDB;
  const ranks = rank.GenerateIdealRanksSorted(candidates.length);
  for (let i = candidates.length - 1; i >= 0; --i) {
    const userId = candidates[i].user.id;
    const oldUser = oldUsers[userId] || {};
    ApplyRankToMember(rankMetaData[ranks[i]], candidates[i], guild, oldUser);
  }
}

// Returns a list of text channels with names that match channelName.
function GetAllMatchingTextChannels(guild, channelName) {
  const matchingChannels = [];
  guild.channels.forEach((channel) => {
    if (channel.name === channelName && channel.type === 'text') {
      matchingChannels.push(channel);
    }
  });
  return matchingChannels;
}

function UtcTimeStamp() {
  return new Date().toJSON().substring(0, 19)
    .split('-').join('')
    .split('T').join('')
    .split(':').join('');
}

function UtcDateStamp() {
  return UtcTimeStamp().substring(0, 8);
}

function YesterdayDateStamp() {
  let d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toJSON().substring(0, 10).split('-').join('');
}

// Some JSON keyed by discord guild id. Gets periodically backed to a pinned
// message in a special text chat channel in each guild. When a new instance of
// the bot starts, it loads the latest backup.
const persistentMemory = {};

function SaveBotMemory(guild) {
  console.log('Saving memory for guild', guild.id);
  const matchingChannels = GetAllMatchingTextChannels(guild, 'commissar');
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
      const filename = `commissar-database-${UtcTimeStamp()}.txt`;
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

// Loads the bot's persistent memories. Calls the callback on success.
function LoadBotMemory(guild, callback) {
  console.log('Loading memory for guild', guild.id);
  const matchingChannels = GetAllMatchingTextChannels(guild, 'commissar');
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

// Returns a list of non-muted users active in voice channels right now.
function GetVoiceActiveMembers(guild) {
  let guildActive = [];
  guild.channels.forEach((channel) => {
    if (channel.type === 'voice') {
      const channelActive = [];
      channel.members.forEach((member) => {
        if (!member.mute) {
          channelActive.push(member);
        }
      });
      if (channelActive.length >= 2) {
        guildActive = guildActive.concat(channelActive);
      }
    }
  });
  return guildActive;
}

client.on('ready', () => {
  console.log('Chatbot started.');
  for (let guild of client.guilds.values()) {
    LoadBotMemory(guild, () => {
      RankGuildMembers(guild);
      SaveBotMemory(guild);
    });
  }
});

client.on('guildMemberAdd', member => {
  console.log('New member joined the server.');
  const greeting = 'Everybody welcome ' + member.user.username + ' to the server!';
  member.guild.defaultChannel.send(greeting);
  RankGuildMembers(member.guild);
  SaveBotMemory(member.guild);
});

client.on('guildMemberRemove', member => {
  console.log('Someone quit the server.');
  RankGuildMembers(member.guild);
  SaveBotMemory(guild);
});

client.on('guildMemberSpeaking', (member, speaking) => {
  console.log('guildMemberSpeaking', member.nickname, speaking);
});

client.on('voiceStateUpdate', (oldMember, newMember) => {
  console.log('voiceStateUpdate', newMember.nickname);
  const guild = newMember.guild;
  const guildDB = persistentMemory[guild.id];
  if (!guildDB || !guildDB.users) {
    // No points because the database isn't loaded.
    return;
  }
  // Detect active voice users.
  const active = GetVoiceActiveMembers(guild);
  if (active.length < 2) {
    // No points because there are less than 2 people online & active.
    return;
  }
  // Update all the detected active members.
  active.forEach((member) => {
    const user = guildDB.users[member.user.id] || {};
    const today = UtcDateStamp();
    if (user.participationUpdateDate === today) {
      // No points because this user already got points today.
      console.log('No points for', member.nickname, '!');
      return;
    }
    const op = user.participationScore;
    user.participationScore = 1 - (1 - op) * participationDecay;
    user.participationUpdateDate = today;
    guildDB.users[member.user.id] = user;
    console.log('Gave points to', member.nickname);
  });
  RankGuildMembers(guild);
  botMemoryNeedsBackup = true;
});

client.login(token);

passport.serializeUser(function(user, done) {
  done(null, user);
});
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var scopes = ['identify', 'email', 'connections', 'guilds', 'guilds.join'];

passport.use(new DiscordStrategy({
  clientID: '***REMOVED***',
  clientSecret: '***REMOVED***',
  callbackURL: 'http://secretclan.net/callback',
  scope: scopes
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));

// Routine update & backup once per hour.
setInterval(() => {
  console.log('Hourly update and backup tiiiime!');
  for (let guild of client.guilds.values()) {
    RankGuildMembers(guild);
    SaveBotMemory(guild);
  }
}, 60 * 60 * 1000);

let botMemoryNeedsBackup = false;

// Routine update & backup once per hour.
setInterval(() => {
  if (!botMemoryNeedsBackup) {
    return;
  }
  botMemoryNeedsBackup = false;
  console.log('Intermittent backup.');
  for (let guild of client.guilds.values()) {
    RankGuildMembers(guild);
    SaveBotMemory(guild);
  }
}, 10 * 1000);
