// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const diff = require('diff');
const discordTranscripts = require('discord-html-transcripts');
const DiscordUtil = require('./discord-util');
const FilterUsername = require('./filter-username');
const huddles = require('./huddles');
const RandomPin = require('./random-pin');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
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

async function MakeOneServerVoteOption(channel, serverName, battlemetricsLink, peakRank) {
    //const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank} ★ ${playerDensity} players / sq km ★ ${bpWipe}_`;
    const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank}`;
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
    const channel = await guild.channels.create({ name: 'server-vote' });
    const message = await channel.send(
	'The Government will play on whichever server gets the most votes. This will be our main home Rust server for March 2024.\n\n' +
	'Every top 100 US monthly vanilla server is included.'
    );
    await message.react('❤️');
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long III', 'https://www.battlemetrics.com/servers/rust/433754', 21);
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long II', 'https://www.battlemetrics.com/servers/rust/2036399', 128);
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long', 'https://www.battlemetrics.com/servers/rust/1477148', 184);
    await MakeOneServerVoteOption(channel, 'Rustopia US Large', 'https://www.battlemetrics.com/servers/rust/14876729', 19);
    await MakeOneServerVoteOption(channel, 'Rustopia.gg - US Small', 'https://www.battlemetrics.com/servers/rust/14876730', 120);
    await MakeOneServerVoteOption(channel, 'PICKLE VANILLA MONTHLY', 'https://www.battlemetrics.com/servers/rust/4403307', 116);
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Monthly|', 'https://www.battlemetrics.com/servers/rust/9611162', 5);
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Small|', 'https://www.battlemetrics.com/servers/rust/2933470', 45);
    await MakeOneServerVoteOption(channel, 'Reddit.com/r/PlayRust - US Monthly', 'https://www.battlemetrics.com/servers/rust/3345988', 28);
    await MakeOneServerVoteOption(channel, 'Rustoria.co - US Long', 'https://www.battlemetrics.com/servers/rust/9594576', 3);
}

async function MakeOnePresidentVoteOption(channel, playerName) {
    const text = `**${playerName}**`;
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
    const channel = await guild.channels.create({
	name: 'presidential-election',
	type: 0,
    });
    const message = await channel.send('Whoever gets the most votes will be Mr. or Madam President in March 2024. Mr. or Madam President has the power to choose where The Government builds on wipe day. If they fail to make a clear choice 20 minutes into the wipe, then it falls to the runner-up, Mr. or Madam Vice President. The community base will be there and most players will build nearby. Nobody is forced - if you want to build elsewhere then you can. This vote ends <t:1709604000:R>.');
    await message.react('❤️');
    const generalRankUsers = await UserCache.GetMostCentralUsers(15);
    const candidateNames = [];
    for (const user of generalRankUsers) {
	if (user.commissar_id === 7) {
	    continue;
	}
	const name = user.getNicknameOrTitleWithInsignia();
	candidateNames.push(name);
    }
    for (const name of candidateNames) {
	await MakeOnePresidentVoteOption(channel, name);
    }
}

async function HandlePresidentVoteFixCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.resolve('1100498416162844772');
    const candidates = [
	'EviL',
    ];
    for (const candidate of candidates) {
	await MakeOnePresidentVoteOption(channel, candidate);
    }
}

async function HandleHypeCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create({ name: 'hype' });
    let message;
    message = await channel.send(
	`__**Wipe Hype!**__\n` +
	`Mr. President needs a show of hands for Wipe Day, for planning purposes. It's not a commitment. Try your best to guess and if you can't make it day-of that is OK.\n\n` +
	`Click ⌛ if you think you'll be on the minute of the wipe`);
    await message.react('⌛');
    message = await channel.send(
	`Click 🔆 if you think you will be there wipe day, but not the minute of the wipe`);
    await message.react('🔆');
    message = await channel.send(
	`Click 📅 if you might get on wipe week, but not wipe day`);
    await message.react('📅');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
}

async function HandlePrivateRoomVoteCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.create('private-comms-for-generals');
    const message = await channel.send(
	`__**Should Generals Have Private Comms?**__\n` +
	`Recently we have tried an experiment where all 15 Generals have their own private comms. Access is controlled by the Badge system.\n\n` +
	`Vote YES to continue the experiment.\n\n` +
        `Vote NO to delete all private comms except the Raid channel.\n\n` +
	`The Generals decide. A simple majority is needed for this motion to pass. The vote ends March 2, 2023.`);
    await message.react('✅');
    await message.react('❌');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
}

