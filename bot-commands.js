// Routines for handling bot commands like !ping and !ban.
const Artillery = require('./artillery');
const Ban = require('./ban');
const diff = require('diff');
const discordTranscripts = require('discord-html-transcripts');
const DiscordUtil = require('./discord-util');
const exile = require('./exile-cache');
const FilterUsername = require('./filter-username');
const fs = require('fs');
const huddles = require('./huddles');
const RandomPin = require('./random-pin');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
const Sleep = require('./sleep');
const UserCache = require('./user-cache');
const yen = require('./yen');
const zerg = require('./zerg');

// The given Discord message is already verified to start with the !ping prefix.
// This is an example bot command that has been left in for fun. Maybe it's
// also useful for teaching people how to use bot commands. It's a harmless
// practice command that does nothing.
async function HandlePingCommand(discordMessage) {
    await discordMessage.channel.send('Pong!');
}

// Handles any command that ends with ing. It is a joke command for fun.
async function HandleIngCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 1) {
	return;
    }
    const command = tokens[0].toLowerCase();
    if (command.length > 9) {
	// Don't work for long commands to avoid the worst abuses.
	return;
    }
    if (command.endsWith('ing')) {
	const prefix = command.substring(1, command.length - 3);
	const ong = prefix + 'ong!';
	await discordMessage.channel.send(ong);
    }
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
    const text = `__**${serverName}**__\n${battlemetricsLink}\n_Peak rank #${peakRank}_`;
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
    const message = await channel.send('The Government will play on whichever server gets the most votes. This will be our home Rust server for November 2024.');
    await message.react('❤️');
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Monthly|', 'https://www.battlemetrics.com/servers/rust/9611162', 5);
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long III', 'https://www.battlemetrics.com/servers/rust/433754', 11);
    await MakeOneServerVoteOption(channel, 'Rustopia US Large', 'https://www.battlemetrics.com/servers/rust/14876729', 15);
    await MakeOneServerVoteOption(channel, 'Reddit.com/r/PlayRust - US Monthly', 'https://www.battlemetrics.com/servers/rust/3345988', 26);
    await MakeOneServerVoteOption(channel, 'Rusty Moose |US Small|', 'https://www.battlemetrics.com/servers/rust/2933470', 34);
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long', 'https://www.battlemetrics.com/servers/rust/1477148', 88);
    await MakeOneServerVoteOption(channel, 'PICKLE VANILLA MONTHLY', 'https://www.battlemetrics.com/servers/rust/4403307', 91);
    await MakeOneServerVoteOption(channel, 'Rustafied.com - US Long II', 'https://www.battlemetrics.com/servers/rust/2036399', 144);
    await MakeOneServerVoteOption(channel, 'Rustopia.gg - US Small', 'https://www.battlemetrics.com/servers/rust/14876730', 108);
    await MakeOneServerVoteOption(channel, 'Rustoria.co - US Long', 'https://www.battlemetrics.com/servers/rust/9594576', 2);
    await MakeOneServerVoteOption(channel, 'US Rustinity 2x Monthly Large Vanilla+', 'https://www.battlemetrics.com/servers/rust/10477772', 16);
    await MakeOneServerVoteOption(channel, 'PICKLE QUAD MONTHLY US', 'https://www.battlemetrics.com/servers/rust/3477804', 203);
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
	name: 'presidential-erection',
	type: 0,
    });
    const message = await channel.send('Whoever gets the most votes will be Mr. or Madam President in October 2024.');
    await message.react('❤️');
    const generalRankUsers = await UserCache.GetTopRankedUsers(20);
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
    const channel = await guild.channels.create({ name: 'vote-on-gov-future' });
    const message = await channel.send(
	`__**Vote on the Future of the Government Community**__\n` +
	`Should we keep the microcommunities, the 3 digit barcodes, and the New Guy Demotion that slows down new recruits from ranking up too quickly?\n\n` +
	`The hierarchical ranks are obsolete, but they were not in vain. We needed to explore that direction to discover the concept of microcommunities that we are voting on now.\n\n` +
	`The ranks we have now are almost identical to the original ones that reigned from March 2021 to March 2024. This vote is not primarily about the ranks after all. This vote is about whether to keep the microcommunities, the 3 digit barcodes, and the New Guy Demotion that slows down new recruits from ranking up too quickly.\n\n` +
	`Vote YES to keep things how they are now\n\n` +
        `Vote NO to go back to how everything was in March\n\n` +
	`The vote ends May 30, 2024. All Generals past & present can vote.`);
    await message.react('✅');
    await message.react('❌');
    const voteSectionId = '1043778293612163133';
    await channel.setParent(voteSectionId);
}

