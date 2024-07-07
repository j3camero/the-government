// Huddles are infinite voice chat rooms. The bot will automatically create
// more rooms of each type so that there are always enough for everyone.
// In practical terms, this solves a common problem in Discord administration
// where you have way too many rooms to accomodate peak traffic, with the
// side-effect that it looks extra dead during off-peak times. Huddles
// introduce auto-scaling to Discord voice chat rooms so there are always
// the right amount of rooms no matter how busy.

const config = require('./config');
const { PermissionFlagsBits } = require('discord.js');
const DiscordUtil = require('./discord-util');
const fetch = require('./fetch');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
const UserCache = require('./user-cache');

const huddles = [
    { name: 'Duo', userLimit: 2, position: 2000 },
    { name: 'Trio', userLimit: 3, position: 3000 },
    //{ name: 'Quad', userLimit: 4, position: 4000 },
    //{ name: 'Six Pack', userLimit: 6, position: 6000 },
    //{ name: 'Squad', userLimit: 8, position: 7000 },
];
const mainRoomControlledByProximity = false;
if (!mainRoomControlledByProximity) {
    huddles.push({ name: 'Main', userLimit: 99, position: 1000 });
}

function GetAllMatchingVoiceChannels(guild, huddle) {
    const matchingChannels = [];
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 2 &&
	    channel.name === huddle.name &&
	    channel.userLimit === parseInt(huddle.userLimit)) {
	    matchingChannels.push(channel);
	}
    }
    return matchingChannels;
}

async function CreateNewVoiceChannelWithBitrate(guild, huddle, bitrate) {
    const perms = [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel];
    const options = {
	bitrate,
	permissionOverwrites: [
	    { id: guild.roles.everyone, deny: perms },
	    { id: RoleID.Commander, allow: perms },
	    { id: RoleID.General, allow: perms },
	    { id: RoleID.Officer, allow: perms },
	    { id: RoleID.Grunt, allow: perms },
	    { id: RoleID.Recruit, allow: perms },
	    { id: RoleID.Bots, allow: perms },
	],
	name: huddle.name,
	type: 2,
	userLimit: huddle.userLimit,
    };
    console.log('Creating channel.');
    return await guild.channels.create(options);
}

async function CreateNewVoiceChannel(guild, huddle) {
    const bitratesToTry = [384000, 256000, 128000];
    for (const bitrate of bitratesToTry) {
	try {
	    return await CreateNewVoiceChannelWithBitrate(guild, huddle, bitrate);
	} catch (err) {
	    console.log('Failed to create channel with bitrate', bitrate);
	}
    }
    console.log('Failed to create channel with any bitrate');
    return null;
}

function GetMostRecentlyCreatedVoiceChannel(channels) {
    let mostRecentChannel;
    for (const channel of channels) {
	if (!mostRecentChannel || channel.createdTimestamp > mostRecentChannel.createdTimestamp) {
	    mostRecentChannel = channel;
	}
    }
    return mostRecentChannel;
}

async function DeleteMostRecentlyCreatedVoiceChannel(channels) {
    const channel = GetMostRecentlyCreatedVoiceChannel(channels);
    console.log('Deleting channel');
    try {
	await channel.delete();
    } catch (error) {
	console.log('Failed to delete channel. Probably a harmless race condition. Ignoring.');
    }
}

async function UpdateVoiceChannelsForOneHuddleType(guild, huddle) {
    const matchingChannels = GetAllMatchingVoiceChannels(guild, huddle);
    if (matchingChannels.length === 0) {
	console.log('Found no rooms matching', JSON.stringify(huddle));
	await CreateNewVoiceChannel(guild, huddle);
	return;
    }
    console.log('Found', matchingChannels.length, 'matching channels.');
    const emptyChannels = matchingChannels.filter(ch => ch.members.size === 0);
    console.log(emptyChannels.length, 'empty channels of this type.');
    if (emptyChannels.length === 0) {
	await CreateNewVoiceChannel(guild, huddle);
    } else if (emptyChannels.length >= 2) {
	await DeleteMostRecentlyCreatedVoiceChannel(emptyChannels);
    } else {
	// There is exactly 1 empty channel. Do nothing.
    }
}

