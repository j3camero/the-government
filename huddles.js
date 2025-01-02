// Huddles are infinite voice chat rooms. The bot will automatically create
// more rooms so that there are always enough for everyone.
// In practical terms, this solves a common problem in Discord administration
// where you have enough rooms to accomodate peak traffic, with the
// side-effect that it looks extra dead during off-peak times. Huddles
// introduce auto-scaling to Discord voice chat rooms so there are always
// the right amount of rooms no matter how busy.

const config = require('./config');
const DiscordUtil = require('./discord-util');
const fetch = require('./fetch');
const fc = require('./friend-cache');
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
	if (channel.type === 2 && !channel.parent && natoAlphabet.includes(channel.name)) {
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
	    await DiscordUtil.CreateNewVoiceChannel(lowestUnusedLetter);
	}
    }
}

// A comparator for Discord rooms. Controls the sort order of the rooms.
function CompareRooms(a, b) {
    // Empty rooms sort down.
    if (a.memberCount === 0 && b.memberCount > 0) {
	return 1;
    }
    if (a.memberCount > 0 && b.memberCount === 0) {
	return -1;
    }
    // Friend rooms sort down.
    if (a.ownerScore === 0 && b.ownerScore > 0) {
	return -1;
    }
    if (a.ownerScore > 0 && b.ownerScore === 0) {
	return 1;
    }
    // Tie-breaker between friend rooms is rank.
    if (a.ownerScore > 0 && b.ownerScore) {
	return b.ownerScore - a.ownerScore;
    }
    // Should all other criteria fail to break the tie, then alphabetic ordering is the last resort.
    return a.name.localeCompare(b.name);
}

async function SortVoiceRooms() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const allChannels = await guild.channels.fetch();
    const sortableChannels = [];
    for (const [id, channel] of allChannels) {
	if (channel.type === 2 && !channel.parent) {
	    let ownerScore = 0;
	    if (channel.id in fc.friendRoomCache) {
		const ownerId = fc.friendRoomCache[channel.id];
		const cu = UserCache.GetCachedUserByCommissarId(ownerId);
		ownerScore = parseFloat(cu.rank_score);
	    }
	    sortableChannels.push({
		channel,
		memberCount: channel.members.size,
		name: channel.name,
		ownerScore,
	    });
	}
    }
    sortableChannels.sort(CompareRooms);
    const channelPositions = [];
    let positionCount = 0;
    for (const channel of sortableChannels) {
	channelPositions.push({
	    channel: channel.channel.id,
 	    position: positionCount,
	});
	positionCount++;
    }
    await guild.channels.setPositions(channelPositions);
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
	await SortVoiceRooms();
	isUpdateNeeded = false;
    }
    setTimeout(HuddlesUpdate, 5000);
}

function ScheduleUpdate() {
    isUpdateNeeded = true;
}

module.exports = {
    ScheduleUpdate,
};
