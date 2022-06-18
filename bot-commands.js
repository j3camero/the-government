// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const diff = require('diff');
const DiscordUtil = require('./discord-util');
const FilterUsername = require('./filter-username');
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
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	return;
    }
    const name = cu.getNicknameOrTitleWithInsignia();
    const pin = RandomPin();
    await discordMessage.author.send(pin);
    await discordMessage.channel.send(`Sent a random code to ${name}`);
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

async function MakeOneServerVoteOption(channel, serverName, battlemetricsLink, peakRank, playerDensity, bpWipe) {
    const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank} ★ ${playerDensity} players / sq km ★ ${bpWipe}_`;
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
    const message = await channel.send('The Government will play on whichever server gets the most _upvotes minus downvotes_. This will be our main home Rust server for the month of June.');
    await message.react('❤️');
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Monthly|', 'https://www.battlemetrics.com/servers/rust/9611162', 5, 28, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Small|', 'https://www.battlemetrics.com/servers/rust/2933470', 30, 24, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long II', 'https://www.battlemetrics.com/servers/rust/2036399', 56, 11, 'Yes BP wipe');
    await MakeOneServerVoteOption(channel, 'PICKLE VANILLA MONTHLY', 'https://www.battlemetrics.com/servers/rust/4403307', 116, 16, 'No BP wipe');
    await MakeOneServerVoteOption(channel, '[US East] Facepunch Hapis', 'https://www.battlemetrics.com/servers/rust/2317951', 280, 12, 'BP wipe unknown');
}

async function HandleRecoilVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('recoil-vote');
    const message = await channel.send(
	'__**Official Recoil Vote**__\n' +
	'The Rust dev team has heard our pleas. They have agreed to respect the results of this vote.\n\n' +
	'Vote YES to roll out the new Recoil system on June 2.\n\n' +
	'Vote NO to scrap the proposed changes.\n\n' +
	'The devs have heard us loud and clear. After many denials, they now admit the need to urgently rethink the recoil changes. To make a final decision, they decided to have the poll in the largest community of active Rust players.\n\n' +
	'                         --The Government'
    );
}

async function HandleVoiceActiveUsersCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length != 2) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !activeusers daysToLookback');
	return;
    }
    const daysToLookbackAsText = tokens[1];
    if (isNaN(daysToLookbackAsText)) {
	await discordMessage.channel.send('Invalid arguments.\nUSAGE: !voiceactiveusers daysToLookback');
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
	ordersMessage += `These are your secret orders for the month of June.\n\n`;
	ordersMessage += `Report to the Rust server PICKLE VANILLA MONTHLY.\n\n`;
	ordersMessage += '```client.connect vanilla.pickleservers.com:28046```\n\n';
	ordersMessage += `We are going to hurt this server. We will use our #map to conquer all opposing groups. Members are building so many cool projects in our village this month, it will be like an art gallery.\n\n`;
	ordersMessage += `Run straight to C16. Grab 30 cloth to make yourself a sleeping bag. Hit a tree with your rock to get the first wood for the starter shack. We got this!\n\n`;
	ordersMessage += `Or if you have your own plan, then go for it! File a #ticket to share your base location so we don't all raid each other.\n\n`;
	ordersMessage += `Yours truly,\n`;
	ordersMessage += `The Government  <3`;
	const discordMember = await guild.members.fetch(user.discord_id);
	try {
	    await discordMember.send(ordersMessage);
	} catch (error) {
	    console.log('Failed to send orders to', discordMember.nickname);
	}
	await Sleep(5 * 1000);
    }
}