// Calculates the median of an array of numbers.
function Median(arr) {
    const mid = Math.floor(arr.length / 2);
    const nums = [...arr].sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

// Returns the maximum Harmonic Centrality score of any members in a VC room.
function ScoreRoom(discordChannel) {
    const scores = [];
    for (const [memberId, member] of discordChannel.members) {
	if (member.user.bot) {
	    continue;
	}
	const cu = UserCache.GetCachedUserByDiscordId(memberId);
	if (!cu) {
	    continue;
	}
	let s = cu.harmonic_centrality || 0;
	if (member.voice.mute) {
	    s *= 0.5;
	}
	if (member.voice.deaf) {
	    s = 0;
	}
	scores.push(s);
    }
    return Median(scores);
}

// A comparator for Discord rooms. Controls the sort order of the rooms.
function CompareRooms(a, b) {
    // Never sort rooms that have a parent.
    if (a.parent || b.parent) {
	return 0;
    }
    // Empty rooms sort down.
    if (a.members.size === 0 && b.members.size > 0) {
	return 1;
    }
    if (a.members.size > 0 && b.members.size === 0) {
	return -1;
    }
    // Full rooms sort down.
    if (a.full && !b.full) {
	return 1;
    }
    if (!a.full && b.full) {
	return -1;
    }
    // This is the scoring rule for rooms that are neither empty nor full.
    const ah = ScoreRoom(a);
    const bh = ScoreRoom(b);
    if (ah < bh) {
	return 1;
    }
    if (ah > bh) {
	return -1;
    }
    // Rules from here on down are mainly intended for sorting the empty
    // VC rooms at the bottom amongst themselves.
    const roomOrder = ['Main', 'Duo', 'Trio', 'Quad', 'Squad'];
    //roomOrder.reverse();  // Makes Main sort to bottom.
    for (const roomName of roomOrder) {
	if (a.name.startsWith(roomName) && !b.name.startsWith(roomName)) {
	    return -1;
	}
	if (!a.name.startsWith(roomName) && b.name.startsWith(roomName)) {
	    return 1;
	}
    }
    // Rooms with lower capacity sort up.
    if (a.userLimit > b.userLimit) {
	return 1;
    }
    if (a.userLimit < b.userLimit) {
	return -1;
    }
    // Should all other criteria fail to break the tie, then alphabetic ordering is the last resort.
    return a.name.localeCompare(b.name);
}

// Checks the see if any rooms need to be moved in the ordering, and does so.
// Only moves one room at a time. To achieve a full sort, call this periodically.
// Returns true if no rooms needed moving. Returns false if a room was moved.
async function MoveOneRoomIfNeeded(guild) {
    const rooms = [];
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 2 && !channel.parent) {
	    rooms.push(channel);
	}
    }
    console.log('Sorting', rooms.length, 'voice rooms.');
    // Sort the rooms internally by their position in Discord.
    rooms.sort((a, b) => {
	if (a.position < b.position) {
	    return -1;
	}
	if (a.position > b.position) {
	    return 1;
	}
	return 0;
    });
    for (let i = 0; i < rooms.length - 1; i++) {
	const a = rooms[i];
	const b = rooms[i + 1];
	if (CompareRooms(a, b) > 0) {
	    console.log('Swapping two voice rooms', a.name, 'and', b.name);
	    await a.setPosition(1, { relative: true });
	    return false;
	}
    }
    console.log('No rooms sorted.');
    return true;
}

function CompareMembersByHarmonicCentrality(a, b) {
    const au = UserCache.GetCachedUserByDiscordId(a.id);
    const bu = UserCache.GetCachedUserByDiscordId(b.id);
    const aScore = au ? (au.harmonic_centrality || 0) : 0;
    const bScore = bu ? (bu.harmonic_centrality || 0) : 0;
    if (aScore < bScore) {
	return 1;
    }
    if (bScore < aScore) {
	return -1;
    }
    return 0;
}

function GetLowestRankingMembersFromVoiceChannel(channel, n) {
    const sortableMembers = [];
    for (const [id, member] of channel.members) {
	sortableMembers.push(member);
    }
    sortableMembers.sort(CompareMembersByHarmonicCentrality);
    if (sortableMembers.length <= n) {
	return sortableMembers;
    }
    return sortableMembers.slice(-n);
}