function GenerateAkaStringForUser(cu) {
    const peakRank = cu.peak_rank || 13;
    const peakRankInsignia = RankMetadata[peakRank].insignia;
    const names = [
	cu.steam_name,
	cu.nick,
	cu.nickname,
	cu.steam_id,
	cu.discord_id,
	peakRankInsignia,
    ];
    const filteredNames = [];
    for (const name of names) {
	if (name && name.length > 0) {
	    filteredNames.push(name);
	}
    }
    const joined = filteredNames.join(' / ');
    return joined;
}

async function HandleAmnestyCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    await discordMessage.channel.send(`The Generals have voted to unban the following individuals from The Government:`);
    let unbanCountForGov = 0;
    await UserCache.ForEach(async (cu) => {
	if (!cu.good_standing && !cu.ban_vote_start_time && !cu.ban_pardon_time) {
	    await cu.setGoodStanding(true);
	    await cu.setBanVoteStartTime(null);
	    await cu.setBanVoteChatroom(null);
	    await cu.setBanVoteMessage(null);
	    await cu.setBanConvictionTime(null);
	    await cu.setBanPardonTime(null);
	    const aka = GenerateAkaStringForUser(cu);
	    await discordMessage.channel.send(`Unbanned ${aka}`);
	    await Sleep(1000);
	    unbanCountForGov++;
	}
    });
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const bans = await guild.bans.fetch();
    let unbanCountForDiscord = 0;
    for (const [banId, ban] of bans) {
	const discordId = ban.user.id;
	if (!discordId) {
	    continue;
	}
	const cu = await UserCache.GetCachedUserByDiscordId(discordId);
	if (!cu) {
	    continue;
	}
	if (!cu.ban_pardon_time) {
	    await guild.bans.remove(discordId);
	    const aka = GenerateAkaStringForUser(cu);
	    await discordMessage.channel.send(`Unbanned ${aka}`);
	    await Sleep(1000);
	    unbanCountForDiscord++;
	}
    }
    await discordMessage.channel.send(`${unbanCountForGov} gov users unbanned`);
    await discordMessage.channel.send(`${unbanCountForDiscord} discord users unbanned`);
    const total = unbanCountForGov + unbanCountForDiscord;
    await discordMessage.channel.send(`These ${total} bans have been pardoned by order of the Generals`);
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

async function SendWipeBadgeOrders(user, discordMessage, discordMember) {
    const name = user.getNicknameOrTitleWithInsignia();
    await discordMessage.channel.send(`Sending orders to ${name}`);
    const rankNameAndInsignia = user.getRankNameAndInsignia();
    let content = `${rankNameAndInsignia},\n\n`;
    content += `Here are your secret orders for the month of March 2024. Report to Rustopia.gg - US Large\n`;
    content += '```client.connect USLarge.Rustopia.gg```\n';  // Only one newline after triple backticks.
    if (user.rank <= 5) {
	content += `Generals Code 1111\n`;
    }
    if (user.rank <= 9) {
	content += `Officers Code 1111\n`;
    }
    if (user.rank <= 13) {
	content += `Grunt Code 1111\n`;
	content += `Gate Code 1111\n\n`;
    }
    content += `Run straight to A1. Don't say the location in voice chat, please. Help build the community base and get a common Tier 3, then build your own small base.\n\n`;
    content += `Pair with https://rustcult.com/ to get your base protected. The gov is too big to track everyone's base by word of mouth. We use a map app to avoid raiding ourselves by accident. It's easy. You don't have to input your base location. Once you are paired it somehow just knows. A force field goes up around all your bases even if you never have the app open.\n\n`;
    content += `Want yen? Become a Government Contractor. Mr. President is paying 100 yen per box of stone at community base all day on wipe day. Offer is good for at least 10 boxes of stone so there is time for you to cash in. 10 yen per row of stone for smaller deliveries.\n\n`;
    content += `Yours truly,\n`;
    content += `The Government  <3`;
    console.log('Content length', content.length, 'characters.');
    try {
	await discordMember.send({
	    content,
	    files: [{
		attachment: 'nov-2023-village-heatmap.png',
		name: 'nov-2023-village-heatmap.png'
	    }]
	});
    } catch (error) {
	console.log('Failed to send orders to', name);
    }
}