async function HandleBadgeCommand(discordMessage) {
    const authorMember = discordMessage.member;
    const authorUser = await UserCache.GetCachedUserByDiscordId(authorMember.id);
    if (!authorUser) {
	return;
    }
    const authorName = authorUser.getNicknameOrTitleWithInsignia();
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 4) {
	await discordMessage.channel.send('Invalid arguments. USAGE: !badge give Berry @nickname');
	return;
    }
    const roleName = tokens[2];
    if (roleName.length <= 1) {
	await discordMessage.channel.send('Invalid role name ' + roleName);
	return;
    }
    const juniorRoleName = roleName + ' Badge';
    const seniorRoleName = roleName + ' Committee';
    const juniorRole = await DiscordUtil.GetRoleByName(discordMessage.guild, juniorRoleName);
    if (!juniorRole) {
	await discordMessage.channel.send('No such role ' + juniorRoleName);
	return;
    }
    const seniorRole = await DiscordUtil.GetRoleByName(discordMessage.guild, seniorRoleName);
    if (!seniorRole) {
	await discordMessage.channel.send('No such role ' + seniorRoleName);
	return;
    }
    const has = await DiscordUtil.GuildMemberHasRole(discordMessage.member, seniorRole);
    if (!has) {
	await discordMessage.channel.send(`Only ${seniorRoleName} members can do that.`);
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (tokens[1] === 'give') {
	if (!mentionedMember) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !badge give Berry @nickname');
	    return;
	}
	const hasJunior = await DiscordUtil.GuildMemberHasRole(mentionedMember, juniorRole);
	const hasSenior = await DiscordUtil.GuildMemberHasRole(mentionedMember, seniorRole);
	if (hasJunior || hasSenior) {
	    await discordMessage.channel.send(`That person already has their ${juniorRoleName}.`);
	    return;
	}
	const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
	if (!mentionedCommissarUser) {
	    await discordMessage.channel.send('Cannot find mentioned member in the database. Something must be badly fucked up!');
	    return;
	}
	await DiscordUtil.AddRole(mentionedMember, juniorRole);
	const name = mentionedCommissarUser.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`${name} has been awarded the ${juniorRoleName} by ${authorName}`);
    } else if (tokens[1] === 'remove') {
	if (!mentionedMember) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !badge remove Berry @nickname');
	    return;
	}
	const hasJunior = await DiscordUtil.GuildMemberHasRole(mentionedMember, juniorRole);
	if (!hasJunior) {
	    await discordMessage.channel.send(`That person does not have the ${juniorRoleName}. Cannot remove.`);
	    return;
	}
	const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
	if (!mentionedCommissarUser) {
	    await discordMessage.channel.send('Cannot find mentioned member in the database. Something must be badly fucked up!');
	    return;
	}
	await DiscordUtil.RemoveRole(mentionedMember, juniorRole);
	const name = mentionedCommissarUser.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`${juniorRoleName} has been removed from ${name} by ${authorName}`);
    } else if (tokens[1] === 'color') {
	const colorCode = tokens[3];
	if (colorCode.length !== 6) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !badge color Berry AB0B23');
	    return;
	}
	await juniorRole.setColor(colorCode);
	await seniorRole.setColor(colorCode);
	await discordMessage.channel.send(`Badge color updated successfully.`);
    }
}

