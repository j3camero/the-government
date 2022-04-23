// Huddles are infinite voice chat rooms. The bot will automatically create
// more rooms of each type so that there are always enough for everyone.
// In practical terms, this solves a common problem in Discord administration
// where you have way too many rooms to accomodate peak traffic, with the
// side-effect that it looks extra dead during off-peak times. Huddles
// introduce auto-scaling to Discord voice chat rooms so there are always
// the right amount of rooms no matter how busy.

const DiscordUtil = require('./discord-util');
const RoleID = require('./role-id');

const huddles = [
    { name: 'Main', userLimit: 99, position: 1000 },
    { name: 'Duo', userLimit: 2, position: 2000 },
    { name: 'Trio', userLimit: 3, position: 3000 },
    { name: 'Quad', userLimit: 4, position: 4000 },
    //{ name: 'Five Room', userLimit: 5, position: 5000 },
    //{ name: 'Six Pack', userLimit: 6, position: 6000 },
    { name: 'Squad', userLimit: 8, position: 7000 },
];

function GetAllMatchingVoiceChannels(guild, huddle) {
    const matchingChannels = [];
    // Necessary in case a string key is passed in. Object keys are
    // sometimes showing up as strings.
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 'voice' &&
	    channel.name === huddle.name &&
	    channel.userLimit === parseInt(huddle.userLimit)) {
	    matchingChannels.push(channel);
	}
    }
    return matchingChannels;
}

async function CreateNewVoiceChannelWithBitrate(guild, huddle, bitrate) {
    const perms = ['CONNECT', 'VIEW_CHANNEL'];
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
	position: huddle.position,
	type: 'voice',
	userLimit: huddle.userLimit,
    };
    console.log('Creating channel.');
    await guild.channels.create(huddle.name, options);
    console.log('Done');
}

async function CreateNewVoiceChannel(guild, huddle) {
    const preferredBitrate = 128000;
    try {
	await CreateNewVoiceChannelWithBitrate(guild, huddle, preferredBitrate);
    } catch (err) {
	// If channel creation fails, assume that it's because of the bitrate and try again.
	// This will save us if the server loses Discord Nitro levels.
	await CreateNewVoiceChannelWithBitrate(guild, huddle);
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

// To avoid race conditions on the cheap, use a system of routine updates.
// To schedule an update, a boolean flag is flipped. That way, the next time
// the cycle goes around, it knows that an update is needed. Redundant or
// overlapping updates are avoided this way.
let isUpdateNeeded = false;
setInterval(Update, 10 * 1000);

async function Update() {
    if (!isUpdateNeeded) {
	return;
    }
    isUpdateNeeded = false;
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const huddle of huddles) {
	await UpdateVoiceChannelsForOneHuddleType(guild, huddle);
    }
}

function ScheduleUpdate() {
    isUpdateNeeded = true;
}

module.exports = {
    ScheduleUpdate,
};
