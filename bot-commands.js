// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const DiscordUtil = require('./discord-util');
const RandomPin = require('./random-pin');
const UserCache = require('./user-cache');

// The given Discord message is already verified to start with the !ping prefix.
// This is an example bot command that has been left in for fun. Maybe it's
// also useful for teaching people how to use bot commands. It's a harmless
// practice command that does nothing.
async function HandlePingCommand(discordMessage) {
    await discordMessage.channel.send('Pong!');
}

// A cheap live test harness to test the code that finds the main chat channel.
// This lets me test it anytime I'm worried it's broken.
async function HandlePingPublicChatCommand(discordMessage) {
    // TODO: add permissions so only high ranking people can use
    // this command.
    await DiscordUtil.MessagePublicChatChannel('Pong!');
}

// A message that starts with !code.
async function HandleCodeCommand(discordMessage) {
    const pin = RandomPin();
    const message = await discordMessage.channel.send(pin);
}

// A message that starts with !gender.
async function HandleGenderCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	throw 'Message author not found in database.';
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error: wrong number of parameters. Example: `!gender F`');
	return;
    }
    const genderString = tokens[1].toUpperCase();
    if (genderString.length !== 1 || !genderString.match(/[A-Z]/i)) {
	await discordMessage.channel.send('Error: gender must be exactly one letter. Example: `!gender F`');
	return;
    }
    await cu.setGender(genderString);
    await discordMessage.channel.send(`Gender changed to ${genderString}.`);
}

// The given Discord message is already verified to start with the !friend prefix.
async function HandleFriendCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author.friend_category_id) {
	await discordMessage.channel.send(
	    'You are not high-ranking enough to use this command.'
	);
	return;	
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!friend` one person at a time.\n' +
	    'Example: `!friend @nickname`\n' +
	    'Example: `!friend 987654321098765432`'
	);
	return;
    }
    const mentioned = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const friendCategory = await guild.channels.resolve(author.friend_category_id);
    const newPermissions = {
	'CONNECT': true,
	'VIEW_CHANNEL': true,
    };
    await friendCategory.createOverwrite(mentioned.discord_id, newPermissions);
    await discordMessage.channel.send(
	`${author.getNicknameWithInsignia()} added ${mentioned.getNicknameWithInsignia()} to ${author.getPossessivePronoun()} friend list.`
    );
}

// The given Discord message is already verified to start with the !unfriend prefix.
async function HandleUnfriendCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author.friend_category_id) {
	await discordMessage.channel.send('You are not high-ranking enough to use this command.');
	return;	
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!unfriend` one person at a time.\n' +
	    'Example: `!unfriend @nickname`\n' +
	    'Example: `!unfriend 987654321098765432`'
	);
	return;
    }
    const mentioned = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    if (author.commissar_id === mentioned.commissar_id) {
	await discordMessage.channel.send('You can\'t `!unfriend` yourself.');
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const friendCategory = await guild.channels.resolve(author.friend_category_id);
    const noPermissions = {};
    await friendCategory.createOverwrite(mentioned.discord_id, noPermissions);
    await discordMessage.channel.send(
	`${author.getNicknameWithInsignia()} removed ${mentioned.getNicknameWithInsignia()} from ${author.getPossessivePronoun()} friend list.`
    );
}

// Handle any unrecognized commands, possibly replying with an error message.
async function HandleUnknownCommand(discordMessage) {
    // TODO: add permission checks. Only high enough ranks should get a error
    // message as a reply. Those of lower rank shouldn't get any response at
    // all to avoid spam.
    //await discordMessage.channel.send(`Unknown command.`);
}

// This function analyzes a Discord message to see if it contains a bot command.
// If so, control is dispatched to the appropriate command-specific handler function.
async function Dispatch(discordMessage) {
    const handlers = {
	'!ban': Ban.HandleBanCommand,
	'!code': HandleCodeCommand,
	'!gender': HandleGenderCommand,
	'!art': Artillery,
	'!artillery': Artillery,
	'!howhigh': Artillery,
	'!pardon': Ban.HandlePardonCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	// Uncomment the 2 lines below to re-enable the !friend commands.
	//'!friend': HandleFriendCommand,
	//'!unfriend': HandleUnfriendCommand,
    };
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
    if (command in handlers) {
	const handler = handlers[command];
	await handler(discordMessage);
    } else {
	await HandleUnknownCommand(discordMessage);
    }
}

module.exports = {
    Dispatch,
};
