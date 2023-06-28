const BadWords = require('./bad-words');
const discordTranscripts = require('discord-html-transcripts');
const DiscordUtil = require('./discord-util');
const moment = require('moment');
const UserCache = require('./user-cache');
const VoteDuration = require('./vote-duration');

const threeTicks = '```';

const banCommandRank = 5;  // General 1
const banVoteRank = 9;  // Lieutenant

async function UpdateTrial(cu) {
    if (!cu.ban_vote_start_time) {
	// No trial to update.
	await cu.setBanVoteChatroom(null);
	await cu.setBanVoteMessage(null);
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    let member;
    try {
	member = await guild.members.fetch(cu.discord_id);
    } catch (error) {
	member = null;
    }
    const banCourtCategory = await DiscordUtil.GetBanCourtCategoryChannel();
    let roomName = cu.nick || cu.nickname || 'John Doe';
    if (BadWords.ContainsBadWords(roomName)) {
	roomName = `case-${cu.commissarId}`;
    }
    // Update or create the courtroom: a text chat room under the Ban Court category.
    let channel;
    if (cu.ban_vote_chatroom) {
	channel = await guild.channels.resolve(cu.ban_vote_chatroom);
    } else {
	console.log('Creating new ban court', roomName);
	channel = await guild.channels.create({
	    name: roomName,
	    type: 0,
	});
	await channel.setParent(banCourtCategory);
    }
    if (!channel) {
	console.log('Failed to find or create ban court channel', roomName);
	return;
    }
    await channel.setRateLimitPerUser(600);
    await cu.setBanVoteChatroom(channel.id);
    // Update or create the ban vote message itself. The votes are reactions to this message.
    let message;
    if (cu.ban_vote_message) {
	message = await channel.messages.fetch(cu.ban_vote_message);
    } else {
	message = await channel.send('Welcome to the Ban Court');
	await message.react('✅');
	await message.react('❌');
	await message.pin();
    }
    await cu.setBanVoteMessage(message.id);
    const noVotes = [];
    const yesVotes = [];
    // Count up all the votes. Remove any unauthorized votes.
    for (const [reactionId, reaction] of message.reactions.cache) {
	let reactions;
	try {
	    reactions = await reaction.users.fetch();
	} catch (error) {
	    console.log('Warning: problem fetching ban votes!');
	    reactions = [];
	}
	for (const [jurorId, juror] of reactions) {
	    if (juror.bot) {
		continue;
	    }
	    const jurorUser = await UserCache.GetCachedUserByDiscordId(juror.id);
	    console.log('juror', juror.id, 'jurorUser', jurorUser.rank, jurorUser.citizen, 'roomName', roomName);
	    if (!jurorUser || !jurorUser.citizen || jurorUser.rank > banVoteRank) {
		// Remove unauthorized vote. This check will catch unauthorized votes that
		// made it through the initial filter because the bot was not running.
		// Also when a juror loses their rank their vote is removed here.
		console.log('Removing vote from unqualified juror', jurorUser.commissar_id);
		await reaction.users.remove(juror);
		continue;
	    }
	    // Tally one reaction-vote.
	    const emoji = reaction.emoji.name;
	    if (emoji === '✅') {
		yesVotes.push({
		    score: jurorUser.harmonic_centrality,
		    name: jurorUser.getNicknameOrTitleWithInsignia(),
		});
	    } else if (emoji === '❌') {
		noVotes.push({
		    score: jurorUser.harmonic_centrality,
		    name: jurorUser.getNicknameOrTitleWithInsignia(),
		});
	    }
	}
    }
    noVotes.sort((a, b) => b.score - a.score);
    yesVotes.sort((a, b) => b.score - a.score);
    const none = '\nNone';
    let noVoteNames = '';
    for (const vote of noVotes) {
	noVoteNames += '\n' + vote.name;
    }
    if (noVoteNames === '') {
	noVoteNames = none;
    }
    let yesVoteNames = '';
    for (const vote of yesVotes) {
	yesVoteNames += '\n' + vote.name;
    }
    if (yesVoteNames === '') {
	yesVoteNames = none;
    }
    const yesVoteCount = yesVotes.length;
    const noVoteCount = noVotes.length;
    const voteCount = yesVoteCount + noVoteCount;
    const yesPercentage = voteCount > 0 ? yesVoteCount / voteCount : 0;
    if (member) {
	const before = await channel.permissionOverwrites.resolve(member.id);
	if (cu.peak_rank >= 10 && voteCount >= 5 && yesPercentage >= 0.909) {
	    await channel.permissionOverwrites.create(member, {
		Connect: true,
		SendMessages: false,
		ViewChannel: true,
	    });
	    if (!before || before.allow.has('SendMessages')) {
		await channel.send(threeTicks + 'The defendant has been removed from the courtroom.' + threeTicks);
	    }
	} else {
	    await channel.permissionOverwrites.create(member, {
		Connect: true,
		SendMessages: true,
		ViewChannel: true,
	    });
	    if (before && before.deny && before.deny.has('SendMessages')) {
		console.log(before.allow);
		await channel.send(threeTicks + 'The defendant has re-entered the courtroom.' + threeTicks);
	    }
	}
	console.log('DeleteMessagesByMember consideration',
		    member.nickname,
		    cu.peak_rank,
		    voteCount,
		    yesPercentage,
		    member.lastMessage);
	if (cu.peak_rank >= 10 && voteCount >= 10 && yesPercentage >= 0.9 && member.lastMessage) {
	    await channel.send(threeTicks + 'Deleting messages sent by the Defendant within the last 24h.' + threeTicks);
	    await DiscordUtil.DeleteMessagesByMember(member, 24 * 3600);
	}
    }
    const guilty = VoteDuration.SimpleMajority(yesVoteCount, noVoteCount);
    const outcomeString = guilty ? 'banned' : 'NOT GUILTY';
    const caseTitle = `THE GOVERNMENT v ${cu.getNicknameWithInsignia()}`;
    const underline = new Array(caseTitle.length + 1).join('-');
    const currentTime = moment();
    let startTime = moment(cu.ban_vote_start_time);
    const totalVoters = 50;
    let baselineVoteDurationDays;
    let nextStateChangeMessage;
    if (guilty) {
	baselineVoteDurationDays = 5;
	const n = VoteDuration.HowManyMoreNoVotes(yesVoteCount, noVoteCount, VoteDuration.SimpleMajority);
	nextStateChangeMessage = `${n} more NO votes to unban`;
	if (cu.good_standing) {
	    // Vote outcome flipped. Reset the clock.
	    startTime = currentTime;
	}
	await cu.setGoodStanding(false);
	if (member) {
	    await member.voice.disconnect();
	}
    } else {
	baselineVoteDurationDays = 1;
	const n = VoteDuration.HowManyMoreYesVotes(yesVoteCount, noVoteCount, VoteDuration.SimpleMajority);
	nextStateChangeMessage = `${n} more YES votes to ban`;
	if (!cu.good_standing) {
	    // Vote outcome flipped. Reset the clock.
	    startTime = currentTime;
	}
	await cu.setGoodStanding(true);
    }
    await cu.setBanVoteStartTime(startTime.format());
    const fivePercent = 0.05;
    const durationDays = VoteDuration.EstimateVoteDuration(totalVoters, yesVoteCount, noVoteCount, baselineVoteDurationDays, fivePercent, VoteDuration.SimpleMajority);
    const durationSeconds = durationDays * 86400;
    const endTime = startTime.add(durationSeconds, 'seconds');
    if (currentTime.isAfter(endTime)) {
	// Ban trial is over. End it and clean it up.
	console.log('Trial ended. Cleaning up.');
	console.log(currentTime, 'is after', endTime);
	if (!member) {
	    console.log('Trying to ban an invalid member. Bad sign...');
	}
	if (guilty) {
	    // Record the conviction even if the member has left. That way if they rejoin we can kick them back out.
	    await cu.setBanConvictionTime(currentTime.format());
	}
	if (guilty && member != null) {
	    console.log('About to ban a guild member.');
	    // This line of code actually bans a member of the guild. Test carefully!
	    await member.ban({
		days: 0,  // The number of days of message history to delete, not the length of the ban.
		reason: 'Ban Court',
	    });
	    console.log('Ban implemented.');
	} else {
	    console.log('Not guilty y\'all got to feel me!');
	}
	const trialSummary = (
	    `${threeTicks}` +
	    `${caseTitle}\n` +
	    `${underline}\n\n` +
	    `Voting YES to ban:${yesVoteNames}\n\n` +
	    `Voting NO against the ban:${noVoteNames}\n\n` +
	    `${cu.getNicknameWithInsignia()} is ${outcomeString}. ` +
	    `${nextStateChangeMessage}.${threeTicks}`
	);
	await message.edit(trialSummary);
	await channel.send({ content: trialSummary });
	const dateString = new Date().toISOString().substring(0, 10).replace(/-/g, '');
	const attachment = await discordTranscripts.createTranscript(channel, {
	    filename: `ban-court-${dateString}-${cu.commissar_id}-${roomName}.html`,
	    poweredBy: false,
	    saveImages: false,
	});
	const transcriptChannel = await guild.channels.resolve('1110429964580433920');
	await transcriptChannel.send({
	    content: trialSummary,
	    files: [attachment],
	});
	try {
	    await channel.delete();
	} catch (error) {
	    // Channel has likely already been deleted.
	}
	await cu.setBanVoteStartTime(null);
	await cu.setBanVoteChatroom(null);
	await cu.setBanVoteMessage(null);
	console.log('Trial cleanup done. Justice prevails!');
    } else {
	// Ban trial is still underway. Update it.
	const timeRemaining = endTime.fromNow();
	const trialMessage = (
	    `${threeTicks}` +
	    `${caseTitle}\n` +
	    `${underline}\n\n` +
	    `Voting YES to ban:${yesVoteNames}\n\n` +
	    `Voting NO against the ban:${noVoteNames}\n\n` +
	    `${cu.getNicknameWithInsignia()} is currently ${outcomeString}. ` +
	    `${nextStateChangeMessage}. The vote ends ${timeRemaining}.` +
	    `${threeTicks}`
	);
	await message.edit(trialMessage);
    }
}

// The given Discord message is already verified to start with the !ban prefix.
async function HandleBanCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.rank > banCommandRank) {
	await discordMessage.channel.send('Only Generals can do that.');
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!ban` one person at a time.\n' +
	    'Example: `!ban @nickname`\n' +
	    'Example: `!ban 987654321098765432`'
	);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    if (!mentionedUser) {
	await discordMessage.channel.send(`Couldn't find that member. Maybe they left.`);
	return;
    }
    if (mentionedUser.ban_vote_start_time) {
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is already on trial.`);
	return;
    }
    await discordMessage.channel.send(`${mentionedUser.getRankNameAndInsignia()} has been sent to Ban Court!`);
    const currentTimeIsoString = moment().format();
    await mentionedUser.setBanVoteStartTime(currentTimeIsoString);
    await UpdateTrial(mentionedUser);
}

// Handle all incoming Discord reactions. Not all may be votes.
// Some are regular message reactions in ordinary Discord chats.
// So this routine has to decide for itself which are relevant.
//   reaction - a Discord.js MessageReaction.
//   discordUser - the Discord User that made this reaction.
//   clearConflictingReactions - whether to remove other reactions
//                               from the same user automatically.
async function HandlePossibleReaction(reaction, discordUser, clearConflictingReactions) {
    if (discordUser.bot) {
	// Ignore reactions made by bots.
	return;
    }
    const defendant = UserCache.GetCachedUserByBanVoteMessageId(reaction.message.id);
    if (!defendant) {
	// This reaction is not related to a ban vote. Bail.
	return;
    }
    const juror = await UserCache.GetCachedUserByDiscordId(discordUser.id);
    console.log('Checking juror for conflicting reactions', discordUser.id, juror.commissar_id, juror.rank, juror.citizen);
    if (!juror || juror.rank > banVoteRank) {
	// Ignore votes from unqualified jurors.
	await reaction.users.remove(discordUser.id);
	return;
    }
    // Remove any other reactions by the same user to the same message.
    // This exists so that when a juror changes their vote, they don't
    // have to un-select their old choice. Whatever the latest reaction
    // they clicked on becomes their only vote.
    if (clearConflictingReactions) {
	await reaction.message.fetch();
	for (const [otherReactionId, otherReaction] of reaction.message.reactions.cache) {
	    if (otherReaction.emoji.name !== reaction.emoji.name) {
		console.log(otherReaction.emoji.name, reaction.emoji.name, otherReaction.emoji.name !== reaction.emoji.name);
		await otherReaction.users.remove(discordUser);
	    }
	}
    }
    await UpdateTrial(defendant);
}

// The given Discord message is already verified to start with the !pardon prefix.
async function HandlePardonCommand(discordMessage) {
    console.log('PARDON COMMAND');
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(
	    'Error: `!pardon` one person at a time.\n' +
	    'Example: `!pardon @nickname`\n' +
	    'Example: `!pardon 987654321098765432`'
	);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.user.id);
    if (mentionedUser.ban_vote_start_time) {
	await mentionedUser.setBanVoteStartTime(null);
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    if (mentionedUser.ban_vote_chatroom) {
	const channel = await guild.channels.resolve(mentionedUser.ban_vote_chatroom);
	if (channel) {
	    await channel.delete();
	    await mentionedUser.setBanVoteChatroom(null);
	}
    }
    await mentionedUser.setBanVoteMessage(null);
    await mentionedUser.setGoodStanding(true);
    try {
	await discordMessage.channel.send(`Programmer pardon ${mentionedUser.getNicknameWithInsignia()}!`);
    } catch (error) {
	// In case the command was issued inside the courtroom, which no longer exists.
    }
}

// End a trial early and hard-ban the defendant. Used for emergency unclogging of the ban court.
async function HandleConvictCommand(discordMessage) {
    console.log('CONVICT COMMAND');
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const defendantUser = await UserCache.GetCachedUserByBanVoteChannelId(discordMessage.channel.id);
    if (!defendantUser) {
	await discordMessage.channel.send('This is not a ban courtroom?');
	return;
    }
    await defendantUser.setBanConvictionTime(moment().format());
    const guild = await DiscordUtil.GetMainDiscordGuild();
    try {
	const defendantMember = await guild.members.resolve(defendantUser.discord_id);
	if (defendantMember) {
	    await defendantMember.ban();
	}
    } catch (error) {
	console.log(error);
    }
    if (defendantUser.ban_vote_start_time) {
	await defendantUser.setBanVoteStartTime(null);
    }
    if (defendantUser.ban_vote_chatroom) {
	const channel = await guild.channels.resolve(defendantUser.ban_vote_chatroom);
	if (channel) {
	    await channel.delete();
	    await defendantUser.setBanVoteChatroom(null);
	}
    }
    await defendantUser.setBanVoteMessage(null);
    await defendantUser.setGoodStanding(false);
    try {
	await discordMessage.channel.send(`Convicted ${defendantUser.getNicknameWithInsignia()}!`);
    } catch (error) {
	// In case the command was issued inside the courtroom, which no longer exists.
    }
}

module.exports = {
    HandleBanCommand,
    HandleConvictCommand,
    HandlePardonCommand,
    HandlePossibleReaction,
    UpdateTrial,
};
