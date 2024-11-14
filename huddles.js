// Huddles are infinite voice chat rooms. The bot will automatically create
// more rooms so that there are always enough for everyone.
// In practical terms, this solves a common problem in Discord administration
// where you have enough rooms to accomodate peak traffic, with the
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

const natoAlphabet = [
    'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf',
    'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November',
    'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform',
    'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu',
];

async function UpdateHuddles() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const allChannels = await guild.channels.fetch();
    const channelsByName = {};
    const emptyChannels = [];
    for (const [id, channel] of allChannels) {
	if (channel.type === 2 && !channel.parent) {
	    channelsByName[channel.name] = channel;
	    const population = channel.members.size;
	    console.log(channel.name, population);
	    if (population === 0) {
		emptyChannels.push(channel);
	    }
	}
    }
    console.log('emptyChannels.length', emptyChannels.length);
    if (emptyChannels.length > 1) {
	// Too many empty channels. Must delete one.
	emptyChannels.sort((a, b) => b.name.localeCompare(a.name));
	const channelToDelete = emptyChannels[0];
	console.log('Deleting channel', channelToDelete.name);
	await channelToDelete.delete();
    } else if (emptyChannels.length === 0) {
	// No empty channels. Must create a new one.
	let lowestUnusedLetter;
	for (const letter of natoAlphabet) {
	    if (!(letter in channelsByName)) {
		lowestUnusedLetter = letter;
		break;
	    }
	}
	console.log('lowestUnusedLetter', lowestUnusedLetter);
	if (lowestUnusedLetter) {
	    await CreateNewVoiceChannel(lowestUnusedLetter);
	}
    }
}

async function CreateNewVoiceChannelWithBitrate(channelName, bitrate) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const perms = [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel];
    const options = {
	bitrate,
	permissionOverwrites: [
	    { id: guild.roles.everyone, deny: perms },
	    { id: RoleID.Commander, allow: perms },
	    { id: RoleID.General, allow: perms },
	    { id: RoleID.Officer, allow: perms },
	    { id: RoleID.Grunt, allow: perms },
	    { id: RoleID.Bots, allow: perms },
	],
	name: channelName,
	type: 2,
	userLimit: 99,
    };
    if (channelName === 'Alpha') {
	options.permissionOverwrites.push({ id: RoleID.Recruit, allow: perms });
    }
    console.log('Creating channel.');
    return await guild.channels.create(options);
}

async function CreateNewVoiceChannel(channelName) {
    const bitratesToTry = [384000, 256000, 128000];
    for (const bitrate of bitratesToTry) {
	try {
	    return await CreateNewVoiceChannelWithBitrate(channelName, bitrate);
	} catch (err) {
	    console.log('Failed to create channel with bitrate', bitrate);
	}
    }
    console.log('Failed to create channel with any bitrate');
    return null;
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
    // Should all other criteria fail to break the tie, then alphabetic ordering is the last resort.
    return a.name.localeCompare(b.name);
}

// Checks the see if any rooms need to be moved in the ordering, and does so.
// Only moves one room at a time. To achieve a full sort, call this periodically.
// Returns true if no rooms needed moving. Returns false if a room was moved.
async function MoveOneRoomIfNeeded() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
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
	await UpdateHuddles();
	const roomsInOrder = await MoveOneRoomIfNeeded();
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
