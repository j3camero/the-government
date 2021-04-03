const Ban = require('./ban');
const BotCommands = require('./bot-commands');
const Clock = require('./clock');
const DB = require('./database');
const deepEqual = require('deep-equal');
const DiscordUtil = require('./discord-util');
const HarmonicCentrality = require('./harmonic-centrality');
const moment = require('moment');
const Rank = require('./rank');
const RankMetadata = require('./rank-definitions');
const RateLimit = require('./rate-limit');
const TimeTogetherStream = require('./time-together-stream');
const UserCache = require('./user-cache');

// Used for streaming time matrix data to the database.
const timeTogetherStream = new TimeTogetherStream(new Clock());

// Updates a guild member's color.
async function UpdateMemberRankRoles(member, rankData, goodStanding) {
    const grunts = await DiscordUtil.GetRoleByName(member.guild, 'Grunt');
    const officers = await DiscordUtil.GetRoleByName(member.guild, 'Officer');
    const generals = await DiscordUtil.GetRoleByName(member.guild, 'General');
    const marshals = await DiscordUtil.GetRoleByName(member.guild, 'Marshal');
    let addThisRole;
    let removeTheseRoles;
    switch (rankData.role) {
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
	throw `Invalid rank category name: ${rankData.role}`;
    };
    if (goodStanding) {
	await DiscordUtil.AddRole(member, addThisRole);
    } else {
	removeTheseRoles = [grunts, officers, generals, marshals];
    }
    for (const roleToRemove of removeTheseRoles) {
	await DiscordUtil.RemoveRole(member, roleToRemove);
    }
    for (const jobDescription of RankMetadata) {
	const jobRankRole = await DiscordUtil.GetRoleByName(member.guild, jobDescription.rankRole);
	if (jobDescription.rankRole === rankData.rankRole) {
	    await DiscordUtil.AddRole(member, jobRankRole);
	} else {
	    await DiscordUtil.RemoveRole(member, jobRankRole);
	}
    }
}

// Update the rank insignia, nickname, and roles of a Discord guild
// member based on the latest info stored in the user cache.
async function UpdateMemberAppearance(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	console.log('Unknown user detected! username:', member.user.username);
	return;
    }
    if (!cu.citizen) {
	return;
    }
    if (!cu.rank && cu.rank !== 0) {
	// The user has not been assigned a rank yet. Bail.
	return;
    }
    const rankData = RankMetadata[cu.rank];
    if (!rankData) {
	throw 'Invalid rank detected. This can indicate serious problems.';
    }
    const displayName = cu.getNicknameOrTitleWithInsignia();
    if (member.nickname !== displayName && member.user.id !== member.guild.ownerID) {
	console.log(`Updating nickname ${displayName}.`);
	member.setNickname(displayName);
    }
    // Update role (including rank color).
    UpdateMemberRankRoles(member, rankData, cu.good_standing);
}

// Updates people's rank and nickname-based insignia (dots, stars) in Discord.
async function UpdateAllDiscordMemberAppearances() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    console.log('Fetching members to update appearances.');
    const members = await guild.members.fetch();
    console.log('Got members. Updating appearances.');
    members.forEach((member) => {
	UpdateMemberAppearance(member);
    });
}

// Looks for 2 or more users in voice channels together and credits them.
// Looks in the main Discord Guild only.
async function UpdateVoiceActiveMembersForMainDiscordGuild() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    await UpdateVoiceActiveMembersForOneGuild(guild);
}

// Looks for 2 or more users in voice channels together and credits them.
//
// guild - Looks for voice channels in this guild only.
async function UpdateVoiceActiveMembersForOneGuild(guild) {
    const listOfLists = [];
    for (const [channelId, channel] of guild.channels.cache) {
	if (channel.type === 'voice') {
	    const channelActive = [];
	    for (const [memberId, member] of channel.members) {
		if (member.voice.mute || member.voice.deaf || member.voice.streaming) {
		    continue;
		}
		const cu = await UserCache.GetCachedUserByDiscordId(member.user.id);
		if (!cu) {
		    // Shouldn't happen, but ignore and hope for recovery.
		    continue;
		}
		channelActive.push(cu.commissar_id);
	    }
	    if (channelActive.length >= 2) {
		listOfLists.push(channelActive);
	    }
	}
    }
    console.log('Voice active members by ID:');
    console.log(listOfLists);
    timeTogetherStream.seenTogether(listOfLists);
}

async function UpdateHarmonicCentrality() {
    const candidates = await UserCache.GetAllCitizenCommissarIds();
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates.';
    }
    const centralityScoresById = await HarmonicCentrality(candidates);
    await UserCache.BulkCentralityUpdate(centralityScoresById);
    const mostCentral = await UserCache.GetMostCentralUsers(74);
    await DiscordUtil.UpdateHarmonicCentralityChatChannel(mostCentral);
}

async function UpdateAllCitizens() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    await UserCache.ForEach(async (user) => {
	if (user.citizen) {
	    console.log(`Checking user ${user.nickname} (ID:${user.commissar_id}).`);
	    const discordMember = await RateLimit.Run(async () => {
		try {
		    return await guild.members.fetch(user.discord_id);
		} catch (error) {
		    return null;
		}
	    });
	    if (!discordMember) {
		await user.setCitizen(false);
		return;
	    }
	    await user.setNickname(discordMember.user.username);
	    await DestroyFriendSectionForCommissarUser(user, guild);
	    await Ban.UpdateTrial(user);
	}
    });
}

