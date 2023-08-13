// Huddles are infinite voice chat rooms. The bot will automatically create
// more rooms of each type so that there are always enough for everyone.
// In practical terms, this solves a common problem in Discord administration
// where you have way too many rooms to accomodate peak traffic, with the
// side-effect that it looks extra dead during off-peak times. Huddles
// introduce auto-scaling to Discord voice chat rooms so there are always
// the right amount of rooms no matter how busy.

const { PermissionFlagsBits } = require('discord.js');
const DiscordUtil = require('./discord-util');
const RoleID = require('./role-id');
const UserCache = require('./user-cache');

const huddles = [
    { name: 'Main', userLimit: 99, position: 1000 },
    { name: 'Duo', userLimit: 2, position: 2000 },
    { name: 'Trio', userLimit: 3, position: 3000 },
    { name: 'Quad', userLimit: 4, position: 4000 },
    { name: 'Squad', userLimit: 8, position: 7000 },
];

function GetAllMatchingVoiceChannels(guild, huddle) {
    const matchingChannels = [];
    // Necessary in case a string key is passed in. Object keys are
    // sometimes showing up as strings.
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
	    { id: RoleID.Admin, allow: perms },
	    { id: RoleID.General, allow: perms },
	    { id: RoleID.Officer, allow: perms },
	    { id: RoleID.Grunt, allow: perms },
	    { id: RoleID.Bots, allow: perms },
	],
	name: huddle.name,
	type: 2,
	userLimit: huddle.userLimit,
    };
    console.log('Creating channel.');
    await guild.channels.create(options);
    console.log('Done');
}

async function CreateNewVoiceChannel(guild, huddle) {
    const level3Bitrate = 384000;
    const level2Bitrate = 128000;
    try {
	await CreateNewVoiceChannelWithBitrate(guild, huddle, level3Bitrate);
    } catch (err) {
	try {
	    await CreateNewVoiceChannelWithBitrate(guild, huddle, level2Bitrate);
	} catch (err) {
	    // If channel creation fails, assume that it's because of the bitrate and try again.
	    // This will save us if the server loses Discord Nitro levels.
	    await CreateNewVoiceChannelWithBitrate(guild, huddle);
	}
    }
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
    //for (const channel of matchingChannels) {
    //	await channel.setPosition(huddle.position);
    //}
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
    // The room with the most senior member wins.
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
    // Rooms named Main sort up.
    if (a.name !== 'Main' && b.name === 'Main') {
	return 1;
    }
    if (a.name === 'Main' && b.name !== 'Main') {
	return -1;
    }
    // Rooms with lower capacity sort up.
    if (a.userLimit > b.userLimit) {
	return 1;
    }
    if (a.userLimit < b.userLimit) {
	return -1;
    }
    // Rooms named Officers Only go next.
    if (a.name !== 'Officers Only' && b.name === 'Officers Only') {
	return 1;
    }
    if (a.name === 'Officers Only' && b.name !== 'Officers Only') {
	return -1;
    }
    // Rooms named Generals Only go next.
    if (a.name !== 'Generals Only' && b.name === 'Generals Only') {
	return 1;
    }
    if (a.name === 'Generals Only' && b.name !== 'Generals Only') {
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

// Enforces a population cap on the Main voice chat rooms by moving low-ranking members around.
// Returns true if it had to move anyone, and false if no moves are needed.
async function Overflow(guild) {
    console.log(`Overflow`);
    const mainChannels = [];
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 2 && !channel.parent && channel.name === 'Main') {
	    mainChannels.push(channel);
	}
    }
    console.log(`${mainChannels.length} Main voice channels detected.`);
    const overflowLimit = 20;
    console.log(`overflowLimit ${overflowLimit}`);
    const overflowMembers = [];
    for (const channel of mainChannels) {
	const pop = channel.members.size;
	console.log('Main room with pop', pop);
	if (pop <= overflowLimit) {
	    continue;
	}
	const howManyExtra = pop - overflowLimit;
	const lowest = GetLowestRankingMembersFromVoiceChannel(channel, howManyExtra);
	for (const member of lowest) {
	    overflowMembers.push(member);
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
    // Now identify which is the best other Main room to move them to.
    // For now choose the fullest other Main room the member is
    // allowed to join. In the future personalize this so it uses the
    // coplay time to choose the most familiar group to place the member with.
    console.log(`Looking for destination for ${name}`);
    let bestDestination;
    let bestDestinationPop = 0;
    for (const channel of mainChannels) {
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
	const pop = channel.members.length;
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
    console.log('Trying to find an empty main channel to populate.');
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

// To avoid race conditions on the cheap, use a system of routine updates.
// To schedule an update, a boolean flag is flipped. That way, the next time
// the cycle goes around, it knows that an update is needed. Redundant or
// overlapping updates are avoided this way.
let isUpdateNeeded = false;
setInterval(Update, 5 * 1000);

async function Update() {
    if (!isUpdateNeeded) {
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const huddle of huddles) {
	await UpdateVoiceChannelsForOneHuddleType(guild, huddle);
    }
    const overflowMovedAnyone = await Overflow(guild);
    const roomsInOrder = await MoveOneRoomIfNeeded(guild);
    isUpdateNeeded = overflowMovedAnyone || !roomsInOrder;
}

function ScheduleUpdate() {
    isUpdateNeeded = true;
}

module.exports = {
    ScheduleUpdate,
};
