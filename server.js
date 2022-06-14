const Ban = require('./ban');
const BotCommands = require('./bot-commands');
const Clock = require('./clock');
const DB = require('./database');
const deepEqual = require('deep-equal');
const DiscordUtil = require('./discord-util');
const HarmonicCentrality = require('./harmonic-centrality');
const huddles = require('./huddles');
const moment = require('moment');
const Rank = require('./rank');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
const TimeTogetherStream = require('./time-together-stream');
const UserCache = require('./user-cache');

// Used for streaming time matrix data to the database.
const timeTogetherStream = new TimeTogetherStream(new Clock());

// Updates a guild member's color.
async function UpdateMemberRankRoles(member, rankData, goodStanding) {
    let rolesToAdd = rankData.roles;
    let rolesToRemove = [];
    for (const rank of RankMetadata) {
	for (const role of rank.roles) {
	    if (!rolesToAdd.includes(role)) {
		rolesToRemove.push(role);
	    }
	}
    }
    if (goodStanding) {
	rolesToRemove.push(RoleID.Defendant);
    } else {
	rolesToRemove = rolesToRemove.concat(rolesToAdd);
	rolesToAdd = [RoleID.Defendant];
    }
    for (const role of rolesToAdd) {
	await DiscordUtil.AddRole(member, role);
    }
    for (const role of rolesToRemove) {
	await DiscordUtil.RemoveRole(member, role);
    }
}

// Update the rank insignia, nickname, and roles of a Discord guild
// member based on the latest info stored in the user cache.
async function UpdateMemberAppearance(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const cu = await UserCache.GetOrCreateUserByDiscordId(member);
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
    if (rankData.banPower) {
	await DiscordUtil.AddRole(member, RoleID.BanPower);
    } else {
	await DiscordUtil.RemoveRole(member, RoleID.BanPower);
    }
}

const afkLoungeId = '703716669452714054';

// Looks for 2 or more users in voice channels together and credits them.
// Looks in the main Discord Guild only.
async function UpdateVoiceActiveMembersForMainDiscordGuild() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const listOfLists = [];
    for (const [channelId, channel] of guild.channels.cache) {
	if (channel.id === afkLoungeId) {
	    continue;
	}
	if (channel.type !== 'voice') {
	    continue;
	}
	const channelActive = [];
	for (const [memberId, member] of channel.members) {
	    if (member.voice.mute || member.voice.deaf) {
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
    console.log('Voice active members by ID:');
    console.log(listOfLists);
    timeTogetherStream.seenTogether(listOfLists);
}

// Counts the total number of people who are connected to voice chat.
function HowManyPeopleInVoiceChat(guild) {
    let count = 0;
    for (const [channelId, channel] of guild.channels.cache) {
	if (channel.id === afkLoungeId) {
	    continue;
	}
	if (channel.type !== 'voice') {
	    continue;
	}
	for (const [memberId, member] of channel.members) {
	    if (!member.voice.mute && !member.voice.deaf && !member.user.bot) {
		count += 1;
	    }
	}
    }
    return count;
}

// Updates the visibility of the secret Raid voice chat channel.
async function UpdateRaidChannelVisibility() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const pop = HowManyPeopleInVoiceChat(guild);
    const channel = await guild.channels.resolve('967407726424625232');
    if (!channel) {
	throw 'Oh fuck the raid channel is missing!';
    }
    const perms = ['CONNECT', 'VIEW_CHANNEL'];
    if (pop >= 8) {
	if (channel.permissionOverwrites.size !== 5) {
	    await channel.overwritePermissions([
		{ id: RoleID.Bots, allow: perms },
		{ id: RoleID.General, allow: perms },
		{ id: RoleID.Marshal, allow: perms },
		{ id: RoleID.Officer, allow: perms },
		{ id: guild.roles.everyone, deny: perms },
	    ]);
	}
    } else {
	if (channel.permissionOverwrites.size !== 1) {
	    await channel.overwritePermissions([
		{ id: guild.roles.everyone, deny: perms },
	    ]);
	}
    }
}

async function UpdateHarmonicCentrality() {
    const candidates = await UserCache.GetAllCitizenCommissarIds();
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates.';
    }
    const centralityScoresById = await HarmonicCentrality(candidates);
    await UserCache.BulkCentralityUpdate(centralityScoresById);
    const mostCentral = await UserCache.GetMostCentralUsers(66);
    await DiscordUtil.UpdateHarmonicCentralityChatChannel(mostCentral);
}

