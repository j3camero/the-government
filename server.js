const AutoUpdate = require('./auto-update');
const Ban = require('./ban');
const BanVoteCache = require('./ban-vote-cache');
const BotCommands = require('./bot-commands');
const Clock = require('./clock');
const com = require('./chain-of-command');
const DB = require('./database');
const deepEqual = require('deep-equal');
const { ContextMenuCommandBuilder, Events, ApplicationCommandType } = require('discord.js');
const DiscordUtil = require('./discord-util');
const exile = require('./exile-cache');
const fetch = require('./fetch');
const HarmonicCentrality = require('./harmonic-centrality');
const huddles = require('./huddles');
const moment = require('moment');
const RankMetadata = require('./rank-definitions');
const recruiting = require('./recruiting');
const RoleID = require('./role-id');
const rules = require('./rules');
const TimeTogetherStream = require('./time-together-stream');
const UserCache = require('./user-cache');
const yen = require('./yen');
const zerg = require('./zerg');

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
    const rank = cu.getRank();
    const rankData = RankMetadata[rank];
    if (!rankData) {
	throw 'Invalid rank detected. This can indicate serious problems.';
    }
    const displayName = cu.getNicknameOrTitleWithInsignia();
    if (member.nickname !== displayName && member.user.id !== member.guild.ownerId) {
	console.log(`Updating nickname ${displayName}.`);
	await member.setNickname(displayName);
    }
    // Update role (including rank color).
    UpdateMemberRankRoles(member, rankData, cu.good_standing);
    if (rankData.banPower) {
	await DiscordUtil.AddRole(member, RoleID.BanPower);
    } else {
	await DiscordUtil.RemoveRole(member, RoleID.BanPower);
    }
    // Retired Generals.
    const hasRankData = (cu.rank || cu.rank === 0) && (cu.peak_rank || cu.peak_rank === 0);
    const hasBeenAGeneralEver = cu.peak_rank <= 15;
    const isCurrentlyAGeneral = cu.rank <= 15;
    if (hasRankData && hasBeenAGeneralEver && !isCurrentlyAGeneral) {
	await DiscordUtil.AddRole(member, RoleID.RetiredGeneral);
    } else {
	await DiscordUtil.RemoveRole(member, RoleID.RetiredGeneral);
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
	if (channel.type !== 2) {
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
	    await cu.updateCalendarDayCount();
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

async function UpdateHarmonicCentrality() {
    const candidates = await UserCache.GetAllCitizenCommissarIds();
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates.';
    }
    const centralityScoresById = await HarmonicCentrality(candidates);
    await UserCache.BulkCentralityUpdate(centralityScoresById);
}

async function UpdateUser(cu, guild) {
    await Ban.UpdateTrial(cu);
    if (!cu.citizen) {
	return;
    }
    let discordMember;
    try {
	discordMember = await guild.members.fetch(cu.discord_id);
    } catch (error) {
	discordMember = null;
    }
    if (!discordMember) {
	await cu.setCitizen(false);
	return;
    }
    await cu.setNickname(discordMember.user.username);
    await UpdateMemberAppearance(discordMember);
}

function RandomSample(arr, k) {
    const n = arr.length;
    if (k >= n) {
	return arr;
    }
    const sample = [];
    for (let i = 0; i < n && k > 0; i++) {
	const p = k / (n - i);
	if (Math.random() <= p) {
	    sample.push(arr[i]);
	    k--;
	}
    }
    return sample;
}

async function UpdateAllCitizens() {
    const recent = moment().subtract(48, 'hours').format();
    const activeUsers = [];
    const inactiveUsers = [];
    await UserCache.ForEach(async (cu) => {
	const lastSeen = moment(cu.last_seen || '2020-01-01').format();
	if (lastSeen < recent) {
	    inactiveUsers.push(cu);
	} else {
	    activeUsers.push(cu);
	}
    });
    console.log(`${activeUsers.length} active users ${inactiveUsers.length} inactive users`);
    const activeSample = RandomSample(activeUsers, 1000);
    const inactiveSample = RandomSample(inactiveUsers, 1000);
    const selectedUsers = activeSample.concat(inactiveSample);
    //const selectedUsers = activeUsers.concat(inactiveUsers);
    console.log(`Updating ${selectedUsers.length} users`);
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const maxLoopDuration = 3 * 60 * 1000;
    const startTime = Date.now();
    let howManyUsersGotUpdatedCounter = 0;
    for (const cu of selectedUsers) {
	await UpdateUser(cu, guild);
	howManyUsersGotUpdatedCounter++;
	const elapsedTime = Date.now() - startTime;
	if (elapsedTime > maxLoopDuration) {
	    break;
	}
    }
    if (howManyUsersGotUpdatedCounter < selectedUsers.length) {
	console.log(`Update cycle timed out after updating ${howManyUsersGotUpdatedCounter} users`);
    } else {
	console.log(`Updated all discord members successfully`);
    }
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
    const startTime = new Date().getTime();
    await huddles.ScheduleUpdate();
    await UpdateVoiceActiveMembersForMainDiscordGuild();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    const timeCappedRecords = await FilterTimeTogetherRecordsToEnforceTimeCap(recordsToSync);
    await DB.WriteTimeTogetherRecords(timeCappedRecords);
    await DB.ConsolidateTimeMatrix();
    await UpdateHarmonicCentrality();
    await com.CalculateChainOfCommand();
    await UpdateAllCitizens();
    await yen.DoLottery();
    await recruiting.ScanInvitesForChanges();
    await BanVoteCache.ExpungeVotesWithNoOngoingTrial();
    await Ban.UnbanEligibleUsers();
    await AutoUpdate();
    const endTime = new Date().getTime();
    const elapsed = endTime - startTime;
    console.log(`Update Time: ${elapsed} ms`);
    const sleepTime = 60000;
    setTimeout(RoutineUpdate, sleepTime);
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
    console.log('Loading ban votes from database.');
    await BanVoteCache.LoadVotesFromDatabase();
    console.log('Ban votes loaded into cache.');
    await exile.LoadExilesFromDatabase();
    console.log('Exiles loaded into cache');

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
	    if (cu.ban_conviction_time) {
		const uhoh = `Uh oh! ${member.user.username} has already been convicted in Ban Court. Kicked!`;
	        await DiscordUtil.MessagePublicChatChannel(uhoh);
		await member.kick();
	    } else {
		await cu.setCitizen(true);
	    }
	} else {
	    // We have no record of this Discord user. Create a new record in the cache.
	    console.log('New Discord user detected.');
	    await UserCache.CreateNewDatabaseUser(member);
	}
	await recruiting.ScanInvitesForChanges();
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
	if (!user) {
	    return;
	}
	const cu = await UserCache.GetCachedUserByDiscordId(user.id);
	if (!cu) {
	    return;
	}
	await cu.setCitizen(false);
    });

    // Respond to bot commands.
    discordClient.on('messageCreate', async (message) => {
	const cu = await UserCache.GetCachedUserByDiscordId(message.author.id);
	if (!cu) {
	    // Shouldn't happen. Bail and hope for recovery.
	    return;
	}
	await cu.setCitizen(true);
	await cu.seenNow();
	await BotCommands.Dispatch(message);
	await Ban.RateLimitBanCourtMessage(message);
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
	await cu.updateCalendarDayCount();
	if (cu.good_standing === false) {
	    await newVoiceState.member.voice.kick();
	}
	await huddles.ScheduleUpdate();
    });

    // When a user changes their username or other user details.
    discordClient.on('userUpdate', async (oldUser, newUser) => {
	console.log('userUpdate', newUser.username);
	const cu = await UserCache.GetCachedUserByDiscordId(newUser.id);
	//await cu.setNickname(newUser.username);
    });

    // When a guild member changes their nickname or other details.
    discordClient.on('guildMemberUpdate', async (oldMember, newMember) => {
	console.log('guildMemberUpdate', newMember.user.username);
	const cu = await UserCache.GetCachedUserByDiscordId(newMember.user.id);
	if (!cu) {
	    return;
	}
	//await cu.setNickname(newMember.user.username);
	await cu.setCitizen(true);
    });

    discordClient.on('messageReactionAdd', async (messageReaction, user) => {
	const cu = await UserCache.GetCachedUserByDiscordId(user.id);
	if (!cu) {
	    return;
	}
	await cu.setCitizen(true);
	await cu.seenNow();
	await Ban.HandlePossibleReaction(messageReaction, user, true);
	await zerg.HandleReactionAdd(messageReaction, user);
    });

    discordClient.on('messageReactionRemove', async (messageReaction, user) => {
	await zerg.HandleReactionRemove(messageReaction, user);
    });

    //discordClient.on('rateLimit', (rateLimitData) => {
	//console.log('RATELIMIT ###', rateLimitData);
    //});

    const upvoteMenuBuilder = new ContextMenuCommandBuilder()
	  .setName('Upvote')
	  .setType(ApplicationCommandType.User);

    discordClient.on(Events.InteractionCreate, interaction => {
	if (!interaction.isUserContextMenuCommand()) {
	    return;
	}
	const voter = interaction.user.username;
	const target = interaction.targetUser.username;
	console.log(voter, 'voted', target);
    });

    discordClient.on('debug', console.log);
    discordClient.on('error', console.log);
    discordClient.on('warning', console.log);

    // If the rules have changed, update them.
    await rules.UpdateRulesIfChanged();
    // Update recruiting leaderboard.
    await recruiting.InitCache();
    await recruiting.ScanInvitesForChanges();
    //await recruiting.UpdateRecruitingLeaderboard();
    // Routine update schedules itself to run again after it finishes.
    // That way it avoids running over itself if it runs longer than a minute.
    await RoutineUpdate();
}

Start();
