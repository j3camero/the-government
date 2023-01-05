// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const diff = require('diff');
const DiscordUtil = require('./discord-util');
const FilterUsername = require('./filter-username');
const RandomPin = require('./random-pin');
const rules = require('./rules');
const Sleep = require('./sleep');
const UserCache = require('./user-cache');
const yen = require('./yen');

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
    //const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank} ★ ${playerDensity} players / sq km ★ ${bpWipe}_`;
    const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank} ★ ${playerDensity} players / sq km_`;
    const message = await channel.send(text);
    await message.react('✅');
}

async function HandleServerVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('server-vote');
    const message = await channel.send(
	'The Government will play on whichever server gets the most votes. This will be our main home Rust server for the month of January 2023.\n\n' +
	'Every top 100 US monthly vanilla server is included. Blueprints will likely wipe for all Official servers. BP wipe status for community servers is unknown. Grinding for BPs is not advised. Happy New Year!'
    );
    await message.react('❤️');
    await MakeOneServerVoteOption(channel, 'Rustopia US Large', 'https://www.battlemetrics.com/servers/rust/14876729', 16, 15, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustoria.co - US Long', 'https://www.battlemetrics.com/servers/rust/9594576', 1, 30, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Monthly|', 'https://www.battlemetrics.com/servers/rust/9611162', 1, 16, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Reddit.com/r/PlayRust - US Monthly', 'https://www.battlemetrics.com/servers/rust/3345988', 13, 16, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Small|', 'https://www.battlemetrics.com/servers/rust/2933470', 24, 33, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long III', 'https://www.battlemetrics.com/servers/rust/433754', 39, 11, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long II', 'https://www.battlemetrics.com/servers/rust/2036399', 46, 11, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long', 'https://www.battlemetrics.com/servers/rust/1477148', 56, 11, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustopia.gg - US Small', 'https://www.battlemetrics.com/servers/rust/14876730', 66, 21, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'PICKLE VANILLA MONTHLY', 'https://www.battlemetrics.com/servers/rust/4403307', 112, 12, 'No BP wipe');
    await MakeOneServerVoteOption(channel, '[US West] Facepunch Hapis', 'https://www.battlemetrics.com/servers/rust/2350362', 611, 4, 'No BP wipe');
    await MakeOneServerVoteOption(channel, 'Rustoria.co - US Main', 'https://www.battlemetrics.com/servers/rust/6324892', 2, 44, 'No BP wipe');
}

async function MakeOnePresidentVoteOption(channel, playerName) {
    const text = `**${playerName} ★**`;
    const message = await channel.send(text);
    await message.react('✅');
}

async function HandlePresidentVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('presidential-election');
    const message = await channel.send('Whoever gets the most votes will be Mr. or Madam President in January 2023. Mr. or Madam President has the power to choose where The Government builds on wipe day. If they fail to make a clear choice 20 minutes into the wipe, then it falls to the runner-up, Mr. or Madam Vice President. The community base will be there and most players will build nearby. Nobody is forced - if you want to build elsewhere then you can. Mr. or Madam President receives tax revenue from automated taxes, to spend as they see fit in support of the team.');
    await message.react('❤️');
    const candidates = [
	'Dannykun',
	'PalmTiger',
	'scientist.exe',
	'Aperture',
	'Neff',
	'Ducks',
	'Reefer',
	'Jeff',
	'Sky312line',
	'Egon',
	'Beary Berry',
	'TheBuschman (Waldo)',
	'Brett',
	'Lopt',
	'Nikx',
    ];
    for (const candidate of candidates) {
	await MakeOnePresidentVoteOption(channel, candidate);
    }
}

async function HandleOfficerVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('expand-the-franchise');
    const message = await channel.send(
	`__**Should Officers vote for President?**__\n` +
	`**Proposal:** Officers gain the right to vote but not run in presidential elections. The candidates will be the 15 Generals as usual. Vote YES to let Officers vote in the next #presidential-election. Vote NO to keep the status quo.\n\n` +
	`**Advantage:** the Presidential election has been driving the plotline in a way that Jeff never could before. The wipe day plan used to be Jeff's job but now he cannot touch it because the election has such legitimacy. With Officers voting, the election results will be even bigger and more legitimate than ever. There is a certain feeling of ownership that comes with voting, that has caused the Generals to act more boldly in the last 6 months. The goal is to expand that feeling of ownership to the Officers so that they act more boldly as well. We have big boots to fill as the map tech kicks in over coming months, so we need to elevate and train more bold leaders urgently.\n\n` +
        `**Disadvantage:** the legitimacy of the vote could be hurt if we get Officers voting then not showing up to play. Check #ranks to see that 90% of Officers & Generals are active.\n\n` +
	`A majority is needed for this motion to pass. The vote ends Dec 20, 2022.`);
    await message.react('✅');
    await message.react('❌');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
}