async function SetGoodStandingIfVerified(cu, member) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const role = await DiscordUtil.GetRoleByName(guild, 'Verified');
    const isVerified = await DiscordUtil.GuildMemberHasRole(member, role);
    const isOnTrial = cu.ban_vote_end_time;
    if (isVerified && !isOnTrial) {
	console.log('Detected Verified role', member.nickname);
	await cu.setGoodStanding(true);
	await DiscordUtil.RemoveRole(member, role);
	await DiscordUtil.RemoveRole(member, RoleID.Unverified);
	await UpdateMemberAppearance(member);
	console.log('Done verifying', member.nickname);
    }
}

async function UpdateAllCitizens() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    await UserCache.ForEach(async (user) => {
	if (user.citizen) {
	    console.log(`Checking user ${user.nickname}`,
			`(ID:${user.commissar_id}).`);
	    let discordMember;
	    try {
		discordMember = await guild.members.fetch(user.discord_id);
	    } catch (error) {
		discordMember = null;
	    }
	    if (!discordMember) {
		await user.setCitizen(false);
		return;
	    }
	    await user.setNickname(discordMember.user.username);
	    await SetGoodStandingIfVerified(user, discordMember);
	    await UpdateMemberAppearance(discordMember);
	}
	// Update ban trial even if the defendant leaves the guild.
	await Ban.UpdateTrial(user);
    });
}

// Enforces a time cap per 16h period between every pair of members. This stops
// idling in Discord from paying off.
async function FilterTimeTogetherRecordsToEnforceTimeCap(timeTogetherRecords) {
    console.log('Enforcing time cap.', timeTogetherRecords.length,
		'input records.');
    const timeMatrix16h = await DB.GetTimeMatrix16h();
    const matchingRecords = [];
    for (const r of timeTogetherRecords) {
	let timeTogether16h = 0;
	if (r.loUserId in timeMatrix16h) {
	    timeTogether16h = timeMatrix16h[r.loUserId][r.hiUserId] || 0;
	}
	if (timeTogether16h < 3600) {
	    matchingRecords.push(r);
	} else {
	    console.log('Enforced time cap:', r.loUserId, r.hiUserId);
	}
    }
    console.log('Enforcing time cap.', matchingRecords.length,
		'output records.');
    return matchingRecords;
}

// Routine update event. Take care of book-keeping that need attention once every few minutes.
async function RoutineUpdate() {
    console.log('Routine update');
    await UpdateHarmonicCentrality();
    await Rank.UpdateUserRanks();
    await UpdateVoiceActiveMembersForMainDiscordGuild();
    await huddles.ScheduleUpdate();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    const timeCappedRecords = await FilterTimeTogetherRecordsToEnforceTimeCap(recordsToSync);
    await DB.WriteTimeTogetherRecords(timeCappedRecords);
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
	if (cu) {
	    await cu.setCitizen(true);
	} else {
	    // We have no record of this Discord user. Create a new record in the cache.
	    console.log('New Discord user detected.');
	    await UserCache.CreateNewDatabaseUser(member);
	    const isCaptchaEnabled = false;
	    if (isCaptchaEnabled) {
		await DiscordUtil.AddRole(member, RoleID.Unverified);
	    } else {
		await DiscordUtil.AddRole(member, RoleID.Verified);
	    }
	}
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
	await huddles.ScheduleUpdate();
	await UpdateRaidChannelVisibility();
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
	await SetGoodStandingIfVerified(cu, newMember);
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

    discordClient.on('debug', console.log);
    discordClient.on('error', console.log);
    discordClient.on('warning', console.log);

    // Set up heartbeat events. These run at fixed intervals of time.
    const oneSecond = 1000;
    const oneMinute = 60 * oneSecond;
    const tenMinutes = 10 * oneMinute;
    // Set up the hour and minute heartbeat routines to run on autopilot.
    setInterval(RoutineUpdate, tenMinutes);
    await RoutineUpdate();
}

Start();