function GenerateAkaStringForUser(cu) {
    const peakRank = cu.peak_rank || 24;
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
    content += `Last month we did big raids almost every night. In October we will do the same and a lot of people are pumped. It is going to be a massive month.\n\n`;
    if (user.rank <= 21) {
	content += `The build spot is AA6. Run straight there and slap down your own base.\n\n`;
    }
    content += '```client.connect USLarge.Rustopia.gg```\n';  // Only one newline after triple backticks.
    if (user.rank <= 15) {
	content += `Generals Code 0155\n`;
    }
    if (user.rank <= 19) {
	content += `Wipe Code 6463\n`;
    }
    if (user.rank <= 19) {
	content += `All officers are invited to the opt-in zerg base. Anyone who joins the zerg base can't have any other base. You don't have to opt-in and can build your own base if you want.\n`;
    }
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
    content += `Here are your secret orders for the month of April 2024. Report to Rustafied.com - US Long III\n`;
    content += '```client.connect uslong3.rustafied.com```\n';  // Only one newline after triple backticks.
    content += `Grunt Code 1111\n`;
    content += `Gate Code 1111\n\n`;
    content += `Run straight to V7. Don't say the location in voice chat, please. Help build the community base and get a common Tier 3, then build your own small base.\n\n`;
    content += `Pair with https://rustcult.com/ to get your base protected. The gov is too big to track everyone's base by word of mouth. We use a map app to avoid raiding ourselves by accident. It's easy. You don't have to input your base location. Once you are paired it somehow just knows. A force field goes up around your bases even if you never have the app open.\n\n`;
    content += `Check out the new https://discord.com/channels/305840605328703500/711850971072036946. We are addressing the most longstanding problem in gov: having to put up with people you don't like to hang out with the ones you do like. Pair with rustcult.com for the best possible experience.\n\n`;
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
    if (discordMember.user.bot) {
	return;
    }
    //const hasWipeBadge = await DiscordUtil.GuildMemberHasRole(discordMember, RoleID.WipeBadge);
    //if (hasWipeBadge) {
	await SendWipeBadgeOrders(user, discordMessage, discordMember);
    //} else {
	//await SendNonWipeBadgeOrders(user, discordMessage, discordMember);
    //}
}

