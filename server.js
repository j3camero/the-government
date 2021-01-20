const BotCommands = require('./bot-commands');
const ChainOfCommand = require('./chain-of-command');
const Clock = require('./clock');
const db = require('./database');
const deepEqual = require('deep-equal');
const DiscordUtil = require('./discord-util');
const Executives = require('./executive-offices');
const HarmonicCentrality = require('./harmonic-centrality');
const MiniClans = require('./mini-clans');
const moment = require('moment');
const RateLimit = require('./rate-limit');
const RenderChainOfCommand = require('./render-chain-of-command');
const Sleep = require('./sleep');
const TimeTogetherStream = require('./time-together-stream');
const UserCache = require('./user-cache');

// Used for streaming time matrix data to the database.
const timeTogetherStream = new TimeTogetherStream(new Clock());

// Stores who is Mr. President right now.
let mrPresident;

// The current chain of command. It's a dict of user info keyed by commissar ID.
// The elements form an implcit tree.
let chainOfCommand = {};

// Updates a guild member's color.
async function UpdateMemberRankRoles(member, rankName) {
    // Look up the IDs of the 4 big categories.
    const grunts = await DiscordUtil.GetRoleByName(member.guild, 'Grunt');
    const officers = await DiscordUtil.GetRoleByName(member.guild, 'Officer');
    const generals = await DiscordUtil.GetRoleByName(member.guild, 'General');
    const marshals = await DiscordUtil.GetRoleByName(member.guild, 'Marshal');
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
    DiscordUtil.AddRole(member, addThisRole);
    // Remove roles.
    removeTheseRoles.forEach((roleToRemove) => {
	DiscordUtil.RemoveRole(member, roleToRemove);
    });
}

// Update the rank insignia, nickname, and roles of a Discord guild
// member based on the latest info stored in the user cache.
function UpdateMemberAppearance(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	// We have no record of this Discord user. Create a new record in the cache.
	console.log('New Discord user detected.');
	UserCache.CreateNewDatabaseUser(db.getConnection(), member, () => {
	    // Try updating the member again after the new user record has been created.
	    UpdateMemberAppearance(member);
	});
	return;
    }
    if (!cu.rank && cu.rank !== 0) {
	// The user has not been assigned a rank yet. Bail.
	return;
    }
    const rankData = ChainOfCommand.metadata[cu.rank];
    if (!rankData) {
	throw 'Invalid rank detected. This can indicate serious problems.';
    }
    if (rankData.titleOverride) {
	// Nickname override for special titles like 'Mr. President'.
	cu.setNickname(`${rankData.abbreviation} ${rankData.title}`);
    } else {
	// Normal case: filter the user's own chosen Discord display name.
	cu.setNickname(member.user.username);
    }
    const formattedNickname = `${cu.nickname} ${rankData.insignia}`;
    if (member.nickname != formattedNickname && member.user.id !== member.guild.ownerID) {
	console.log(`Updating nickname ${formattedNickname}.`);
	member.setNickname(formattedNickname);
    }
    // Update role (including rank color).
    UpdateMemberRankRoles(member, rankData.role);
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
    UpdateVoiceActiveMembersForOneGuild(guild);
}

// Looks for 2 or more users in voice channels together and credits them.
//
// guild - Looks for voice channels in this guild only.
function UpdateVoiceActiveMembersForOneGuild(guild) {
    const listOfLists = [];
    guild.channels.cache.forEach((channel) => {
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
		// Update this user's 'last seen' time.
		cu.seenNow();
		channelActive.push(cu.commissar_id);
	    });
	    if (channelActive.length >= 2) {
		listOfLists.push(channelActive);
	    }
	}
    });
    timeTogetherStream.seenTogether(listOfLists);
}

