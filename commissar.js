const Clock = require('./clock');
const config = require('./config');
const db = require('./database');
const deepEqual = require('deep-equal');
const Discord = require('discord.js');
const DiscordUtil = require('./discord-util');
const log = require('./log');
const moment = require('moment');
const rank = require('./rank');
const TimeTogetherStream = require('./time-together-stream');
const TimeUtil = require('./time-util');
const UserCache = require('./commissar-user');

// Create the Discord client. Does not connect yet.
const client = new Discord.Client();

// This flag sets to true once the bot is connected to Discord (but not yet booted).
let discordConnected = false;

// This flag sets to true once the bot is fully booted and ready to handle traffic.
let botActive = false;

// Daily decay of 0.9923 implies a half-life of 3 months (90 days)
// for the participation points.
const participationDecay = 0.9923;

// Used for streaming time matrix data to the database.
const timeTogetherStream = new TimeTogetherStream(new Clock());

// The current chain of command. It's a dict of user info keyed by commissar ID.
// The elements form an implcit tree.
let chainOfCommand = {};

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
	console.log(`Adding role ${addThisRole.name} to ${member.nickname}. `);
	member.addRole(addThisRole)
	    .then((member) => {
		console.log('OK');
	    }).catch((err) => {
		console.log('ERROR!');
	    });
    }
    // Remove roles.
    removeTheseRoles.forEach((roleToRemove) => {
	if (roleToRemove && member._roles.indexOf(roleToRemove) >= 0) {
	    console.log(`Removing role ${roleToRemove.name} from ${member.nickname}. `);
	    member.removeRole(roleToRemove)
		.then((member) => {
		    console.log('OK');
		}).catch((err) => {
		    console.log('ERROR!');
		});
	}
    });
}

// Removes some characters, replaces others.
function FilterUsername(username) {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_` ()!?\'*+/\\:=~èáéíóúüñà';
    const substitutions = {
	'ғ': 'f',
	'ｕ': 'U',
	'ᶜ': 'c',
	'Ќ': 'K',
	'ץ': 'Y',
	'๏': 'o',
	'Ữ': 'u',
	'Ｍ': 'M',
	'Ａ': 'A',
	'ŕ': 'r',
	'Ｋ': 'K',
    };
    let s = '';
    for (let i = 0; i < username.length; i++) {
	const c = username.charAt(i);
	if (allowedChars.indexOf(c) >= 0) {
	    s += c;
	} else if (c in substitutions) {
	    s += substitutions[c];
	}
    }
    const maxNameLength = 18;
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
	const bottomRank = rank.metadata.length - 1;
	UserCache.CreateNewDatabaseUser(db.getConnection(), member.user.id, null, FilterUsername(member.user.username), bottomRank, 0, yesterday, 1, moment().format(), () => {
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
    if (!rankData) {
	console.error('Invalid rank detected. This can indicate serious problems.');
	return;
    }
    if (rankData.titleOverride) {
	// Nickname override for special titles like 'Mr. President'.
	cu.setNickname(`${rankData.abbreviation} ${rankData.title}`);
    } else {
	// Normal case: filter the user's own chosen Discord display name.
	cu.setNickname(FilterUsername(member.user.username));
    }
    const formattedNickname = `${cu.nickname} ${rankData.insignia}`;
    if (member.nickname != formattedNickname && member.user.id !== member.guild.ownerID) {
	console.log(`Updating nickname ${formattedNickname}.`);
	member.setNickname(formattedNickname)
	    .then((member) => {
		console.log('OK');
	    }).catch((err) => {
		console.log('ERROR!');
	    });
    }
    // Update role (including rank color).
    UpdateMemberRankRoles(member, rankData.role);
    // TODO: announce promotions in main chat.
}

function UpdateAllDiscordMemberAppearances(promotions) {
    const guild = DiscordUtil.GetMainDiscordGuild(client);
    guild.members.forEach((member) => {
	UpdateMemberAppearance(member, promotions);
    });
}

// Looks for 2 or more users in voice channels together and credits them.
function UpdateVoiceActiveMembers() {
    const guild = DiscordUtil.GetMainDiscordGuild(client);
    const listOfLists = [];
    guild.channels.forEach((channel) => {
	if (channel.type === 'voice') {
	    const channelActive = [];
	    channel.members.forEach((member) => {
		if (member.mute) {
		    return;
		}
		const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
		if (!cu) {
		    // Shouldn't happen, but ignore and hope for recovery.
		    return;
		}
		channelActive.push(cu.commissar_id);
	    });
	    if (channelActive.length >= 2) {
		listOfLists.push(channelActive);
	    }
	}
    });
    timeTogetherStream.seenTogether(listOfLists);
}

// Announce a promotion in #main chat, if applicable.
//
// nickname - a string of the user's filtered nickname, without insignia.
// oldRank - integer rank index of the user's old rank.
// newRank - integer rank index of the user's new rank.
function AnnounceIfPromotion(nickname, oldRank, newRank) {
    if (oldRank === undefined || oldRank === null ||
	newRank === undefined || newRank === null ||
	!Number.isInteger(oldRank) || !Number.isInteger(newRank) ||
	newRank >= oldRank) {
	// No promotion detected. Bail.
	return;
    }
    const lieutenant = 9;
    if (newRank > lieutenant) {
	// Don't announce promotions for ranks less than Lieutenant.
	return;
    }
    // If we get past here, a promotion has been detected.
    // Announce it in main chat.
    const oldMeta = rank.metadata[oldRank];
    const newMeta = rank.metadata[newRank];
    const message = `${newMeta.abbreviation} ${nickname} ${newMeta.insignia} is promoted from ${oldMeta.title} ${oldMeta.insignia} to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    // Delay for a few seconds to spread out the promotion messages and
    // also achieve a crude non-guaranteed sorting by rank.
    const delayMillis = 1000 * (newRank + Math.random() / 2) + 100;
    setTimeout(() => {
	const guild = DiscordUtil.GetMainDiscordGuild(client);
	const channel = DiscordUtil.GetMainChatChannel(guild);
	channel.send(message);
    }, delayMillis);
}