async function SendOrdersToTheseCommissarUsers(users, discordMessage) {
    await discordMessage.channel.send(`Sending orders to ${users.length} members. Restart the bot now if this is not right.`);
    await Sleep(1 * 1000);
    for (const user of users) {
	if (!user) {
	    continue;
	}
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
	await cu.setCitizen(true);
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
	if (!author || author.rank > 15) {
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

function ChooseRandomTrumpCard() {
    const n = 32;
    const r = Math.floor(n * Math.random());
    return `trump-cards/${r}.png`;
}

let trumpNftPrice = null;
const buyQueue = [];
const sellQueue = [];

function LoadPrice() {
    if (trumpNftPrice === null) {
	const trumpPriceAsString = fs.readFileSync('trump-price.csv');
	trumpNftPrice = parseInt(trumpPriceAsString);
    }
}

function SavePrice() {
    LoadPrice();
    fs.writeFileSync('trump-price.csv', trumpNftPrice.toString());
}

function IncreasePrice() {
    LoadPrice();
    if (trumpNftPrice < 99) {
	trumpNftPrice++;
    }
    SavePrice();
}

function DecreasePrice() {
    LoadPrice();
    if (trumpNftPrice > 1) {
	trumpNftPrice--;
    }
    SavePrice();
}

async function HandleBuyCommand(discordMessage) {
    buyQueue.push(discordMessage);
}

async function FulfillBuyOrder(discordMessage) {
    LoadPrice();
    if (trumpNftPrice > 99) {
	await discordMessage.channel.send('Cannot buy when the price is maxed out to 100. Wait for someone to sell then try again.');
	return;
    }
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author) {
	return;
    }
    const oldYen = author.yen || 0;
    const oldCards = author.trump_cards || 0;
    console.log('oldCards', oldCards);
    const tradePrice = trumpNftPrice;
    const name = author.getNicknameOrTitleWithInsignia();
    let actionMessage = `${name} purchased this one-of-a-kind Donald Trump NFT for ${tradePrice} yen`;
    let newYen = oldYen - tradePrice;
    if (oldCards < 0) {
	newYen += 100;
	actionMessage += ' and got back their 100 yen deposit';
    }
    const newCards = oldCards + 1;
    if (newYen >= 0) {
	IncreasePrice();
	await author.setYen(newYen);
	await author.setTrumpCards(newCards);
    } else {
	await discordMessage.channel.send('Not enough yen. Use !yen to check how much money you have.');
	return;
    }
    const prefixes = [
	'The probability that Donald Trump will win the 2024 US presidential election is',
	'The odds that Trump will win are',
	'The probability of a Trump win is',
    ];
    const r = Math.floor(prefixes.length * Math.random());
    const randomPrefix = prefixes[r];
    const probabilityAnnouncement = `${randomPrefix} ${trumpNftPrice}%`;
    let positionStatement;
    const plural = Math.abs(newCards) !== 1 ? 's' : '';
    if (newCards > 0) {
	const positivePayout = newCards * 100;
	positionStatement = `They have ${newCards} NFT${plural} that will pay out ${positivePayout} yen if Trump wins`;
    } else if (newCards < 0) {
	const negativePayout = -newCards * 100;
	positionStatement = `They are short ${-newCards} more NFT${plural} that will pay out ${negativePayout} yen if Trump does not win`;
    } else {
	positionStatement = 'They have no NFTs left';
    }
    let content = '```' + `${actionMessage}. ${positionStatement}. ${probabilityAnnouncement}` + '```';
    const trumpCard = ChooseRandomTrumpCard();
    try {
	await discordMessage.channel.send({
	    content,
	    files: [{
		attachment: trumpCard,
		name: trumpCard,
	    }]
	});
    } catch (error) {
	console.log(error);
    }
    await UpdateTrumpChannel(trumpCard, probabilityAnnouncement);
    await yen.UpdateYenChannel();
}

async function HandleSellCommand(discordMessage) {
    sellQueue.push(discordMessage);
}

async function FulfillSellOrder(discordMessage) {
    LoadPrice();
    if (trumpNftPrice < 2) {
	await discordMessage.channel.send('Cannot sell when the price is bottomed out to 1. Wait for someone to buy then try again.');
	return;
    }
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author) {
	return;
    }
    const oldYen = author.yen || 0;
    const oldCards = author.trump_cards || 0;
    const tradePrice = trumpNftPrice - 1;
    const name = author.getNicknameOrTitleWithInsignia();
    let actionMessage = `${name} sold this Donald Trump NFT for ${tradePrice} yen`;
    let newYen = oldYen + tradePrice;
    const newCards = oldCards - 1;
    if (newCards < 0) {
	newYen -= 100;
	actionMessage = `${name} deposited 100 yen to mint a new Donald Trump NFT then sold it for ${tradePrice} yen`;
    }
    if (newYen >= 0) {
	DecreasePrice();
	await author.setYen(newYen);
	await author.setTrumpCards(newCards);
    } else {
	await discordMessage.channel.send('Not enough yen to short-sell. Use !yen to check how much money you have.');
	return;
    }
    const prefixes = [
	'The probability that Donald Trump will win the 2024 US presidential election is',
	'The odds that Trump will win are',
	'The probability of a Trump win is',
    ];
    const r = Math.floor(prefixes.length * Math.random());
    const randomPrefix = prefixes[r];
    const probabilityAnnouncement = `${randomPrefix} ${trumpNftPrice}%`;
    let positionStatement;
    const plural = Math.abs(newCards) !== 1 ? 's' : '';
    if (newCards > 0) {
	const positivePayout = newCards * 100;
	positionStatement = `They have ${newCards} NFT${plural} left that will pay out ${positivePayout} yen if Trump wins`;
    } else if (newCards < 0) {
	const negativePayout = -newCards * 100;
	positionStatement = `They are short ${-newCards} NFT${plural} that will pay out ${negativePayout} yen if Trump does not win`;
    } else {
	positionStatement = 'They have no NFTs left';
    }
    let content = '```' + `${actionMessage}. ${positionStatement}. ${probabilityAnnouncement}` + '```';
    const trumpCard = ChooseRandomTrumpCard();
    try {
	await discordMessage.channel.send({
	    content,
	    files: [{
		attachment: trumpCard,
		name: trumpCard,
	    }]
	});
    } catch (error) {
	console.log(error);
    }
    await UpdateTrumpChannel(trumpCard, probabilityAnnouncement);
    await yen.UpdateYenChannel();
}

async function UpdateTrumpChannel(trumpCard, probabilityAnnouncement) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch('1267202328243732480');
    let message = '```' + probabilityAnnouncement + '\n\n';
    if (trumpNftPrice < 100) {
	message += `!buy a Donald Trump NFT for ${trumpNftPrice} yen\n`;
    }
    if (trumpNftPrice > 1) {
	const sellPrice = trumpNftPrice - 1;
	message += `!sell a Donald Trump NFT for ${sellPrice} yen\n`;
    }
    message += '\n';
    message += 'Every Donald Trump NFT pays out 100 yen if Donald Trump is declared the winner of the 2024 US presidential election by the Associated Press. Short-selling is allowed. If you believe that Trump will win then !buy. If you believe that he will not win then !sell.\n\n';
    message += '!buy low !sell high. It\'s just business. Personal politics aside, if the price does not reflect the true probability, then consider a !buy or !sell. See a news event that is not priced in yet? Quickly !buy or !sell to profit from being the first to bring new information to market.\n\n';
    message += 'Do you believe that one or both sides suffer from bias? Here is your chance to fine a random idiot from the internet for disagreeing with you. Make them pay!';
    message += '```';
    await channel.bulkDelete(99);
    await channel.send({
	content: message,
	files: [{
	    attachment: trumpCard,
	    name: trumpCard,
	}]
    });
    const users = UserCache.GetAllUsersAsFlatList();
    const long = [];
    const short = [];
    for (const user of users) {
	if (!user.trump_cards) {
	    continue;
	}
	if (user.trump_cards > 0) {
	    long.push(user);
	}
	if (user.trump_cards < 0) {
	    short.push(user);
	}
    }
    long.sort((a, b) => (b.trump_cards - a.trump_cards));
    const longLines = [
	'If Trump wins',
	'-------------',
    ];
    for (const user of long) {
	const name = user.getNicknameOrTitleWithInsignia();
	const payout = user.trump_cards * 100;
	longLines.push(`${name} collects ${payout} yen`);
    }
    await DiscordUtil.SendLongList(longLines, channel);
    short.sort((a, b) => (a.trump_cards - b.trump_cards));
    const shortLines = [
	'If Trump does not win',
	'---------------------',
    ];
    for (const user of short) {
	const name = user.getNicknameOrTitleWithInsignia();
	const payout = -user.trump_cards * 100;
	shortLines.push(`${name} collects ${payout} yen`);
    }
    await DiscordUtil.SendLongList(shortLines, channel);
}

