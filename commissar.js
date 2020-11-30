const Clock = require('./clock');
const config = require('./config');
const db = require('./database');
const deepEqual = require('deep-equal');
const Discord = require('discord.js');
const DiscordUtil = require('./discord-util');
const HarmonicCentrality = require('./harmonic-centrality');
const moment = require('moment');
const rank = require('./rank');
const TimeTogetherStream = require('./time-together-stream');
const TimeUtil = require('./time-util');
const UserCache = require('./commissar-user');

// Create the Discord client. Does not connect yet.
const client = new Discord.Client({
    fetchAllMembers: true,
});

// This flag sets to true once the bot is connected to Discord (but not yet booted).
let discordConnected = false;

// This flag sets to true once the bot is fully booted and ready to handle traffic.
let botActive = false;

// Used for streaming time matrix data to the database.
const timeTogetherStream = new TimeTogetherStream(new Clock());

// Stores who is Mr. President right now.
let mrPresident;

// The current chain of command. It's a dict of user info keyed by commissar ID.
// The elements form an implcit tree.
let chainOfCommand = {};

function AddRole(member, roleID) {
    if (!roleID || DiscordUtil.GuildMemberHasRoleByID(member, roleID)) {
	return;
    }
    console.log('Adding role', roleID, 'to', member.nickname);
    member.roles.add(roleID)
	.then((member) => {
	    console.log('OK');
	}).catch((err) => {
	    console.log('ERROR!');
	});
}