async function SendNonWipeBadgeOrders(user, discordMessage, discordMember) {
    const name = user.getNicknameOrTitleWithInsignia();
    await discordMessage.channel.send(`Sending orders to ${name}`);
    const rankNameAndInsignia = user.getRankNameAndInsignia();
    let content = `${rankNameAndInsignia},\n\n`;
    content += `Here are your secret orders for the month of March 2024. Report to Rustopia.gg - US Large\n`;
    content += '```client.connect USLarge.Rustopia.gg```\n';  // Only one newline after triple backticks.
    content += `Get the gov build location from one of your trusted friends with a high rank in The Government. Help build the community base and get a common Tier 3, then build your own small base.\n\n`;
    content += `Pair with https://rustcult.com/ to get your base protected. The gov is too big to track everyone's base by word of mouth. We use a map app to avoid raiding ourselves by accident. It's easy. You don't have to input your base location. Once you are paired it somehow just knows. A force field goes up around all your bases even if you never have the app open.\n\n`;
    content += `Want yen? Become a Government Contractor. Mr. President is paying 100 yen per box of stone at community base all day on wipe day. Offer is good for at least 10 boxes of stone so there is time for you to cash in. 10 yen per row of stone for smaller deliveries.\n\n`;
    content += `Yours truly,\n`;
    content += `The Government  <3`;
    console.log('Content length', content.length, 'characters.');
    try {
	await discordMember.send({
	    content,
	    files: [{
		attachment: 'nov-2023-village-heatmap.png',
		name: 'nov-2023-village-heatmap.png'
	    }]
	});
    } catch (error) {
	console.log('Failed to send orders to', name);
    }
}

async function SendOrdersToOneCommissarUser(user, discordMessage) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const discordMember = await guild.members.fetch(user.discord_id);
    const hasWipeBadge = await DiscordUtil.GuildMemberHasRole(discordMember, RoleID.WipeBadge);
    if (hasWipeBadge) {
	await SendWipeBadgeOrders(user, discordMessage, discordMember);
    } else {
	await SendNonWipeBadgeOrders(user, discordMessage, discordMember);
    }
}

async function SendOrdersToTheseCommissarUsers(users, discordMessage) {
    await discordMessage.channel.send(`Sending orders to ${users.length} members. Restart the bot now if this is not right.`);
    await Sleep(10 * 1000);
    for (const user of users) {
	await SendOrdersToOneCommissarUser(user, discordMessage);
	await Sleep(5 * 1000);
    }
}

async function HandleOrdersTestCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const jeff = await UserCache.GetCachedUserByDiscordId('268593188137074688');
    const users = [jeff];
    await SendOrdersToTheseCommissarUsers(users, discordMessage);
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
    const daysToLookback = parseFloat(daysToLookbackAsText);
    const recentActiveUsers = UserCache.GetUsersSortedByLastSeen(daysToLookback);
    await SendOrdersToTheseCommissarUsers(recentActiveUsers, discordMessage);
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
    await discordMessage.channel.send(`To set your nickname, link your Steam account https://rustcult.com\n\nYour discord name is your Steam name. It can take up to 12 hours to update.`);
}

// Do as if the user just joined the discord. For manually resolving people who
// occasionally fall through the cracks of the automated onboarding process.
async function HandleBoopCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length < 2) {
	await discordMessage.channel.send(`ERROR: wrong number of arguments. USAGE: !nick NewNicknam3`);
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(`ERROR: must mention a member to boop. Example: !boop @Jeff`);
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (cu) {
	await discordMessage.channel.send(`Member already exists.`);
    } else {
	// We have no record of this Discord user. Create a new record in the cache.
	console.log('New Discord user detected.');
	await UserCache.CreateNewDatabaseUser(mentionedMember);
	await discordMessage.channel.send(`Successfully booped.`);
    }
}

// Removes any office that the mentioned user has.
async function HandleImpeachCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(`ERROR: who to impeach? Example: !impeach @Jeff`);
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (!cu) {
	await discordMessage.channel.send(`No user record for that discord member.`);
    }
    await cu.setOffice(null);
    const name = cu.getNicknameOrTitleWithInsignia();
    await discordMessage.channel.send(`Impeached ${name}`);
}

// Appoints the mentioned member as Mr. President
async function HandlePrezCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(`ERROR: who to appoint? Example: !prez @Jeff`);
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (!cu) {
	await discordMessage.channel.send(`No user record for that discord member.`);
    }
    const name = cu.getNicknameOrTitleWithInsignia();
    await cu.setOffice('PREZ');
    await discordMessage.channel.send(`${name} is now President`);
}