// Announce a promotion in #public chat, if applicable.
//
// nickname - a string of the user's filtered nickname, without insignia.
// oldRank - integer rank index of the user's old rank.
// newRank - integer rank index of the user's new rank.
async function AnnounceIfPromotion(nickname, oldRank, newRank) {
    if (oldRank === undefined || oldRank === null ||
	newRank === undefined || newRank === null ||
	!Number.isInteger(oldRank) || !Number.isInteger(newRank) ||
	newRank >= oldRank) {
	// No promotion detected. Bail.
	return;
    }
    // If we get past here, a promotion has been detected.
    // Announce it in main chat.
    const oldMeta = ChainOfCommand.metadata[oldRank];
    const newMeta = ChainOfCommand.metadata[newRank];
    const message = `${nickname} ${newMeta.insignia} is promoted from ${oldMeta.title} ${oldMeta.insignia} to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    // Delay for a few seconds to spread out the promotion messages and
    // also achieve a crude non-guaranteed sorting by rank.
    const delayMillis = 1000 * (newRank + Math.random() / 2) + 100;
    await Sleep(delayMillis);
    await DiscordUtil.MessagePublicChatChannel(message);
}

// Calculates the chain of command. If there are changes, the update is made.
// Only affects the main Discord guild.
async function UpdateChainOfCommandForMainDiscordGuild() {
    const candidateIds = await DiscordUtil.GetCommissarIdsOfDiscordMembers();
    UpdateChainOfCommandForCandidates(candidateIds);
}

// Calculates the chain of command. If there are changes, the update is made.
//
// candidateIds - Only these Commissar IDs are eligible to be in the chain-of-command.
//                Removes bots and the like.
function UpdateChainOfCommandForCandidates(candidateIds) {
    if (!mrPresident) {
	// There is no mrPresident yet. We can't calculate the Chain of Command.
	// Bail, but also kick off a Harmonic Centrality update so there will be
	// a mrPresident next time we try a chain-of-command update.
	UpdateHarmonicCentrality();
	return;
    }
    db.getTimeMatrix(async (relationships) => {
	// User 7 (Jeff) can't be President or VP any more. Voluntary term limit.
	// TODO: replace this with a column in the users table of the database to avoid hardcoding.
	const termLimited = [7];
	const newChainOfCommand = ChainOfCommand.CalculateChainOfCommand(mrPresident.commissar_id, candidateIds, relationships, termLimited);
	if (deepEqual(newChainOfCommand, chainOfCommand)) {
	    // Bail if there are no changes to the chain of command.
	    return;
	}
	console.log('About to update the chain of command');
	// Pass this point only if there is a change to the chain of command.
	chainOfCommand = newChainOfCommand;
	const nicknames = UserCache.GetAllNicknames();
	// Generate and post an updated image of the chain of command.
	const canvas = RenderChainOfCommand(chainOfCommand, nicknames);
	const guild = await DiscordUtil.GetMainDiscordGuild();
	DiscordUtil.UpdateChainOfCommandChatChannel(guild, canvas);
	// Update the people's ranks.
	Object.values(chainOfCommand).forEach(async (user) => {
	    const cu = UserCache.GetCachedUserByCommissarId(user.id);
	    // Only announce promotions if the user has been active recently.
	    if (cu && cu.last_seen && moment().diff(cu.last_seen, 'seconds') < 2 * 24 * 3600) {
		await AnnounceIfPromotion(cu.nickname, cu.rank, user.rank);
	    }
	    cu.setRank(user.rank);
	});
	console.log('Chain of command updated.');
    });
}

function ElectMrPresident(centrality) {
    console.log('Electing Mr. President.');
    let bestId;
    Object.keys(centrality).forEach((i) => {
	if (!bestId || centrality[i] > centrality[bestId]) {
	    bestId = i;
	}
    });
    if (!bestId) {
	return;
    }
    mrPresident = UserCache.GetCachedUserByCommissarId(bestId);
    mrPresident.setRank(0);
    console.log(`Elected ID ${bestId} (${mrPresident.nickname})`);
}

async function UpdateHarmonicCentrality() {
    const candidates = await DiscordUtil.GetCommissarIdsOfDiscordMembers();
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates for the #chain-of-command!';
    }
    HarmonicCentrality(candidates, (centrality) => {
	DiscordUtil.UpdateHarmonicCentralityChatChannel(centrality);
	ElectMrPresident(centrality);
    });
}

// The 60-second heartbeat event. Take care of things that need attention each minute.
function MinuteHeartbeat() {
    if (RateLimit.Busy()) {
	return;
    }
    console.log('Minute heartbeat');
    // Update clan executive roles.
    Executives.UpdateClanExecutives(chainOfCommand);
    // Update mini-clans.
    MiniClans.UpdateRolesForMainDiscordGuild(chainOfCommand);
    // Update the chain of command.
    UpdateChainOfCommandForMainDiscordGuild();
    // Update the nickname, insignia, and roles of the members of the Discord channel.
    UpdateAllDiscordMemberAppearances();
    // Sync user data to the database.
    UserCache.WriteDirtyUsersToDatabase();
    // Update time matrix and sync to database.
    UpdateVoiceActiveMembersForMainDiscordGuild();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    db.writeTimeTogetherRecords(recordsToSync);
}

// The hourly heartbeat event. Take care of things that need attention once an hour.
function HourlyHeartbeat() {
    console.log('Hourly heartbeat');
    UpdateHarmonicCentrality();
}

// Login the Commissar bot to Discord.
console.log('Connecting the Discord bot.');

// Waits for the database and bot to both be connected, then finishes booting the bot.
async function Start() {
    console.log('Waiting for Discord bot to connect.');
    const discordClient = await DiscordUtil.Connect();
    console.log('Discord bot connected.');
    console.log('Waiting for the database to connect.');
    await db.Connect();
    console.log('Database connected.');
    console.log('Loading commissar user data.');
    UserCache.LoadAllUsersFromDatabase(db.getConnection(), () => {
	console.log('Commissar user data loaded.');
	console.log('Commissar is alive.');
    });

    // This Discord event fires when someone joins a Discord guild that the bot is a member of.
    discordClient.on('guildMemberAdd', async (member) => {
	console.log('Someone joined the guild.');
	if (member.user.bot) {
	    // Ignore other bots.
	    return;
	}
	const greeting = `Everybody welcome ${member.user.username} to the server!`;
	await DiscordUtil.MessagePublicChatChannel(greeting);
	const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
	if (!cu) {
	    // We have no record of this Discord user. Create a new record in the cache.
	    console.log('New Discord user detected.');
	    UserCache.CreateNewDatabaseUser(db.getConnection(), member, () => {
		// New user successfully created. Do nothing, for now. They get picked up in the next ranking cycle.
	    });
	}
    });

    // Respond to bot commands.
    discordClient.on('message', BotCommands.Dispatch);

    // This Discord event fires when someone joins or leaves a voice chat channel, or mutes,
    // unmutes, deafens, undefeans, and possibly other circumstances as well.
    discordClient.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => {
	console.log('voiceStateUpdate', newVoiceState.member.nickname);
	UpdateVoiceActiveMembersForMainDiscordGuild();
    });

    // Set up heartbeat events. These run at fixed intervals of time.
    const oneSecond = 1000;
    const oneMinute = 60 * oneSecond;
    const oneHour = 60 * oneMinute;
    setInterval(MinuteHeartbeat, oneMinute);
    setInterval(HourlyHeartbeat, oneHour);
}

Start();
