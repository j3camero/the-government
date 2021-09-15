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

async function UpdateVoiceChannelsForOneUserLimit(guild, userLimit) {
    const matchingChannels = GetAllMatchingVoiceChannels(guild, userLimit);
    if (matchingChannels.length === 0) {
	console.log('Found no rooms matching', userLimit);
	return;
    }
    console.log('Found', matchingChannels.length, 'matching channels.');
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
