const config = require('./config');
const DiscordUtil = require('./discord-util');
const log = require('./log');
const moment = require('moment');
const mysql = require('mysql');
const rank = require('./rank');
const TimeUtil = require('./time-util');
const UserCache = require('./commissar-user');

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

// Removes some characters, replaces others.
function FilterUsername(username) {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_` ()!?\'*+/\\:=~';
    let s = '';
    for (let i = 0; i < username.length; i++) {
	const c = username.charAt(i);
	if (allowedChars.indexOf(c) >= 0) {
	    s += c;
	}
    }
    const maxNameLength = 16;
    s = s.trim().slice(0, maxNameLength).trim();
    if (s.length === 0) {
	s = '???';
    }
    return s;
}

// Update the rank of a Discord guild member.
//   rankIndex: the index of the member's new target rank.
//   member: the Discord member object.
//   guild: the Discord guild object.
function ApplyRankToMember(rankIndex, member, guild) {
  const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
  if (cu.rank_limit) {
      rankIndex = Math.min(rankIndex, cu.rank_limit);
  }
  const rankData = rank.metadata[rankIndex];
    const nickname = FilterUsername(member.user.username)
  if (nickname !== cu.nickname) {
    cu.setNickname(nickname);
  }
  if (rankData.index !== cu.rank) {
    cu.setRank(rankData.index);
  }
  // Update the participation score.
  const today = TimeUtil.UtcDateStamp();
  const yesterday = TimeUtil.YesterdayDateStamp();
  if (!moment(cu.participation_update_date).isSame(today, 'day') &&
      !moment(cu.participation_update_date).isSame(yesterday, 'day')) {
    // The user has a participation score, but it's from before yesterday.
    const op = cu.participation_score;
    // Decay the score.
    cu.setParticipationScore(op * participationDecay);
    // The update date is yesterday in case they want to take part today.
    cu.setParticipationUpdateDate(yesterday);
  }
  // Update nickname (including rank insignia).
  const nickname_with_insignia = nickname + ' ' + rankData.insignia;
  if (member.nickname != nickname_with_insignia) {
    console.log('Update', nickname_with_insignia);
    member.setNickname(nickname_with_insignia);
  }
  // Update role (including rank color).
  UpdateMemberRankRoles(member, rankData.role);
  // If a guild member got promoted, announce it.
  // if (oldUser && oldUser.rankIndex && rankData.index > oldUser.rankIndex) {
  //  const msg = `${nickname_with_insignia} is promoted to ${rankData.title} ${rankData.insignia}`;
  //  const channel = DiscordUtil.GetMainChatChannel(guild);
  //  channel.send(msg);
  //}
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
    // Load participation scores from the user cache.
    const au = UserCache.GetCachedUserByDiscordId(a.user.id);
    const bu = UserCache.GetCachedUserByDiscordId(b.user.id);
    if (!au && !bu) {
      // If no database found, revert to pure seniority.
      return b.joinedTimestamp - a.joinedTimestamp;
    }
    // If one user has a database entry and the other doesn't, they win.
    if (!au) {
      return -1;
    }
    if (!bu) {
      return 1;
    }
    const ap = au.participation_score || 0;
    const bp = bu.participation_score || 0;
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
  const ranks = rank.GenerateIdealRanksSorted(candidates.length);
  for (let i = candidates.length - 1; i >= 0; --i) {
    ApplyRankToMember(ranks[i], candidates[i], guild);
  }
}

// Update the daily participation points for a user.
function MaybeUpdateParticipationPoints(member) {
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	return;
    }
    const today = TimeUtil.UtcDateStamp();
    if (moment(cu.participation_update_date).isSame(today, 'day')) {
	// No points because this user already got points today.
	console.log('No points for', member.nickname, '!');
	return;
    }
    const op = cu.participation_score;
    cu.setParticipationScore(1 - (1 - op) * participationDecay);
    cu.setParticipationUpdateDate(today);
    console.log('Gave points to', member.nickname);
}

// Update a user's rank limit, if applicable.
function MaybeUpdateRankLimit(member) {
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu.rank_limit || !cu.rank_limit_cooldown) {
	// This user doesn't have a rank limit. Do nothing.
	return;
    }
    if (!moment(cu.rank_limit_cooldown).isBefore(moment())) {
	// This user's rank limit is still on cooldown. Do nothing, for now.
	return;
    }
    // Increase the user's rank limit by 1.
    cu.setRankLimit(cu.rank_limit + 1);
    // Set a new cooldown for 12 hours in the future.
    cu.setRankLimitCooldown(moment().add(12, 'hours').format());
    // Once the rank limit is high enough, remove it completely.
    if (cu.rank_limit >= 14) {
	cu.setRankLimit(null);
	cu.setRankLimitCooldown(null);
    }
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
function MemberIsActiveInVoiceChat(member) {
  MaybeUpdateParticipationPoints(member);
  MaybeUpdateRankLimit(member);
}

function minuteHeartbeat(client) {
  if (!sqlConnected) {
    return;
  }
  // Routine backup once per minute.
  UserCache.WriteDirtyUsersToDatabase(sqlConnection);
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
		RankGuildMembers(guild);
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
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	// We have no record of this Discord user. Create a new record in the cache.
	const yesterday = TimeUtil.YesterdayDateStamp();
	UserCache.CreateNewDatabaseUser(sqlConnection, member.user.id, null, FilterUsername(member.user.username), 1, 0, yesterday, 1, moment.format(), () => {
	    RankGuildMembers(member.guild);
	});
    }
}

function guildMemberRemove(member) {
    console.log('Someone quit the server.');
    if (!sqlConnected) {
	return;
    }
    RankGuildMembers(member.guild);
}

function voiceStateUpdate(oldMember, newMember) {
  console.log('voiceStateUpdate', newMember.nickname);
  if (!sqlConnected) {
    return;
  }
  logVoiceStateUpdate(oldMember, newMember);
  const guild = newMember.guild;
  // Detect active voice users.
  const active = DiscordUtil.GetVoiceActiveMembers(guild);
  if (active.length < 2) {
    // No points because there are less than 2 people online & active.
    return;
  }
  // Update all the detected active members.
  active.forEach((member) => {
    MemberIsActiveInVoiceChat(member);
  });
  RankGuildMembers(guild);
}

module.exports = {
  guildMemberAdd,
  guildMemberRemove,
  minuteHeartbeat,
  ready,
  voiceStateUpdate,
};
