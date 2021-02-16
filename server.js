const BotCommands = require('./bot-commands');
const ChainOfCommand = require('./chain-of-command');
const Clock = require('./clock');
const DB = require('./database');
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
async function UpdateMemberAppearance(member) {
    if (member.user.bot) {
	// Ignore other bots.
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(member.user.id);
    if (!cu) {
	console.log('Unknown user detected!');
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
    // Nickname override for special titles like 'Mr. President'.
    const displayName = cu.getNicknameOrTitleWithInsignia();
    if (member.nickname !== displayName && member.user.id !== member.guild.ownerID) {
	console.log(`Updating nickname ${displayName}.`);
	member.setNickname(displayName);
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
		if (member.mute) {
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
    const candidateIds = await UserCache.GetAllCitizenCommissarIds();
    UpdateChainOfCommandForCandidates(candidateIds);
}

// Calculates the chain of command. If there are changes, the update is made.
//
// candidateIds - Only these Commissar IDs are eligible to be in the chain-of-command.
//                Removes bots and the like.
async function UpdateChainOfCommandForCandidates(candidateIds) {
    if (!mrPresident) {
	throw 'No Mr. President selected yet. This shouldn\'t happen.';
    }
    const relationships = await DB.GetTimeMatrix();
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
    const nicknames = await UserCache.GetAllNicknames();
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
	await cu.setRank(user.rank);
    });
    console.log('Chain of command updated.');
}

async function ElectMrPresident() {
    console.log('Electing Mr. President.');
    const topTwo = await UserCache.GetMostCentralUsers(2);
    mrPresident = topTwo[0];
    if (!mrPresident) {
	throw 'Failed to find a best candidate for Mr. President!';
    }
    await mrPresident.setRank(0);
    console.log(`Elected ${mrPresident.nickname}`);
}

async function UpdateHarmonicCentrality() {
    const candidates = await UserCache.GetAllCitizenCommissarIds();
    if (candidates.length === 0) {
	throw 'ERROR: zero candidates for the #chain-of-command!';
    }
    const centralityScoresById = await HarmonicCentrality(candidates);
    await UserCache.BulkCentralityUpdate(centralityScoresById);
    const mostCentral = await UserCache.GetMostCentralUsers(5);
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
	    await user.setCitizen(true);
	    await user.setNickname(discordMember.user.username);
	    await UpdateDiscordFriendZoneForCommissarUser(user, guild);
	}
    });
}

// Returns the created or updated role object.
async function CreateOrUpdateDiscordFriendRoleForCommissarUser(cu, guild) {
    const roleName = cu.getNicknameWithInsignia();
    const role = await RateLimit.Run(async () => {
	if (cu.friend_role_id) {
	    return await guild.roles.fetch(cu.friend_role_id);
	} else {
	    const armyGreen = '#86a70b';
	    const navyBlue = '#2d9085';
	    const airForceOrange = '#e77c1b';
	    const marinePurple = '#8e6495';
	    const secondaryPalette = [armyGreen, navyBlue, airForceOrange, marinePurple];
	    const randomColorIndex = Math.floor(Math.random() * secondaryPalette.length);
	    const randomColor = secondaryPalette[randomColorIndex];
	    console.log(`Creating new friend role: ${roleName}`);
	    return await guild.roles.create({
		data: {
		    name: roleName,
		    color: randomColor,
		    hoist: false,
		    mentionable: false,
		},
	    });
	}
    });
    await cu.setFriendRoleId(role.id);
    if (role.name !== roleName) {
	console.log(`Changing friend role name from ${role.name} to ${roleName}.`);
	await role.setName(roleName);
    }
    return role;
}

async function CreateOrUpdateDiscordFriendSectionForCommissarUser(cu, friendRole, guild) {
    const sectionName = cu.getNicknameWithInsignia();
    const section = await RateLimit.Run(async () => {
	if (cu.friend_category_id) {
	    return await guild.channels.resolve(cu.friend_category_id);
	} else {
	    const botsRole = await DiscordUtil.GetRoleByName(guild, 'Bots');
	    return await guild.channels.create(sectionName, {
		type: 'category',
		permissionOverwrites: [
		    {
			deny: ['CONNECT', 'VIEW_CHANNEL'],
			id: guild.roles.everyone.id,
		    },
		    {
			allow: ['CONNECT', 'VIEW_CHANNEL'],
			id: friendRole.id,
		    },
		    {
			allow: ['CONNECT', 'VIEW_CHANNEL'],
			id: botsRole.id,
		    },
		],
	    });
	}
    });
    await cu.setFriendCategorityId(section.id);
    if (section.name !== sectionName) {
	await section.setName(sectionName);
    }
    return section;
}

