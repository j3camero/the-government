// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const DiscordUtil = require('./discord-util');
const moment = require('moment');
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
    // TODO: offer to update the user's secret pinned code.
    //const cu = UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    //if (!cu) {
    //	return;
    //}
    //if (discordMessage.channel.id === cu.friend_text_chat_id) {
    //	const pinnedMessages = await discordMessage.channel.messages.fetchPinned();
    //	await message.pin();
    //}
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
async function HandleBanCommand(discordMessage) {
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!ban` one person at a time.\n' +
	    'Example: `!ban @nickname`\n' +
	    'Example: `!ban 987654321098765432`'
	);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    if (mentionedUser.ban_vote_end_time) {
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is already on trial.`);
	return;
    }
    await discordMessage.channel.send(`Test ban ${mentionedUser.getNicknameWithInsignia()}!`);
    const sevenDays = moment().add(7, 'days').format();
    await mentionedUser.setBanVoteEndTime(sevenDays);
    const banCourtCategory = await DiscordUtil.GetBanCourtCategoryChannel();
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const roomName = mentionedUser.nickname;
    const channel = await guild.channels.create(roomName, { type: 'text' });
    await mentionedUser.setBanVoteChatroom(channel.id);
    await channel.setParent(banCourtCategory);
    const message = await channel.send('```The People v Jeff```');
    await mentionedUser.setBanVoteMessage(message.id);
}

// The given Discord message is already verified to start with the !pardon prefix.
async function HandlePardonCommand(discordMessage) {
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!pardon` one person at a time.\n' +
	    'Example: `!pardon @nickname`\n' +
	    'Example: `!pardon 987654321098765432`'
	);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    if (mentionedUser.ban_vote_end_time) {
	await mentionedUser.setBanVoteEndTime(null);
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    if (mentionedUser.ban_vote_chatroom) {
	const channel = await guild.channels.resolve(mentionedUser.ban_vote_chatroom);
	await channel.delete();
	await mentionedUser.setBanVoteChatroom(null);
    }
    if (mentionedUser.ban_vote_message) {
	await mentionedUser.setBanVoteMessage(null);
    }
    await discordMessage.channel.send(`Programmer pardon ${mentionedUser.getNicknameWithInsignia()}!`);
}

async function ParseExactlyOneMentionedDiscordMember(discordMessage) {
    // Look for exactly one member being mentioned.
    let mentionedMember;
    // First, check for explicit @mentions. There must be at most 1 or it's an error.
    if (!discordMessage ||
	!discordMessage.mentions ||
	!discordMessage.mentions.members ||
	discordMessage.mentions.members.size < 1) {
	// No members mentioned using @mention. Do nothing. A member might be mentioned
	// in another way, such as by Discord ID.
    } else if (discordMessage.mentions.members.size === 1) {
	return discordMessage.mentions.members.first();
    } else if (discordMessage.mentions.members.size > 1) {
	return null;
    }
    // Second, check for mentions by full Discord user ID. This will usually be a long
    // sequence of digits. Still, finding more than 1 mentioned member is an error.
    const tokens = discordMessage.content.split(' ');
    // Throw out the first token, which we know is the command itself. Keep only the arguments.
    tokens.shift();
    for (const token of tokens) {
	const isNumber = /^\d+$/.test(token);
	if (token.length > 5 && isNumber) {
	    if (mentionedMember) {
		return null;
	    }
	    try {
		const guild = await DiscordUtil.GetMainDiscordGuild();
		mentionedMember = await guild.members.fetch(token);
	    } catch (error) {
		return null;
	    }
	} else {
	    return null;
	}
    }
    // We might get this far and find no member mentioned by @ or by ID.
    if (!mentionedMember) {
	return null;
    }
    // If we get this far, it means we found exactly one member mentioned,
    // whether by @mention or by user ID.
    return mentionedMember;
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
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
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
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
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
	'!ban': HandleBanCommand,
	'!code': HandleCodeCommand,
	'!gender': HandleGenderCommand,
	'!art': Artillery,
	'!artillery': Artillery,
	'!howhigh': Artillery,
	'!pardon': HandlePardonCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	'!friend': HandleFriendCommand,
	'!unfriend': HandleUnfriendCommand,
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