// Calculates the chain of command. If there are changes, the update is made.
function UpdateChainOfCommand() {
    db.getTimeMatrix((relationships) => {
	const candidateIds = [];
	const guild = DiscordUtil.GetMainDiscordGuild(client);
	guild.members.forEach((member) => {
	    const discordID = member.id;
	    const cu = UserCache.GetCachedUserByDiscordId(discordID);
	    if (!cu) {
		// Unknown user. Leave them out of the rankings.
		return;
	    }
	    candidateIds.push(cu.commissar_id);
	});
	const mrPresident = UserCache.GetUserWithHighestParticipationPoints();
	const newChainOfCommand = rank.CalculateChainOfCommand(mrPresident.commissar_id, candidateIds, relationships);
	if (deepEqual(newChainOfCommand, chainOfCommand)) {
	    // Bail if there are no changes to the chain of command.
	    return;
	}
	console.log('About to update the chain of command');
	// Pass this point only if there is a change to the chain of command.
	chainOfCommand = newChainOfCommand;
	const nicknames = UserCache.GetAllNicknames();
	// Generate and post an updated image of the chain of command.
	const canvas = rank.RenderChainOfCommand(chainOfCommand, nicknames);
	DiscordUtil.UpdateChainOfCommandChatChannel(guild, canvas);
	// Update the people's ranks.
	Object.values(chainOfCommand).forEach((user) => {
	    const cu = UserCache.GetCachedUserByCommissarId(user.id);
	    AnnounceIfPromotion(cu.nickname, cu.rank, user.rank);
	    cu.setRank(user.rank);
	});
	console.log('Chain of command updated.');
    });
}

// This Discord event fires when the bot successfully connects to Discord.
client.on('ready', () => {
    console.log('Discord bot connected.');
    discordConnected = true;
});

// This Discord event fires when someone joins a Discord guild that the bot is a member of.
client.on('guildMemberAdd', (member) => {
    console.log('Someone joined the guild.');
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
	const bottomRank = rank.metadata.length - 1;
	UserCache.CreateNewDatabaseUser(db.getConnection(), member.user.id, null, FilterUsername(member.user.username), bottomRank, 0, yesterday, 1, moment().format(), () => {
	    // New user successfully created. Do nothing, for now. They get picked up in the next ranking cycle.
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
    UpdateVoiceActiveMembers();
});

// Set up a 60-second heartbeat event. Take care of things that need attention each minute.
const oneMinute = 60 * 1000;
setInterval(() => {
    if (!botActive) {
	return;
    }
    console.log('Minute heartbeat');
    // Update the chain of command.
    const promotions = UpdateChainOfCommand();
    // Update the nickname, insignia, and roles of the members of the Discord channel.
    UpdateAllDiscordMemberAppearances(promotions);
    // Sync user data to the database.
    UserCache.WriteDirtyUsersToDatabase(db.getConnection());
    // Update time matrix and sync to database.
    UpdateVoiceActiveMembers();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    db.writeTimeTogetherRecords(recordsToSync);
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
    });
}

waitForEverythingToConnect();