// Sets a channel to be accessible to everyone.
async function SetOpenPerms(channel) {
    if (!channel) {
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const connect = PermissionFlagsBits.Connect;
    const view = PermissionFlagsBits.ViewChannel;
    const perms = [
	{ id: guild.roles.everyone.id, deny: [connect, view] },
	{ id: RoleID.Grunt, allow: [connect, view] },
	{ id: RoleID.Officer, allow: [connect, view] },
	{ id: RoleID.General, allow: [connect, view] },
	{ id: RoleID.Bots, allow: [view, connect] },
    ];
    // Do not await. Fire and forget with rate limit.
    DiscordUtil.TryToSetChannelPermsWithRateLimit(channel, perms);
}

// Calculates the rank-level perms to use for rank-limiting a voice channel.
function CalculatePermsByRank(channel, rankLimit) {
    const connect = PermissionFlagsBits.Connect;
    const view = PermissionFlagsBits.ViewChannel;
    const perms = [
	{ id: channel.guild.roles.everyone.id, allow: [view], deny: [connect] },
	{ id: RoleID.Bots, allow: [view, connect] },
    ];
    let rankIndex = 0;
    for (const rank of RankMetadata) {
	if (rank.count) {
	    const mainRole = rank.roles[0];
	    // Watch out for which way this is ordered. Lower ranks have higher indices.
	    if (rankIndex < rankLimit) {
		perms.push({ id: mainRole, allow: [view, connect] });
	    } else {
		perms.push({ id: mainRole, allow: [view], deny: [connect] });
	    }
	}
	++rankIndex;
    }
    return perms;
}

// Calculates the individual member perms to use for rank-limiting a voice channel.
async function CalculateIndividualPerms(rankLimit, scoreThreshold) { 
    const eligibleUsers = UserCache.GetUsersWithRankAndScoreHigherThan(rankLimit, scoreThreshold);
    eligibleUsers.sort((a, b) => {
	if (a.last_seen < b.last_seen) {
	    return 1;
	}
	if (a.last_seen > b.last_seen) {
	    return -1;
	}
	return 0;
    });
    const howManyTop = 20;
    const mostRecentUsers = eligibleUsers.length < howManyTop ? eligibleUsers : eligibleUsers.slice(0, howManyTop);
    const connect = PermissionFlagsBits.Connect;
    const view = PermissionFlagsBits.ViewChannel;
    const perms = [];
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const user of mostRecentUsers) {
	const member = await guild.members.fetch(user.discord_id);
	if (member) {
	    perms.push({ id: member.id, allow: [connect, view] });
	}
    }
    return perms;
}

// Sets perms to rank-limit a voice chat room.
// Uses a combination of rank-level perms and individual perms to efficiently
// impose a rank limit on a channel with a resolution down to the individual.
async function SetRankLimit(channel, rankLimit, scoreThreshold) {
    const rankPerms = CalculatePermsByRank(channel, rankLimit);
    const individualPerms = await CalculateIndividualPerms(rankLimit, scoreThreshold);
    const perms = rankPerms.concat(individualPerms);
    await channel.permissionOverwrites.set(perms);
}

// Enforces a soft population cap on all voice chat rooms by moving low-ranking
// members around. Returns true if it had to move anyone, and false if no moves
// are needed.
async function Overflow(guild) {
    console.log(`Overflow`);
    const mainChannels = [];
    const voiceChannels = [];
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 2) {
	    voiceChannels.push(channel);
	}
	if (channel.type === 2 && !channel.parent && channel.name === 'Main') {
	    mainChannels.push(channel);
	}
    }
    console.log(`${voiceChannels.length} voice channels detected.`);
    const overflowMembers = [];
    for (const channel of voiceChannels) {
	const pop = channel.members.size;
	const overflowLimit = channel.userLimit - 2;
	console.log('Voice room with pop', pop, 'limit', overflowLimit);
	if (pop < overflowLimit) {
	    await SetOpenPerms(channel);
	} else {
	    const howManyExtra = pop - overflowLimit;
	    const lowest = GetLowestRankingMembersFromVoiceChannel(channel, howManyExtra + 1);
	    const extra = lowest.slice(1);
	    for (const member of extra) {
		overflowMembers.push(member);
	    }
	    const pivotMember = lowest[0];
	    const pivotUser = UserCache.GetCachedUserByDiscordId(pivotMember.id);
	    if (pivotUser) {
		await SetRankLimit(channel, pivotUser.rank, pivotUser.harmonic_centrality);
	    } else {
		await SetOpenPerms(channel);
	    }
	}
    }
    console.log(`${overflowMembers.length} overflow members detected.`);
    if (overflowMembers.length === 0) {
	console.log(`No overflow. Bailing.`);
	return false;
    }
    // If we get here then there are overflow members. Get only the
    // highest ranking one and try to move them.
    overflowMembers.sort(CompareMembersByHarmonicCentrality);
    const memberToMove = overflowMembers[0];
    const cu = UserCache.GetCachedUserByDiscordId(memberToMove.id);
    const name = cu.getNicknameOrTitleWithInsignia();
    // Now identify which is the best other voice room to move them to.
    // For now choose the fullest other voice room the member is
    // allowed to join. In the future personalize this so it uses the
    // coplay time to choose the most familiar group to place the member with.
    console.log(`Looking for destination for ${name}`);
    let bestDestination;
    let bestDestinationPop = 0;
    for (const channel of voiceChannels) {
	const overflowLimit = channel.userLimit - 2;
	let superiorCount = 0;
	for (const [id, member] of channel.members) {
	    const voiceUser = UserCache.GetCachedUserByDiscordId(member.id);
	    if (voiceUser.harmonic_centrality > cu.harmonic_centrality) {
		superiorCount++;
	    }
	}
	console.log(`superiorCount ${superiorCount}`);
	if (superiorCount >= overflowLimit) {
	    continue;
	}
	const pop = channel.members.size;
	if (pop > bestDestinationPop) {
	    bestDestination = channel;
	    bestDestinationPop = pop;
	}
    }
    // If a good destination was found then move the member.
    if (bestDestination) {
	console.log(`Best destination found. Moving member.`);
	await memberToMove.voice.setChannel(bestDestination);
	return true;
    }
    console.log('No suitable destination found for member.');
    // Buddy rule. Never move a member into a room where they are alone.
    if (overflowMembers.length < 2) {
	console.log('Bailing due to buddy rule.');
	return false;
    }
    // If we end up with at least 2 overflow members and nowhere to put them,
    // then move them to an empty Main room together.
    console.log('Trying to find an empty v channel to populate.');
    let emptyMainChannel;
    for (const channel of mainChannels) {
	if (channel.members.size === 0) {
	    emptyMainChannel = channel;
	    break;
	}
    }
    if (!emptyMainChannel) {
	// No empty Main channel. This is usually temporary.
	// Return true to try again in a short time and hopefully
	// there will be an empty Main channel by then.
	console.log(`Failed to find an empty Main channel. Bailing.`);
	return true;
    }
    console.log(`Overflow moving 2 members into an empty Main channel together.`);
    const [dumb, dumber] = overflowMembers.slice(-2);
    if (dumb) {
	console.log('Moving 1st member to empty Main channel.');
	await dumb.voice.setChannel(emptyMainChannel);
    }
    if (dumber) {
	console.log('Moving 2nd member to empty Main channel.');
	await dumber.voice.setChannel(emptyMainChannel);
    }
    return true;
}

