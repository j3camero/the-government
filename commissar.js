const config = require('./config');
const database = require('./database');
const DiscordUtil = require('./discord-util');
const log = require('./log');
const moment = require('moment');
const mysql = require('mysql');
const rank = require('./rank');
const TimeUtil = require('./time-util');
const UserCache = require('./commissar-user');

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

// Create a SQL database connection object.
let sqlConnected = false;
const sqlConnection = mysql.createConnection(config.sqlConfig);

// Updates a guild member's color.
function UpdateMemberRankRoles(member, rankName) {
  // Look up the IDs of the 3 big categories.
  const grunts = DiscordUtil.GetRoleByName(member.guild, 'Grunts');
  const officers = DiscordUtil.GetRoleByName(member.guild, 'Officers');
  const generals = DiscordUtil.GetRoleByName(member.guild, 'Generals');
  // Work out which roles are being added and which removed.
  let addThisRole;
  let removeTheseRoles;
  switch (rankName) {
    case 'Grunts':
      addThisRole = grunts;
      removeTheseRoles = [officers, generals];
      break;
    case 'Officers':
      addThisRole = officers;
      removeTheseRoles = [grunts, generals];
      break;
    case 'Generals':
      addThisRole = generals;
      removeTheseRoles = [grunts, officers];
      break;
    default:
      throw `Invalid rank category name: ${rankName}`;
  };
  // Add role.
  if (member._roles.indexOf(addThisRole) < 0) {
    member.addRole(addThisRole);
  }
  // Remove roles.
  removeTheseRoles.forEach((roleToRemove) => {
    if (member._roles.indexOf(roleToRemove) >= 0) {
      member.removeRole(roleToRemove);
    }
  });
}

// Removes forbidden characters from the ends of a string (space, ★, ●).
function StripUsername(username) {
  return username.replace(/★/g, '.').replace(/●/g, '.').trim();
}

