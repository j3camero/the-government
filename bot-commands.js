// Routines for handling bot commands like !ping and !ban.
const UserCache = require('./user-cache');

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
    // TODO: add permissions so only high ranking people can use
    // this command.
    await DiscordUtil.MessagePublicChatChannel('Pong!');
}

// A message that starts with !gender.
async function HandleGenderCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = UserCache.GetCachedUserByDiscordId(discordId);
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error: wrong number of parameters. Example: `!gender F`');
	return;
    }
    if (tokens[0] !== '!gender') {
	// This should never happen, but just in case...
	throw 'Handler only handles the !gender function. Possible dispatch error.';
    }
    const genderString = tokens[1].toUpperCase();
    if (genderString.length !== 1 || !genderString.match(/[A-Z]/i)) {
	await discordMessage.channel.send('Error: gender must be exactly one letter. Example: `!gender F`');
	return;
    }
    await cu.setGender(genderString);
    await discordMessage.channel.send(`Gender changed to ${genderString}.`);
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
    // TODO: add permission checks. Only high enough ranks should get a error
    // message as a reply. Those of lower rank shouldn't get any response at
    // all to avoid spam.
    discordMessage.channel.send(`Unknown command.`);
}

// This function analyzes a Discord message to see if it contains a bot command.
// If so, control is dispatched to the appropriate command-specific handler function.
async function Dispatch(discordMessage) {
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
	await HandleBanCommand(discordMessage);
    } else if (command === '!gender') {
	await HandleGenderCommand(discordMessage);
    } else if (command === '!ping') {
	await HandlePingCommand(discordMessage);
    } else if (command === '!pingpublic') {
	await HandlePingPublicChatCommand(discordMessage);
    } else {
	await HandleUnknownCommand(discordMessage);
    }
}

module.exports = {
    Dispatch,
};
