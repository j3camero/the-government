//
//
//

const DiscordUtil = require('./discord-util');

const channelNames = {
    2: 'Duo Room',
    3: 'Trio Room',
    4: 'Quad Room',
    6: 'Six Pack',
    8: 'Eight Pack',
};

function GetAllMatchingVoiceChannels(guild, userLimit) {
    const matchingChannels = [];
    // Necessary in case a string key is passed in. Object keys are sometimes showing up as strings.
    userLimit = parseInt(userLimit);
    const channelName = channelNames[userLimit];
    for (const [id, channel] of guild.channels.cache) {
	if (channel.type === 'voice' &&
	    channel.name === channelName &&
	    channel.userLimit === userLimit) {
	    matchingChannels.push(channel);
	}
    }
    return matchingChannels;
}

async function CreateNewVoiceChannel(guild, userLimit) {
    const channelName = channelNames[userLimit];
    const parent = await DiscordUtil.GetCategoryChannelByName('Public');
    const options = {
	parent,
	position: 1000 * userLimit,
	type: 'voice',
	userLimit,
    };
    console.log('Creating channel.');
    await guild.channels.create(channelName, options);
    console.log('Done');
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

function GetMinimumPositionOfVoiceChannels(channels) {
    let minPos;
    for (const channel of channels) {
	if (!minPos || channel.position < minPos) {
	    minPos = channel.position;
	}
    }
    return minPos;
}

async function UpdateVoiceChannelsForOneUserLimit(guild, userLimit) {
    const matchingChannels = GetAllMatchingVoiceChannels(guild, userLimit);
    if (matchingChannels.length === 0) {
	console.log('Found no rooms matching', userLimit);
	return;
    }
    console.log('Found', matchingChannels.length, 'matching channels.');
    const emptyChannels = matchingChannels.filter(ch => ch.members.size === 0);
    console.log(emptyChannels.length, 'empty channels of this type.');
    if (emptyChannels.length === 0) {
	await CreateNewVoiceChannel(guild, userLimit);
    } else if (emptyChannels.length >= 2) {
	await DeleteMostRecentlyCreatedVoiceChannel(emptyChannels);
    } else {
	// There is exactly 1 empty channel. Do nothing.
    }
}

async function Update() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    for (const userLimit in channelNames) {
	await UpdateVoiceChannelsForOneUserLimit(guild, userLimit);
    }
}

module.exports = {
    Update,
};
