// Routines for handling bot commands like !ping and !ban.

// The given Discord message is already verified to start with the !ping prefix.
// This is an example bot command that has been left in for fun. Maybe it's
// also useful for teaching people how to use bot commands. It's a harmless
// practice command that does nothing.
function HandlePingCommand(discordMessage) {
    discordMessage.channel.send('Pong!');
}

// A cheap live test harness to test the code that finds the main chat channel.
// This lets me test it anytime I'm worried it's broken.
async function HandlePingPublicChatCommand(discordMessage) {
    await DiscordUtil.MessagePublicChatChannel('Pong!');
}

// The given Discord message is already verified to start with the !ban prefix.
// Now authenticate and implement it.
function HandleBanCommand(discordMessage) {
    if (discordMessage.mentions.members.size === 1) {
	const banMember = discordMessage.mentions.members.first();
	discordMessage.channel.send(`Test ban ${banMember.nickname}!`);
    } else if (discordMessage.mentions.members.size < 1) {
	discordMessage.channel.send('Ban who? Example: !ban @nickname');
    } else if (discordMessage.mentions.members.size > 1) {
	discordMessage.channel.send('Must ban exactly one username at a time. Example: !ban @nickname');
    }
}

// Handle any unrecognized commands, possibly replying with an error message.
function HandleUnknownCommand(discordMessage) {
    discordMessage.channel.send(`Unknown command ${command}`);
}

// This function analyzes a Discord message to see if it contains a bot command.
// If so, control is dispatched to the appropriate command-specific handler function.
function Dispatch(discordMessage) {
    if (!discordMessage.content || discordMessage.content.length === 0) {
	return;
    }
    if (discordMessage.content.charAt(0) !== '!') {
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length === 0) {
	return;
    }
    const command = tokens[0];
    if (command === '!ban') {
	HandleBanCommand(discordMessage);
    } else if (command === '!ping') {
	HandlePingCommand(discordMessage);
    } else if (command === '!pingpublic') {
	HandlePingPublicChatCommand(discordMessage);
    } else {
	HandleUnknownCommand(discordMessage);
    }
}

module.exports = {
    Dispatch,
};