async function GetAllDiscordAccountsFromRustCultApi() {
    if (!config.rustCultApiToken) {
	console.log('Cannot update prox because no api token.');
	return null;
    }
    const randomNonce = Math.random().toString();
    const url = 'https://rustcult.com/getalldiscordaccounts?token=' + config.rustCultApiToken + '&nonce=' + randomNonce;
    let response;
    try {
	response = await fetch(url);
    } catch (error) {
	console.log('Cannot update prox because error while querying rustcult API.');
	return null;
    }
    if (!response) {
	console.log('Cannot update prox because no response received.');
	return null;
    }
    if (typeof response !== 'string') {
	console.log('Cannot update prox because response is not a string.');
	return null;
    }
    return response;
}

async function UpdateSteamAccountInfo() {
    // Hit the rustcult.com API to get updated player positions.
    const response = await GetAllDiscordAccountsFromRustCultApi();
    if (!response) {
	return;
    }
    const linkedAccounts = JSON.parse(response);
    console.log(linkedAccounts.length, 'linked accounts downloaded from rustcult.com API.');
    for (const account of linkedAccounts) {
	if (!account) {
	    return;
	}
	if (!account.discordId) {
	    return;
	}
	if (!account.steamId) {
	    return;
	}
	if (account.discordId === '294544723518029824') {
	    console.log('crudeoil found!!!');
	}
	const cu = UserCache.GetCachedUserByDiscordId(account.discordId);
	if (!cu) {
	    console.log('Discord ID not found ' + account.discordId);
	    continue;
	}
	await cu.setSteamId(account.steamId);
	await cu.setSteamName(account.steamName);
	console.log('Linked account ' + cu.getNicknameOrTitleWithInsignia() + ' ' + account.discordId + ' ' + account.steamId);
    }
}

// Update steam account info once after startup, then hourly after that.
setTimeout(UpdateSteamAccountInfo, 15 * 1000);
setInterval(UpdateSteamAccountInfo, 60 * 60 * 1000);

// To avoid race conditions on the cheap, use a system of routine updates.
// To schedule an update, a boolean flag is flipped. That way, the next time
// the cycle goes around, it knows that an update is needed. Redundant or
// overlapping updates are avoided this way.
let isUpdateNeeded = false;
setTimeout(HuddlesUpdate, 9000);

async function HuddlesUpdate() {
    if (isUpdateNeeded) {
	const guild = await DiscordUtil.GetMainDiscordGuild();
	for (const huddle of huddles) {
	    await UpdateVoiceChannelsForOneHuddleType(guild, huddle);
	}
	const roomsInOrder = await MoveOneRoomIfNeeded(guild);
	isUpdateNeeded = !roomsInOrder;
    }
    setTimeout(HuddlesUpdate, 1000);
}

function ScheduleUpdate() {
    isUpdateNeeded = true;
}

module.exports = {
    ScheduleUpdate,
};
