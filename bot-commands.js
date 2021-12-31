// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const DiscordUtil = require('./discord-util');
const RandomPin = require('./random-pin');
const Sleep = require('./sleep');
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

async function MakeOneServerVoteOption(channel, serverName, battlemetricsLink, peakRank) {
    const text = `__**${serverName}**__\n${battlemetricsLink}\nPeak rank #${peakRank}`;
    const message = await channel.send(text);
    await message.react('👍');
    await message.react('👎');    
}

async function HandleServerVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('server-vote');
    const message = await channel.send('The Government will play on whichever server gets the most _upvotes minus downvotes_. This will be our main home Rust server for the month of January.');
    await message.react('❤️');
    await MakeOneServerVoteOption(channel, 'Rusty|Vanilla|Long|Monthly', 'https://www.battlemetrics.com/servers/rust/433706', 417);
    await MakeOneServerVoteOption(channel, 'PICKLE VANILLA MONTHLY', 'https://www.battlemetrics.com/servers/rust/4403307', 106);
    await MakeOneServerVoteOption(channel, 'Rustopia US Small', 'https://www.battlemetrics.com/servers/rust/3444203', 248);
    await MakeOneServerVoteOption(channel, '[US EAST] Facepunch 3', 'https://www.battlemetrics.com/servers/rust/9622793', 313);
    await MakeOneServerVoteOption(channel, '[US West] Facepunch Hapis', 'https://www.battlemetrics.com/servers/rust/2350362', 375);
}

async function HandleVoiceActiveUsersCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length != 2) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !activeusers daysToLookback');
	return;
    }
    const daysToLookbackAsText = tokens[1];
    if (isNaN(daysToLookbackAsText)) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !orders daysToLookback');
	return;
    }
    const daysToLookback = parseInt(daysToLookbackAsText);
    const voiceActiveUsers = UserCache.CountVoiceActiveUsers(daysToLookback);
    await discordMessage.channel.send(`${voiceActiveUsers} users active in voice chat in the last ${daysToLookback} days.`);
}

async function HandleOrdersCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length != 2) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !orders daysToLookback');
	return;
    }
    const daysToLookbackAsText = tokens[1];
    if (isNaN(daysToLookbackAsText)) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !orders daysToLookback');
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const daysToLookback = parseInt(daysToLookbackAsText);
    const recentActiveUsers = UserCache.GetUsersSortedByLastSeen(daysToLookback);
    await discordMessage.channel.send(`Sending orders to ${recentActiveUsers.length} members. Restart the bot now if this is not right.`);
    await Sleep(10 * 1000);
    for (const user of recentActiveUsers) {
	const name = user.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`Sending orders to ${name}`);
	const rankNameAndInsignia = user.getRankNameAndInsignia();
	let ordersMessage = `${rankNameAndInsignia},\n\n`;
	ordersMessage += `These are your secret orders for the month of January.\n\n`;
	ordersMessage += `Report to the Rust server Rusty|Vanilla|Long|Monthly. Build a compact base. File a #ticket in The Government Discord with your exact base location. Your base will be added to the interactive #map.\n\n`;
	ordersMessage += '```client.connect 162.248.92.47:25215```\n\n';
	ordersMessage += `You can build with or near other Government operatives. You can also build alone. The Government uses the #map to avoid raiding its own members.\n\n`;
	ordersMessage += `Store a kit so you can work security at raids. Learn BPs so you can launch your own raids. Announce your raids as far in advance as possible so that others can work security for you. No sticky fingers: loot goes to whoever farmed the boom.\n\n`;
	ordersMessage += `Yours truly,\n`;
	ordersMessage += `The Government`;
	const discordMember = await guild.members.fetch(user.discord_id);
	discordMember.send(ordersMessage);
	await Sleep(5 * 1000);
    }
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
	'!art': Artillery,
	'!artillery': Artillery,
	'!ban': Ban.HandleBanCommand,
	'!code': HandleCodeCommand,
	'!gender': HandleGenderCommand,
	'!howhigh': Artillery,
	'!orders': HandleOrdersCommand,
	'!pardon': Ban.HandlePardonCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	'!servervote': HandleServerVoteCommand,
	'!voiceactiveusers': HandleVoiceActiveUsersCommand,
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
