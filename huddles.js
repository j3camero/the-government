//
//
//

const DiscordUtil = require('./discord-util');
const RoleID = require('./role-id');

const huddles = [
    { name: 'Main', userLimit: 99, position: 1000 },
    { name: 'Squad', userLimit: 8, position: 2000 },
    { name: 'Six Pack', userLimit: 6, position: 3000 },
    { name: 'High Five', userLimit: 5, position: 4000 },
    { name: 'Quad Room', userLimit: 4, position: 5000 },
    { name: 'Trio Room', userLimit: 3, position: 6000 },
    { name: 'Duo Room', userLimit: 2, position: 7000 },
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
    await channel.delete();
    console.log('Done');
}

async function UpdateVoiceChannelsForOneHuddleType(guild, huddle) {
    const matchingChannels = GetAllMatchingVoiceChannels(guild, huddle);
    if (matchingChannels.length === 0) {
	console.log('Found no rooms matching', JSON.stringify(huddle));
	await CreateNewVoiceChannel(guild, huddle);
	return;
    }
    console.log('Found', matchingChannels.length, 'matching channels.');
    for (const channel of matchingChannels) {
	await channel.setPosition(huddle.position);
    }
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

async function Update() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const huddle of huddles) {
	await UpdateVoiceChannelsForOneHuddleType(guild, huddle);
    }
}

module.exports = {
    Update,
};