async function CreateOrUpdateDiscordFriendChatroomForCommissarUser(cu, section, guild) {
    const roomName = 'chat';
    const chatroom = await RateLimit.Run(async () => {
	if (cu.friend_text_chat_id) {
	    return await guild.channels.resolve(cu.friend_text_chat_id);
	} else {
	    const newChannel = await guild.channels.create(roomName, { type: 'text' });
	    await RateLimit.Run(async () => {
		await newChannel.setParent(section.id);
	    });
	    await RateLimit.Run(async () => {
		await newChannel.lockPermissions();
	    });
	    return newChannel;
	}
    });
    await cu.setFriendTextChatId(chatroom.id);
    if (chatroom.name !== roomName) {
	await chatroom.setName(roomName);
    }
    return chatroom;
}

async function CreateOrUpdateDiscordFriendVoiceRoomForCommissarUser(cu, section, guild) {
    const roomName = 'Chill';
    const voice = await RateLimit.Run(async () => {
	if (cu.friend_voice_room_id) {
	    return await guild.channels.resolve(cu.friend_voice_room_id);
	} else {
	    const newChannel = await guild.channels.create(roomName, { type: 'voice' });
	    await RateLimit.Run(async () => {
		await newChannel.setParent(section.id);
	    });
	    await RateLimit.Run(async () => {
		await newChannel.lockPermissions();
	    });
	    return newChannel;
	}
    });
    await cu.setFriendVoiceRoomId(voice.id);
    if (voice.name !== roomName) {
	await voice.setName(roomName);
    }
    return voice;
}

async function UpdateDiscordFriendZoneForCommissarUser(cu, guild) {
    if (!cu.friend_role_id && cu.rank > 2) {
	return;
    }
    const friendRole = await CreateOrUpdateDiscordFriendRoleForCommissarUser(cu, guild);
    const section = await CreateOrUpdateDiscordFriendSectionForCommissarUser(cu, friendRole, guild);
    await CreateOrUpdateDiscordFriendChatroomForCommissarUser(cu, section, guild);
    await CreateOrUpdateDiscordFriendVoiceRoomForCommissarUser(cu, section, guild);
    const member = await guild.members.fetch(cu.discord_id);
    DiscordUtil.AddRole(member, friendRole);
}

// The 60-second heartbeat event. Take care of things that need attention each minute.
async function MinuteHeartbeat() {
    if (RateLimit.Busy()) {
	return;
    }
    console.log('Minute heartbeat');
    // Update clan executive roles.
    await Executives.UpdateClanExecutives(chainOfCommand);
    // Update mini-clans.
    await MiniClans.UpdateRolesForMainDiscordGuild(chainOfCommand);
    // Update the chain of command.
    await UpdateChainOfCommandForMainDiscordGuild();
    // Update the nickname, insignia, and roles of the members of the Discord channel.
    await UpdateAllDiscordMemberAppearances();
    // Update time matrix and sync to database.
    await UpdateVoiceActiveMembersForMainDiscordGuild();
    const recordsToSync = timeTogetherStream.popTimeTogether(9000);
    await DB.WriteTimeTogetherRecords(recordsToSync);
}

// The hourly heartbeat event. Take care of things that need attention once an hour.
async function HourlyHeartbeat() {
    console.log('Hourly heartbeat');
    console.log('Consolidating the time matrix.');
    await DB.ConsolidateTimeMatrix();
    console.log('Update harmonic centrality.');
    await UpdateHarmonicCentrality();
    await ElectMrPresident();
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
	    // This shouldn't happen but ignore and hope for recovery.
	    return;
	}
	await cu.setNickname(newMember.user.username);
	await cu.setCitizen(true);
    });

    // Set up heartbeat events. These run at fixed intervals of time.
    const oneSecond = 1000;
    const oneMinute = 60 * oneSecond;
    const oneHour = 60 * oneMinute;
    // Run the hourly and minute heartbeat routines once each to fully prime
    // the bot rather than waiting until an hour or a minute has passed.
    await HourlyHeartbeat();
    await MinuteHeartbeat();
    // Set up the hour and minute heartbeat routines to run on autopilot.
    setInterval(HourlyHeartbeat, oneHour);
    setInterval(MinuteHeartbeat, oneMinute);
    // Check each citizen once on startup.
    await UpdateAllCitizens();
}

Start();
