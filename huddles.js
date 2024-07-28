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
    { name: 'Quad', userLimit: 4, position: 4000 },
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