// Appoints the mentioned member as Mr. Vice President
async function HandleVeepCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(`ERROR: who to appoint? Example: !veep @Jeff`);
	return;
    }
    const cu = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (!cu) {
	await discordMessage.channel.send(`No user record for that discord member.`);
    }
    const name = cu.getNicknameOrTitleWithInsignia();
    await cu.setOffice('VEEP');
    await discordMessage.channel.send(`${name} is now Vice President`);
}

async function HandleTranscriptCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const fromChannel = discordMessage.channel;
    const attachment = await discordTranscripts.createTranscript(fromChannel);
    const toChannel = discordMessage.guild.channels.resolve('1110429964580433920');
    await toChannel.send({
	files: [attachment],
    });
}

const sentToAFkTimes = {};

async function HandleAfkCommand(discordMessage) {
	const authorId = discordMessage.author.id;
    const author = await UserCache.GetCachedUserByDiscordId(authorId);
	if (!author || author.rank > 5) {
		await discordMessage.channel.send(
			`Error: Only generals can do that.`
		)
		return
	}
	const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
	if (!mentionedMember) {
		await discordMessage.channel.send(
		'Error: `!afk` only one person can be sent to afk at a time.\n' +
		'Example: `!afk @nickname`\n'
		);
		return;
	}
	
	const memberSentTime = sentToAFkTimes[mentionedMember.id] || 0;
	const diff = Math.abs(new Date().getTime() - memberSentTime);
	const minutesSinceSentToAfk = Math.floor((diff/1000)/60);
	
	if (minutesSinceSentToAfk < 30) {
		await discordMessage.channel.send(
			`${mentionedMember.nickname} cannot be sent to idle lounge more than once every 30 minutes.`
		);
		return;
	}

	try {
		await DiscordUtil.moveMemberToAfk(mentionedMember);
	} catch(e) {
		// Note: Error code for member not in voice channel.
		if (e.code === 40032) {
			await discordMessage.channel.send(
				`${mentionedMember.nickname} is not in a voice channel, cannot be sent to idle lounge.`
			);
			return;
		}
		throw new Error(e);
	} finally {
		sentToAFkTimes[mentionedMember.id] = new Date().getTime();
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
	'!afk': HandleAfkCommand,
	'!amnesty': HandleAmnestyCommand,
	'!apprehend': Ban.HandleBanCommand,
	'!arrest': Ban.HandleBanCommand,
	'!art': Artillery,
	'!artillery': Artillery,
	'!badge': HandleBadgeCommand,
	'!bal': yen.HandleYenCommand,
	'!balance': yen.HandleYenCommand,
	'!ban': Ban.HandleBanCommand,
	'!boop': HandleBoopCommand,
	'!code': HandleCodeCommand,
	'!committee': HandleCommitteeCommand,
	'!convert': yen.HandleConvertCommand,
	'!convict': Ban.HandleConvictCommand,
	'!detain': Ban.HandleBanCommand,
	'!fuck': Ban.HandleBanCommand,
	'!gender': HandleGenderCommand,
	'!goodbye': Ban.HandleBanCommand,
	'!howhigh': Artillery,
	'!hype': HandleHypeCommand,
	'!impeach': HandleImpeachCommand,
	'!prez': HandlePrezCommand,
	'!veep': HandleVeepCommand,
	'!indict': Ban.HandleBanCommand,
	'!lottery': yen.DoLottery,
	'!money': yen.HandleYenCommand,
	'!nick': HandleNickCommand,
	'!orders': HandleOrdersCommand,
	'!orderstest': HandleOrdersTestCommand,
	'!pardon': Ban.HandlePardonCommand,
	'!pay': yen.HandlePayCommand,
	'!ping': HandlePingCommand,
	'!pingpublic': HandlePingPublicChatCommand,
	'!servervote': HandleServerVoteCommand,
	'!presidentvote': HandlePresidentVoteCommand,
	'!presidentvotefix': HandlePresidentVoteFixCommand,
	'!privateroomvote': HandlePrivateRoomVoteCommand,
	'!tax': yen.HandleTaxCommand,
	'!termlengthvote': HandleTermLengthVoteCommand,
	'!tip': yen.HandleTipCommand,
	'!trial': Ban.HandleBanCommand,
	'!transcript': HandleTranscriptCommand,
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