async function HandleCommitteeCommand(discordMessage) {
    console.log('!committee command detected.');
    const authorMember = discordMessage.member;
    const authorUser = await UserCache.GetCachedUserByDiscordId(authorMember.id);
    if (!authorUser) {
	return;
    }
    const authorName = authorUser.getNicknameOrTitleWithInsignia();
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 4) {
	await discordMessage.channel.send('Invalid arguments. USAGE: !committee give Berry @nickname');
	return;
    }
    if (tokens[2].length <= 1) {
	await discordMessage.channel.send('Invalid role name ' + tokens[2]);
	return;
    }
    const roleName = tokens[2] + ' Committee';
    console.log('roleName', roleName);
    const role = await DiscordUtil.GetRoleByName(discordMessage.guild, roleName);
    if (!role) {
	console.log('No such role', roleName);
	await discordMessage.channel.send('No such role ' + roleName);
	return;
    }
    const has = await DiscordUtil.GuildMemberHasRole(authorMember, role);
    if (!has) {
	console.log(`Only ${roleName} members can do that.`);
	await discordMessage.channel.send(`Only ${roleName} members can do that.`);
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    console.log('tokens[1]', tokens[1]);
    if (tokens[1] === 'give') {
	console.log('give');
	if (!mentionedMember) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !committee give Berry @nickname');
	    return;
	}
	const hasRole = await DiscordUtil.GuildMemberHasRole(mentionedMember, role);
	if (hasRole) {
	    console.log(`That person is already on the ${roleName}.`);
	    await discordMessage.channel.send(`That person is already on the ${roleName}.`);
	    return;
	}
	const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
	if (!mentionedCommissarUser) {
	    await discordMessage.channel.send('Cannot find mentioned member in the database. Something must be badly fucked up!');
	    return;
	}
	await DiscordUtil.AddRole(mentionedMember, role);
	const name = mentionedCommissarUser.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`${name} has been added to the ${roleName} by ${authorName}`);
    } else if (tokens[1] === 'remove') {
	console.log('remove');
	if (!mentionedMember) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !committee remove Berry @nickname');
	    return;
	}
	const hasRole = await DiscordUtil.GuildMemberHasRole(mentionedMember, role);
	if (!hasRole) {
	    await discordMessage.channel.send(`That person is not on the ${roleName}. Cannot remove.`);
	    return;
	}
	const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
	if (!mentionedCommissarUser) {
	    await discordMessage.channel.send('Cannot find mentioned member in the database. Something must be badly fucked up!');
	    return;
	}
	await DiscordUtil.RemoveRole(mentionedMember, role);
	const name = mentionedCommissarUser.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`${roleName} has been removed from ${name} by ${authorName}`);
    } else if (tokens[1] === 'color') {
	const colorCode = tokens[3];
	if (colorCode.length !== 6) {
	    await discordMessage.channel.send('Invalid arguments. USAGE: !committee color Berry AB0B23');
	    return;
	}
	await role.setColor(colorCode);
	await discordMessage.channel.send(`Badge color updated successfully.`);
    } else {
	await discordMessage.channel.send(`Invalid command !committee`, tokens[1], '. Options are [give|remove|color].');	
    }
}

const wikiChannelId = '987549333144633355';

async function HandleWikiCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const newText = discordMessage.content.substring(6);
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const wikiChannel = await guild.channels.resolve(wikiChannelId);
    const messages = await wikiChannel.messages.fetch();
    const wikiMessage = messages.first();
    const oldText = wikiMessage.content;
    const diffs = diff.diffLines(oldText, newText);
    let diffText = '```diff\n';
    for (const d of diffs) {
	const lines = d.value.split('\n');
	for (let i = 0; i < d.count; i++) {
	    const line = lines[i];
	    if (d.added) {
		diffText += '+';
	    }
	    if (d.removed) {
		diffText += '-';
	    }
	    diffText += line;
	    diffText += '\n';
	}
    }
    diffText += '```';
    await discordMessage.channel.send(diffText);
}

async function HandleNickCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length < 2) {
	await discordMessage.channel.send(`ERROR: wrong number of arguments. USAGE: !nick NewNicknam3`);
	return;
    }
    const raw = discordMessage.content.substring(6);
    const filtered = FilterUsername(raw);
    if (filtered.length === 0) {
	await discordMessage.channel.send(`ERROR: no weird nicknames.`);
	return;
    }
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    await cu.setNick(filtered);
    const newName = cu.getNicknameOrTitleWithInsignia();
    await discordMessage.channel.send(`Changed name to ${newName}`);
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
	'!apprehend': Ban.HandleBanCommand,
	'!arrest': Ban.HandleBanCommand,
	'!art': Artillery,
	'!artillery': Artillery,
	'!badge': HandleBadgeCommand,
	'!ban': Ban.HandleBanCommand,
	'!code': HandleCodeCommand,
	'!committee': HandleCommitteeCommand,
	'!detain': Ban.HandleBanCommand,
	'!fuck': Ban.HandleBanCommand,
	'!gender': HandleGenderCommand,
	'!goodbye': Ban.HandleBanCommand,
	'!howhigh': Artillery,
	'!indict': Ban.HandleBanCommand,
	'!nick': HandleNickCommand,
	'!orders': HandleOrdersCommand,
	'!pardon': Ban.HandlePardonCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	'!recoilvote': HandleRecoilVoteCommand,
	'!servervote': HandleServerVoteCommand,
	'!trial': Ban.HandleBanCommand,
	'!voiceactiveusers': HandleVoiceActiveUsersCommand,
	'!welp': Ban.HandleBanCommand,
	'!wiki': HandleWikiCommand,
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