function RemoveRole(member, roleID) {
    if (!roleID || !DiscordUtil.GuildMemberHasRoleByID(member, roleID)) {
	return;
    }
    console.log('Removing role', roleID, 'from', member.nickname);
    member.roles.remove(roleID)
	.then((member) => {
	    console.log('OK');
	}).catch((err) => {
	    console.log('ERROR!');
	});
}

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
    AddRole(member, addThisRole);
    // Remove roles.
    removeTheseRoles.forEach((roleToRemove) => {
	RemoveRole(member, roleToRemove);
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
	cu.setNickname(member.user.username);
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
}

// Updates people's rank and nickname-based insignia (dots, stars) in Discord.
async function UpdateAllDiscordMemberAppearances() {
    const guild = await DiscordUtil.GetMainDiscordGuild(client);
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
    const guild = await DiscordUtil.GetMainDiscordGuild(client);
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
    // If we get past here, a promotion has been detected.
    // Announce it in main chat.
    const oldMeta = rank.metadata[oldRank];
    const newMeta = rank.metadata[newRank];
    const message = `${nickname} ${newMeta.insignia} is promoted from ${oldMeta.title} ${oldMeta.insignia} to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    // Delay for a few seconds to spread out the promotion messages and
    // also achieve a crude non-guaranteed sorting by rank.
    const delayMillis = 1000 * (newRank + Math.random() / 2) + 100;
    setTimeout(async () => {
	const guild = await DiscordUtil.GetMainDiscordGuild(client);
	const channel = DiscordUtil.GetMainChatChannel(guild);
	channel.send(message);
    }, delayMillis);
}


// Calculates the chain of command. If there are changes, the update is made.
// Only affects the main Discord guild.
async function UpdateChainOfCommandForMainDiscordGuild() {
    const candidateIds = await DiscordUtil.GetCommissarIdsOfDiscordMembers(client);
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
	const newChainOfCommand = rank.CalculateChainOfCommand(mrPresident.commissar_id, candidateIds, relationships, termLimited);
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
	const guild = await DiscordUtil.GetMainDiscordGuild(client);
	DiscordUtil.UpdateChainOfCommandChatChannel(guild, canvas);
	// Update the people's ranks.
	Object.values(chainOfCommand).forEach((user) => {
	    const cu = UserCache.GetCachedUserByCommissarId(user.id);
	    // Only announce promotions if the user has been active recently.
	    if (cu && cu.last_seen && moment().diff(cu.last_seen, 'seconds') < 2 * 24 * 3600) {
		AnnounceIfPromotion(cu.nickname, cu.rank, user.rank);
	    }
	    cu.setRank(user.rank);
	});
	UserCache.UpdateClanExecutives(chainOfCommand);
	UpdateMiniClanRolesForMainDiscordGuild();
	console.log('Chain of command updated.');
    });
}

// Updates the Army, Navy, Air Force, and Marines.
//
// The four mini-clans are based on chain-of-command. Each 'branch' is headed by
// one of the four 3-star Generals.
//
// Updates the mini-clans for the main Discord guild only.
async function UpdateMiniClanRolesForMainDiscordGuild() {
    const guild = await DiscordUtil.GetMainDiscordGuild(client);
    UpdateMiniClanRolesForOneGuild(guild);
}

// Updates the mini-clans for one Discord guild only.
async function UpdateMiniClanRolesForOneGuild(guild) {
    if (!chainOfCommand) {
	// Bail if the chain of command isn't booted up yet.
	return;
    }
    // Get the Discord roles for each mini-clan.
    const allRoleNames = ['Army', 'Navy', 'Air Force', 'Marines'];
    const rolesByName = {};
    allRoleNames.forEach((roleName) => {
	rolesByName[roleName] = DiscordUtil.GetRoleByName(guild, roleName);
    });

    // Custom role updating function for mini-clans. It applies the given
    // roles and actively removes any others.
    function UpdateRoles(member, names) {
	const addRoles = [];
	const removeRoles = [];
	Object.keys(rolesByName).forEach((name) => {
	    const role = rolesByName[name];
	    if (names.includes(name)) {
		AddRole(member, role);
	    } else {
		RemoveRole(member, role);
	    }
	});
    }

    // A list of roles to be applied, keyed by commissar_id. It's this
    // way to accomodate giving senior leaders several roles.
    const rolesById = {};

    // Apply a role to a user and their children in the chain of command, recursively.
    function ApplyRoleDownwards(commissar_id, roleName) {
	const userRoles = rolesById[commissar_id] || [];
	userRoles.push(roleName);
	rolesById[commissar_id] = userRoles;
	const chainUser = chainOfCommand[commissar_id];
	if (!chainUser || !chainUser.children) {
	    return;
	}
	chainUser.children.forEach((child) => {
	    ApplyRoleDownwards(child, roleName);
	});
    }

    // Apply a role to a user and their bosses in the chain of command, recursively.
    function ApplyRoleUpwards(commissar_id, roleName) {
	const userRoles = rolesById[commissar_id] || [];
	userRoles.push(roleName);
	rolesById[commissar_id] = userRoles;
	const chainUser = chainOfCommand[commissar_id];
	if (chainUser && chainUser.boss) {
	    ApplyRoleUpwards(chainUser.boss, roleName);
	}
    }

    // Kick off the recursive role assignment.
    UserCache.ForEachExecutiveWithRole((execID, roleName) => {
	ApplyRoleDownwards(execID, roleName);
	ApplyRoleUpwards(execID, roleName);
    });
    // Apply the calculated mini-clan roles to each user in the Discord guild.
    const members = await guild.members.fetch();
    members.forEach((member) => {
	const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
	if (cu && cu.commissar_id in rolesById) {
	    const roleNames = rolesById[cu.commissar_id];
	    UpdateRoles(member, roleNames);
	}
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
    const candidates = await DiscordUtil.GetCommissarIdsOfDiscordMembers(client);
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates for the #chain-of-command!';
    }
    HarmonicCentrality(candidates, (centrality) => {
	// Hack: Jeff can't be President.
	if (7 in centrality) {
	    delete centrality[7];
	}
	DiscordUtil.UpdateHarmonicCentralityChatChannel(client, centrality);
	ElectMrPresident(centrality);
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
	UserCache.CreateNewDatabaseUser(db.getConnection(), member, () => {
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
    UpdateVoiceActiveMembersForMainDiscordGuild();
});

// Set up a 60-second heartbeat event. Take care of things that need attention each minute.
const oneMinute = 60 * 1000;
setInterval(() => {
    if (!botActive) {
	return;
    }
    console.log('Minute heartbeat');
    // Update clan executive roles.
    UserCache.UpdateClanExecutives(chainOfCommand);
    // Update mini-clans.
    UpdateMiniClanRolesForMainDiscordGuild();
    // Update the chain of command.
    UpdateChainOfCommandForMainDiscordGuild();
    // Update the nickname, insignia, and roles of the members of the Discord channel.
    UpdateAllDiscordMemberAppearances();
    // Sync user data to the database.
    UserCache.WriteDirtyUsersToDatabase(db.getConnection());
    // Update time matrix and sync to database.
    UpdateVoiceActiveMembersForMainDiscordGuild();
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
    UpdateHarmonicCentrality();
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