async function HandleAmnestyVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('amnesty-vote');
    const message = await channel.send(
	`__**Amnesty for JT**__\n\n` +
	`Should we unban JT?\n\n` +
        `Votes Yes to unban JT. Vote No to keep JT banned, or if you disagree with this vote being held in the first place.\n\n` +
	`A 2/3 majority is needed for this motion to pass. These matters will always be decided by the Generals, not by Jeff. If we choose to grant this amnesty, then we can always ban him again later.`);
    await message.react('✅');
    await message.react('❌');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
}

async function HandleTermLengthVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('president-term');
    const message = await channel.send(
	'__**Presidential Term of Service**__\n' +
	'Vote YES to turn Mr. President back into a General at the end of each wipe day. The main reason for Mr. President to exist is to pick the build spot in case the map is a surprise on wipe day. With their job done, the first rain (2 AM on wipe night) will cleanse Mr. President of their title.\n\n' +
	'Vote NO to keep Mr. President for the full month, until the beginning of the next presidential election.\n\n' +
	'The convention that the Generals choose now will be the one used going forward. It will apply to next month and the one after that, not only this month. We will not have this vote again next month.\n\n' +
	'This vote will end with the first rain of the new wipe (2 AM Eastern after wipe day). It requires a simple majority to pass (50% + 1).'
    );
    await message.react('✅');
    await message.react('❌');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
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
    const daysToLookback = parseFloat(daysToLookbackAsText);
    const recentActiveUsers = UserCache.GetUsersSortedByLastSeen(daysToLookback);
    await discordMessage.channel.send(`Sending orders to ${recentActiveUsers.length} members. Restart the bot now if this is not right.`);
    await Sleep(10 * 1000);
    for (const user of recentActiveUsers) {
	const name = user.getNicknameOrTitleWithInsignia();
	await discordMessage.channel.send(`Sending orders to ${name}`);
	const rankNameAndInsignia = user.getRankNameAndInsignia();
	let ordersMessage = `${rankNameAndInsignia},\n\n`;
	ordersMessage += `Here are your secret orders for the month of December. Report to the server Rustopia US Large.\n\n`;
	ordersMessage += '```client.connect USLarge.Rustopia.gg:28015```\n\n';
	ordersMessage += `Get the build location in Voice Chat then run directly there. Help build the Community base then build your own small base close by. We are putting up a big community wall on wipe day.\n\n`;
	ordersMessage += `The Government's new Rust+ map app is in alpha release at https://rustgovernment.com\n\n`;
	ordersMessage += `It's like the regular Rust+ app except multiple gov teams can all see each others' locations on the map. It is brand new so give it a try and check back later in the month when all the bugs are fixed :-)\n\n`;
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
    if (!mentionedMember) {
	await discordMessage.channel.send(`Couldn't find that member. They might have left the Discord guild. Have them re-join then try again.`);
	return;
    }
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
	'!bal': yen.HandleYenCommand,
	'!balance': yen.HandleYenCommand,
	'!ban': Ban.HandleBanCommand,
	'!code': HandleCodeCommand,
	'!committee': HandleCommitteeCommand,
	'!convert': yen.HandleConvertCommand,
	'!detain': Ban.HandleBanCommand,
	'!fuck': Ban.HandleBanCommand,
	'!gender': HandleGenderCommand,
	'!goodbye': Ban.HandleBanCommand,
	'!howhigh': Artillery,
	'!indict': Ban.HandleBanCommand,
	'!money': yen.HandleYenCommand,
	'!nick': HandleNickCommand,
	'!orders': HandleOrdersCommand,
	'!pardon': Ban.HandlePardonCommand,
	'!pay': yen.HandlePayCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	'!rules': rules.HandleRulesCommand,
	'!servervote': HandleServerVoteCommand,
	'!presidentvote': HandlePresidentVoteCommand,
	'!amnestyvote': HandleAmnestyVoteCommand,
	'!officervote': HandleOfficerVoteCommand,
	'!tax': yen.HandleTaxCommand,
	'!termlengthvote': HandleTermLengthVoteCommand,
	'!tip': yen.HandleTipCommand,
	'!trial': Ban.HandleBanCommand,
	'!voiceactiveusers': HandleVoiceActiveUsersCommand,
	'!welp': Ban.HandleBanCommand,
	'!yen': yen.HandleYenCommand,
	'!yencreate': yen.HandleYenCreateCommand,
	'!yendestroy': yen.HandleYenDestroyCommand,
	'!yenfaq': yen.HandleYenFaqCommand,
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
    const command = tokens[0].toLowerCase();
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