async function ProcessOneBuyAndOneSellOrder() {
    if (buyQueue.length === 0 && sellQueue.length === 0) {
	setTimeout(ProcessOneBuyAndOneSellOrder, 1000);
	return;
    }
    if (buyQueue.length > 0) {
	const buyOrder = buyQueue.shift();
	await FulfillBuyOrder(buyOrder);
	await Sleep(100);
    }
    if (sellQueue.length > 0) {
	const sellOrder = sellQueue.shift();
	await FulfillSellOrder(sellOrder);
    }
    setTimeout(ProcessOneBuyAndOneSellOrder, 1);
}
setTimeout(ProcessOneBuyAndOneSellOrder, 1000);

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
	'!artillery': Artillery,
	'!badge': HandleBadgeCommand,
	'!bal': yen.HandleYenCommand,
	'!balance': yen.HandleYenCommand,
	'!ban': Ban.HandleBanCommand,
	'!boop': HandleBoopCommand,
	'!buy': HandleBuyCommand,
	'!code': HandleCodeCommand,
	'!committee': HandleCommitteeCommand,
	'!convict': Ban.HandleConvictCommand,
	'!gender': HandleGenderCommand,
	'!hype': HandleHypeCommand,
	'!impeach': HandleImpeachCommand,
	'!initzerg': zerg.InitZergCommand,
	'!prez': HandlePrezCommand,
	'!veep': HandleVeepCommand,
	'!lottery': yen.DoLottery,
	'!money': yen.HandleYenCommand,
	'!nick': HandleNickCommand,
	'!orders': HandleOrdersCommand,
	'!orderstest': HandleOrdersTestCommand,
	'!pardon': Ban.HandlePardonCommand,
	'!pay': yen.HandlePayCommand,
	'!ping': HandlePingCommand,
	'!servervote': HandleServerVoteCommand,
	'!presidentvote': HandlePresidentVoteCommand,
	'!privateroomvote': HandlePrivateRoomVoteCommand,
	'!sell': HandleSellCommand,
	'!tax': yen.HandleTaxCommand,
	'!tip': yen.HandleTipCommand,
	'!transcript': HandleTranscriptCommand,
	'!voiceactiveusers': HandleVoiceActiveUsersCommand,
	'!yen': yen.HandleYenCommand,
	'!yencreate': yen.HandleYenCreateCommand,
	'!yendestroy': yen.HandleYenDestroyCommand,
	'!yenfaq': yen.HandleYenFaqCommand,
    };
    if (discordMessage.author.bot) {
	return;
    }
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
    console.log('Dispatching command:', command);
    if (command in handlers) {
	const handler = handlers[command];
	await handler(discordMessage);
    } else {
	if (command.endsWith('ing') && tokens.length === 1) {
	    await HandleIngCommand(discordMessage);
	}
	await HandleUnknownCommand(discordMessage);
    }
}

module.exports = {
    Dispatch,
};