async function DestroyFriendSectionForCommissarUser(cu, guild) {
    if (!cu.friend_category_id) {
	return;
    }
    const section = await guild.channels.resolve(cu.friend_category_id);
    await cu.setFriendCategorityId(null);
    await cu.setFriendTextChatId(null);
    await cu.setFriendVoiceRoomId(null);
}

// The 60-second heartbeat event. Take care of things that need attention each minute.
async function MinuteHeartbeat() {
    if (RateLimit.Busy()) {
	return;
    }
    console.log('Minute heartbeat');
    await UpdateHarmonicCentrality();
    await Rank.UpdateUserRanks();
    await UpdateAllDiscordMemberAppearances();
    await UpdateVoiceActiveMembersForMainDiscordGuild();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    await DB.WriteTimeTogetherRecords(recordsToSync);
}

// The hourly heartbeat event. Take care of things that need attention once an hour.
async function HourlyHeartbeat() {
    console.log('Hourly heartbeat');
    console.log('Consolidating the time matrix.');
    await DB.ConsolidateTimeMatrix();
    await UpdateAllCitizens();
}

// Waits for the database and bot to both be connected, then finishes booting the bot.
async function Start() {
    console.log('Waiting for Discord bot to connect.');
    const discordClient = await DiscordUtil.Connect();
    console.log('Discord bot connected. Waiting for the database to connect.');
    await DB.Connect();
    console.log('Database connected. Loading commissar user data.');
    await UserCache.LoadAllUsersFromDatabase();
    console.log('Commissar user data loaded.');

    // This Discord event fires when someone joins a Discord guild that the bot is a member of.
    discordClient.on('guildMemberAdd', async (member) => {
	console.log('Someone joined the guild.');
	if (member.user.bot) {
	    // Ignore other bots.
	    return;
	}
	const greeting = `Everybody welcome ${member.user.username} to the server!`;
	await DiscordUtil.MessagePublicChatChannel(greeting);
	const cu = await UserCache.GetCachedUserByDiscordId(member.user.id);
	if (!cu) {
	    // We have no record of this Discord user. Create a new record in the cache.
	    console.log('New Discord user detected.');
	    await UserCache.CreateNewDatabaseUser(member);
	    return;
	}
	await cu.setCitizen(true);
    });

    // Emitted whenever a member leaves a guild, or is kicked.
    discordClient.on('guildMemberRemove', async (member) => {
	console.log('Someone left the guild.');
	const cu = await UserCache.GetCachedUserByDiscordId(member.user.id);
	if (!cu) {
	    return;
	}
	await cu.setCitizen(false);
    });

    // Emitted whenever a member is banned from a guild.
    discordClient.on('guildBanAdd', async (guild, user) => {
	console.log('Someone got banned.');
	const cu = await UserCache.GetCachedUserByDiscordId(user.id);
	if (!cu) {
	    return;
	}
	await cu.setCitizen(false);
    });

    // Respond to bot commands.
    discordClient.on('message', async (message) => {
	const cu = await UserCache.GetCachedUserByDiscordId(message.author.id);
	if (!cu) {
	    // Shouldn't happen. Bail and hope for recovery.
	    return;
	}
	await cu.setCitizen(true);
	await BotCommands.Dispatch(message);
    });

    // This Discord event fires when someone joins or leaves a voice chat channel, or mutes,
    // unmutes, deafens, undefeans, and possibly other circumstances as well.
    discordClient.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	console.log('voiceStateUpdate', newVoiceState.member.nickname);
	UpdateVoiceActiveMembersForMainDiscordGuild();
	const cu = await UserCache.GetCachedUserByDiscordId(newVoiceState.member.user.id);
	if (!cu) {
	    // Shouldn't happen. Bail and hope for recovery.
	    return;
	}
	await cu.setCitizen(true);
	await cu.seenNow();
	if (cu.good_standing === false) {
	    await newVoiceState.member.voice.kick();
	}
    });

    // When a user changes their username or other user details.
    discordClient.on('userUpdate', async (oldUser, newUser) => {
	console.log('userUpdate', newUser.username);
	const cu = await UserCache.GetCachedUserByDiscordId(newUser.id);
	await cu.setNickname(newUser.username);
    });

    // When a guild member changes their nickname or other details.
    discordClient.on('guildMemberUpdate', async (oldMember, newMember) => {
	console.log('guildMemberUpdate', newMember.user.username);
	const cu = await UserCache.GetCachedUserByDiscordId(newMember.user.id);
	if (!cu) {
	    return;
	}
	await cu.setNickname(newMember.user.username);
	await cu.setCitizen(true);
    });

    discordClient.on('messageReactionAdd', async (messageReaction, user) => {
	console.log('react', user.username, messageReaction.emoji.name);
	const cu = await UserCache.GetCachedUserByDiscordId(user.id);
	if (!cu) {
	    return;
	}
	await cu.setCitizen(true);
	await Ban.HandlePossibleReaction(messageReaction, user, true);
    });

    discordClient.on('messageReactionRemove', async (messageReaction, user) => {
	console.log('unreact', user.username, messageReaction.emoji.name);
	const cu = await UserCache.GetCachedUserByDiscordId(user.id);
	if (!cu) {
	    return;
	}
	await Ban.HandlePossibleReaction(messageReaction, user, false);
    });

    // Set up heartbeat events. These run at fixed intervals of time.
    const oneSecond = 1000;
    const oneMinute = 60 * oneSecond;
    const oneHour = 60 * oneMinute;
    // Set up the hour and minute heartbeat routines to run on autopilot.
    setInterval(HourlyHeartbeat, oneHour);
    setInterval(MinuteHeartbeat, oneMinute);
    await MinuteHeartbeat();
    await HourlyHeartbeat();
}

Start();
