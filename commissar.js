const config = require('./config');
const db = require('./database');
const Discord = require('discord.js');
const DiscordUtil = require('./discord-util');
const log = require('./log');
const moment = require('moment');
const rank = require('./rank');
const TimeUtil = require('./time-util');
const UserCache = require('./commissar-user');

// Create the Discord client. Does not connect yet.
const client = new Discord.Client();

// This flag sets to true once the bot is connected to Discord (but not yet booted).
let discordConnected = false;

// This flag sets to true once the bot is fully booted and ready to handle traffic.
let botActive = false;

// Daily decay of 0.9962 implies a half-life of 6 months (183 days)
// for the participation points.
const participationDecay = 0.9962;

// Updates a guild member's color.
function UpdateMemberRankRoles(member, rankName) {
  // Look up the IDs of the 4 big categories.
  const grunts = DiscordUtil.GetRoleByName(member.guild, 'Grunt');
  const officers = DiscordUtil.GetRoleByName(member.guild, 'Officer');
  const generals = DiscordUtil.GetRoleByName(member.guild, 'General');
  const marshals = DiscordUtil.GetRoleByName(member.guild, 'Marshal');
  // Work out which roles are being added and which removed.
  let addThisRole;
  let removeTheseRoles;
  switch (rankName) {
    case 'Grunt':
      addThisRole = grunts;
      removeTheseRoles = [officers, generals, marshals];
      break;
    case 'Officer':
      addThisRole = officers;
      removeTheseRoles = [grunts, generals, marshals];
      break;
    case 'General':
      addThisRole = generals;
      removeTheseRoles = [grunts, officers, marshals];
      break;
    case 'Marshal':
      addThisRole = marshals;
      removeTheseRoles = [grunts, officers, generals];
      break;
    default:
      throw `Invalid rank category name: ${rankName}`;
  };
  // Add role.
  if (addThisRole && member._roles.indexOf(addThisRole) < 0) {
    member.addRole(addThisRole);
  }
  // Remove roles.
  removeTheseRoles.forEach((roleToRemove) => {
    if (roleToRemove && member._roles.indexOf(roleToRemove) >= 0) {
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

// Update the daily participation points for a user.
function MaybeUpdateParticipationPoints(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
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
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
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

// This function triggers periodically for members active in voice chat.
function MemberIsActiveInVoiceChat(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    MaybeUpdateParticipationPoints(member);
    MaybeUpdateRankLimit(member);
}

function logVoiceStateUpdate(oldMember, newMember) {
  if (oldMember.user.bot || newMember.user.bot) {
    // Ignore other bots.
  }
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

// Update the rank insignia, nickname, and roles of a Discord guild
// member based on the latest info stored in the user cache.
function UpdateMemberAppearance(member, promotions) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	// We have no record of this Discord user. Create a new record in the cache.
	console.log('New Discord user detected.');
	const yesterday = TimeUtil.YesterdayDateStamp();
	UserCache.CreateNewDatabaseUser(db.getConnection(), member.user.id, null, FilterUsername(member.user.username), 1, 0, yesterday, 1, moment().format(), () => {
	    // Try updating the member again after the new user record has been created.
	    UpdateMemberAppearance(member, promotions);
	});
	return;
    }
    if (!cu.rank) {
	// The user has not been assigned a rank yet. Bail.
	return;
    }
    const rankData = rank.metadata[cu.rank];
    const nickname = FilterUsername(member.user.username);
    cu.setNickname(nickname);
    const nickname_with_insignia = nickname + ' ' + rankData.insignia;
    if (member.nickname != nickname_with_insignia && member.user.id !== member.guild.ownerID) {
	console.log('Updated nickname', nickname_with_insignia);
	member.setNickname(nickname_with_insignia);
    }
    // Update role (including rank color).
    UpdateMemberRankRoles(member, rankData.role);
    // If a guild member got promoted, announce it.
    const promoted = promotions.includes(cu.commissar_id);
    if (promoted) {
	const msg = `${nickname_with_insignia} is promoted to ${rankData.title} ${rankData.insignia}`;
	console.log(msg);
	const channel = DiscordUtil.GetMainChatChannel(member.guild);
	channel.send(msg);
    }
}

function UpdateAllDiscordMemberAppearances(promotions) {
    client.guilds.forEach((guild) => {
	guild.members.forEach((member) => {
	    UpdateMemberAppearance(member, promotions);
	});
    });
}

function SetupRolesInNewGuild(guild) {
    console.log('Setting up roles in guild', guild.name);
    const gruntPermissions = [
	'READ_MESSAGES', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS',
	'ATTACH_FILES', 'READ_MESSAGE_HISTORY', 'ADD_REACTIONS',
	'CONNECT', 'SPEAK', 'USE_VAD',
    ];
    const officerPermissions = gruntPermissions.concat([
	'USE_EXTERNAL_EMOJIS',
    ]);
    const generalPermissions = officerPermissions.concat([
	'CREATE_INSTANT_INVITE',
    ]);
    guild.createRole({
	color: '#3ccc1a',
	hoist: true,
	mentionable: false,
	name: 'Marshal',
	permissions: generalPermissions,
    });
    guild.createRole({
	color: 'GOLD',
	hoist: true,
	mentionable: false,
	name: 'General',
	permissions: generalPermissions,
    });
    guild.createRole({
	color: '#d40000',
	hoist: true,
	mentionable: false,
	name: 'Officer',
	permissions: officerPermissions,
    });
    guild.createRole({
	color: '#1750e2',
	hoist: true,
	mentionable: false,
	name: 'Grunt',
	position: 0,
	permissions: gruntPermissions,
    });
    console.log('Created roles.');
    const msg = ('Commissar is happy to be here. Check `Server Settings > Roles` to see ' +
		 'your colorful new rank system. You level up by voice chatting with ' +
		 'your comrades. Set permissions on any chatroom to only allow those with ' +
		 'high enough rank. Tip: keep the new roles high in your role ordering ' +
		 'for best effect. The Commissar role must stay above the others.');
    const channel = DiscordUtil.GetMainChatChannel(guild);
    channel.send(msg);
}

// This Discord event fires when the bot successfully connects to Discord.
client.on('ready', () => {
    console.log('Discord bot connected.');
    discordConnected = true;
});

// This Discord event fires when someone joins a Discord guild that the bot is a member of.
client.on('guildMemberAdd', (member) => {
    console.log('Someone joined a guild.');
    if (!botActive) {
	return;
    }
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const greeting = `Everybody welcome ${member.user.username} to the server!`;
    const channel = DiscordUtil.GetMainChatChannel(member.guild);
    channel.send(greeting);
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	// We have no record of this Discord user. Create a new record in the cache.
	console.log('New Discord user detected.');
	const yesterday = TimeUtil.YesterdayDateStamp();
	UserCache.CreateNewDatabaseUser(db.getConnection(), member.user.id, null, FilterUsername(member.user.username), 1, 0, yesterday, 1, moment().format(), () => {
	    // Nothing to do for new users at this time.
	    // They get picked up in the next ranking cycle.
	});
    }
});

// This Discord event fires when someone joins or leaves a voice chat channel, or mutes,
// unmutes, deafens, undefeans, and possibly other circumstances as well.
client.on('voiceStateUpdate', (oldMember, newMember) => {
    console.log('voiceStateUpdate', newMember.nickname);
    if (!botActive) {
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
});

client.on('guildCreate', (guild) => {
    console.log('Joined a new guild:', guild.name);
    const requiredPermissions = [
	'MANAGE_ROLES', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES', 'SEND_MESSAGES',
	'ATTACH_FILES', 'ADD_REACTIONS', 'SPEAK', 'READ_MESSAGES',
	'EMBED_LINKS', 'READ_MESSAGE_HISTORY', 'CONNECT', 'USE_VAD',
    ];
    // Wait a few seconds to let the bot's permissions kick in.
    setTimeout(() => {
	console.log('Checking for minimum permissions.');
	const satisfied = guild.me.hasPermission(requiredPermissions);
	if (satisfied) {
	    console.log('Minimum permissions satisfied.');
	    SetupRolesInNewGuild(guild);
	} else {
	    console.log('Minimum permissions not satisfied. Leaving guild.');
	    const msg = 'Commissar needs more permissions to work. Invite me again using http://secretclan.net';
	    const channel = DiscordUtil.GetMainChatChannel(guild);
	    channel.send(msg);
	    setTimeout(() => {
		// Storm out in a huff.
		guild.leave();
	    }, 2000);
	}
    }, 10 * 1000);
});

// Set up a 60-second heartbeat event. Take care of things that need attention each minute.
const oneMinute = 60 * 1000;
setInterval(() => {
    if (!botActive) {
	return;
    }
    console.log('Minute heartbeat');
    // Routine backup.
    UserCache.WriteDirtyUsersToDatabase(db.getConnection());
    // Sort and rank the clan members all together.
    const promotions = UserCache.UpdateRanks();
    // Update the nickname, insignia, and roles of the members of the Discord channels.
    UpdateAllDiscordMemberAppearances(promotions);
}, oneMinute);

// Set up an hourly heartbeat event. Take care of things that need
// attention once an hour.
const oneHour = 60 * oneMinute;
setInterval(() => {
    if (!botActive) {
	return;
    }
    console.log('Hourly heartbeat');
    // Participation points decay slowly over time.
    UserCache.MaybeDecayParticipationPoints();
}, oneHour);

// Login the Commissar bot to Discord.
console.log('Connecting the Discord bot.');
client.login(config.discordBotToken);

// Waits for the database and bot to both be connected, then finishes booting the bot.
function waitForEverythingToConnect() {
    console.log('Waiting for everything to connect.', db.isConnected(), discordConnected);
    if (!db.isConnected() || !discordConnected) {
	setTimeout(waitForEverythingToConnect, 1000);
	return;
    }
    console.log('Everything connected.');
    console.log('Loading commissar user data.');
    UserCache.LoadAllUsersFromDatabase(db.getConnection(), () => {
	console.log('Commissar user data loaded.');
	console.log('Commissar is alive.');
	// Now the bot is booted and open for business!
	botActive = true;
	UserCache.UpdateRanks();
    });
}

waitForEverythingToConnect();