// Update the rank of a Discord guild member.
//   rankIndex: the index of the member's new target rank.
//   member: the Discord member object.
//   guild: the Discord guild object.
//   oldUser: the member's old user record.
function ApplyRankToMember(rankIndex, member, guild, oldUser) {
  const guildDB = database.persistentMemory[guild.id];
  if (oldUser.rankLimit) {
    rankIndex = Math.min(rankIndex, oldUser.rankLimit);
  }
  const rank = rankMetaData[rankIndex];
  const nickname = StripUsername(member.user.username) + ' ' + rank.insignia;
  const newUser = {
    nickname,
    rankIndex: rank.index,
    rankLimit: oldUser.rankLimit,
    rankLimitCooldown: oldUser.rankLimitCooldown,
  };
  // Update the participation score.
  const today = TimeUtil.UtcDateStamp();
  const yesterday = TimeUtil.YesterdayDateStamp();
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
  // Update nickname (including rank insignia).
  if (member.nickname != nickname) {
    console.log('Update', nickname);
    member.setNickname(nickname);
  }
  // Update role (including rank color).
  UpdateMemberRankRoles(member, rank.role);
  // If a guild member got promoted, announce it.
  if (oldUser && oldUser.rankIndex && rank.index > oldUser.rankIndex) {
    const msg = `${nickname} is promoted to ${rank.title} ${rank.insignia}`;
    const channel = DiscordUtil.GetMainChatChannel(guild);
    channel.send(msg);
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
    const guildDB = database.persistentMemory[guild.id];
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
  const guildDB = database.persistentMemory[guild.id] || defaultGuildDB;
  const oldUsers = guildDB.users;
  guildDB.users = {};
  database.persistentMemory[guild.id] = guildDB;
  const ranks = rank.GenerateIdealRanksSorted(candidates.length);
  for (let i = candidates.length - 1; i >= 0; --i) {
    const userId = candidates[i].user.id;
    const oldUser = oldUsers[userId] || {};
    ApplyRankToMember(ranks[i], candidates[i], guild, oldUser);
  }
}

// Start a rank limit at 1 (Recruit) for a newly joined member.
function ApplyRankLimit(member) {
  const defaultGuildDB = {
    users: {},
  };
  if (!(member.guild.id in database.persistentMemory)) {
    database.persistentMemory[member.guild.id] = defaultGuildDB;
  }
  const guildDB = database.persistentMemory[member.guild.id];
  if (!(member.user.id in guildDB.users)) {
    guildDB.users[member.user.id] = {};
  }
  const user = guildDB.users[member.user.id];
  user.rankLimit = 1;
  user.rankLimitCooldown = moment().format();
}

// Update the daily participation points for a user.
function MaybeUpdateParticipationPoints(member, guildDB) {
  const user = guildDB.users[member.user.id] || {};
  const today = TimeUtil.UtcDateStamp();
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
}

// Update a user's rank limit, if applicable.
function MaybeUpdateRankLimit(member, guildDB) {
  const user = guildDB.users[member.user.id] || {};
  if (!user.rankLimit || !user.rankLimitCooldown) {
    // This user doesn't have a rank limit. Do nothing.
    return;
  }
  if (!moment(user.rankLimitCooldown).isBefore(moment())) {
    // This user's rank limit is still on cooldown. Do nothing, for now.
    return;
  }
  // Increase the user's rank limit by 1.
  user.rankLimit += 1;
  // Set a new cooldown for 12 hours in the future.
  user.rankLimitCooldown = moment().add(12, 'hours').format();
  // Once the rank limit is high enough, remove it completely.
  if (user.rankLimit >= 10) {
    delete user.rankLimit;
    delete user.rankLimitCooldown;
  }
  guildDB.users[member.user.id] = user;
  console.log('Updated rank limit for', member.nickname);
}

function logVoiceStateUpdate(oldMember, newMember) {
  if (oldMember.voiceChannelID == newMember.voiceChannelID) {
    // The user did not enter or leave a voice chat. Ignore this event.
    return;
  }
  if (oldMember.voiceChannelID) {
    log.info('left vc', {
      action: 'left vc',
      guild: oldMember.guild.id,
      user: oldMember.user.id,
      voiceChannelID: oldMember.voiceChannelID,
    });
  }
  if (newMember.voiceChannelID) {
    log.info('joined vc', {
      action: 'joined vc',
      guild: newMember.guild.id,
      user: newMember.user.id,
      voiceChannelID: newMember.voiceChannelID,
    });
  }
}

// This function triggers periodically for members active in voice chat.
function MemberIsActiveInVoiceChat(member, guildDB) {
  MaybeUpdateParticipationPoints(member, guildDB);
  MaybeUpdateRankLimit(member, guildDB);
}

function AddGuildMembersToSqlDatabase(guild) {
    const guildDB = database.persistentMemory[guild.id];
    for (let member of guild.members.values()) {
	if (!member.user.bot) {
	    const u = guildDB.users[member.user.id];
	    UserCache.CreateNewDatabaseUser(
		sqlConnection,
		member.user.id,
		null,
		member.user.username,
		u.rankIndex,
		u.participationScore,
		u.participationUpdateDate,
		u.rankLimit,
		u.rankLimitCooldown,
		() => {
		    console.log('Successfully added user to database.');
		});
	}
    }
}

function hourHeartbeat(client) {
  // Routine update & backup once per hour.
  if (!sqlConnected) {
    return;
  }
  console.log('Hourly update and backup tiiiime!');
  for (let guild of client.guilds.values()) {
    RankGuildMembers(guild);
    database.SaveBotMemory(guild);
  }
}

function minuteHeartbeat(client) {
  if (!sqlConnected) {
    return;
  }
  // Routinely check the botMemoryNeedsBackup flag and backup if needed.
  if (!database.botMemoryNeedsBackup) {
    return;
  }
  database.botMemoryNeedsBackup = false;
  console.log('Intermittent backup.');
  for (let guild of client.guilds.values()) {
    RankGuildMembers(guild);
    database.SaveBotMemory(guild);
  }
}

function ready(client) {
    console.log('Chatbot started. Connecting to SQL database now.');
    sqlConnection.connect((err) => {
	if (err) {
	    throw err;
	}
	console.log('SQL database connected. Loading commissar user data now.');
	UserCache.LoadAllUsersFromDatabase(sqlConnection, () => {
	    sqlConnected = true;
	    console.log('Commissar user data loaded.');
	    for (let guild of client.guilds.values()) {
		database.LoadBotMemory(guild, () => {
		    RankGuildMembers(guild);
		    //AddGuildMembersToSqlDatabase(guild);
		    database.SaveBotMemory(guild);
		});
	    }
	});
    });
}

function guildMemberAdd(member) {
  console.log('New member joined the server.');
  if (!sqlConnected) {
    return;
  }
  const greeting = `Everybody welcome ${member.user.username} to the server!`;
  const channel = DiscordUtil.GetMainChatChannel(member.guild);
  channel.send(greeting);
  ApplyRankLimit(member);
  RankGuildMembers(member.guild);
  database.SaveBotMemory(member.guild);
}

function guildMemberRemove(member) {
  console.log('Someone quit the server.');
  if (!sqlConnected) {
    return;
  }
  RankGuildMembers(member.guild);
  database.SaveBotMemory(member.guild);
}

function voiceStateUpdate(oldMember, newMember) {
  console.log('voiceStateUpdate', newMember.nickname);
  if (!sqlConnected) {
    return;
  }
  logVoiceStateUpdate(oldMember, newMember);
  const guild = newMember.guild;
  const guildDB = database.persistentMemory[guild.id];
  if (!guildDB || !guildDB.users) {
    // No points because the database isn't loaded.
    return;
  }
  // Detect active voice users.
  const active = DiscordUtil.GetVoiceActiveMembers(guild);
  if (active.length < 2) {
    // No points because there are less than 2 people online & active.
    return;
  }
  // Update all the detected active members.
  active.forEach((member) => {
    MemberIsActiveInVoiceChat(member, guildDB);
  });
  RankGuildMembers(guild);
  database.botMemoryNeedsBackup = true;
}

module.exports = {
  guildMemberAdd,
  guildMemberRemove,
  hourHeartbeat,
  minuteHeartbeat,
  ready,
  voiceStateUpdate,
};
