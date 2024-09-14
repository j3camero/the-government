const BadWords = require('./bad-words');
const BanVoteCache = require('./ban-vote-cache');
const discordTranscripts = require('discord-html-transcripts');
const DiscordUtil = require('./discord-util');
const moment = require('moment');
const UserCache = require('./user-cache');
const VoteDuration = require('./vote-duration');

const threeTicks = '```';

// General 1 = 15
// Major = 17
// Lieutenant = 19
const banCommandRank = 15;
const banVoteRank = 19;

function SentenceLengthAsString(years) {
    if (years <= 0) {
	return '0 days';
    }
    const daysPerYear = 365.25;
    const days = years * daysPerYear;
    if (days < 50) {
	return `${Math.round(days)} days`;
    }
    const months = 12 * days / daysPerYear;
    if (months < 23) {
	return `${Math.round(months)} months`;
    }
    return `${Math.round(years)} years`;
}

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
	roomName = `case-${cu.commissar_id}`;
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
    // No more rate limit because it's being enforced by the gov bot now.
    //await channel.setRateLimitPerUser(600);
    await cu.setBanVoteChatroom(channel.id);
    // Update or create the ban vote message itself. The votes are reactions to this message.
    let message;
    if (cu.ban_vote_message) {
	try {
	    message = await channel.messages.fetch(cu.ban_vote_message);
	} catch (error) {
	    console.log('Failed to find or create ban court voting message', cu.ban_vote_message);
	    message = null;
	}
    } else {
	message = await channel.send('Welcome to the Ban Court');
	await message.react('✅');
	await message.react('❌');
	await message.pin();
    }
    if (!message) {
	console.log('Failed to find or create ban court voting message', cu.ban_vote_message);
	return;
    }
    await cu.setBanVoteMessage(message.id);
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
	    const emoji = reaction.emoji.name;
	    if (!jurorUser || !jurorUser.citizen || jurorUser.rank > banVoteRank) {
		// Remove unauthorized vote. This check will catch unauthorized votes that
		// made it through the initial filter because the bot was not running.
		// Also when a juror loses their rank their vote is removed here.
		console.log('Removing vote from unqualified juror', jurorUser.commissar_id);
		await BanVoteCache.RecordVoteIfChanged(cu.commissar_id, jurorUser.commissar_id, 0);
	    } else if (emoji === '✅') {
		await BanVoteCache.RecordVoteIfChanged(cu.commissar_id, jurorUser.commissar_id, 1);
	    } else if (emoji === '❌') {
		await BanVoteCache.RecordVoteIfChanged(cu.commissar_id, jurorUser.commissar_id, 2);
	    }
	    await reaction.users.remove(juror);
	}
    }
    const voteTotals = BanVoteCache.CountVotesForDefendant(cu.commissar_id);
    const yesVoteCount = voteTotals[1];
    const noVoteCount = voteTotals[2];
    const voteCount = yesVoteCount + noVoteCount;
    const yesPercentage = voteCount > 0 ? yesVoteCount / voteCount : 0;
    if (member) {
	const before = await channel.permissionOverwrites.resolve(member.id);
	if (cu.peak_rank >= 20 && voteCount >= 5 && yesPercentage >= 0.909) {
	    try {
		await channel.permissionOverwrites.create(member, {
		    Connect: true,
		    SendMessages: false,
		    ViewChannel: true,
		});
	    } catch (error) {
		console.log('Error setting defendant perms for ban court chat channel:');
		console.log(error);
	    }
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
    }
    let outcomeString = 'NOT GUILTY';
    const guilty = VoteDuration.SimpleMajority(yesVoteCount, noVoteCount);
    let banPardonTime;
    if (guilty) {
	// How guilty the defendant is based on the vote margin. Ranges between 0 and 1.
	// One extra "mercy vote" is added to the denominator. This creates a bias in the
	// system towards more lenient sentences that wears off as more voters weigh in.
	const howGuilty = (yesVoteCount - noVoteCount) / (yesVoteCount + noVoteCount + 1);
	const sentenceYears = howGuilty;
	const banLengthInSeconds = Math.round(sentenceYears * 365.25 * 86400);
	banPardonTime = moment().add(banLengthInSeconds, 'seconds').format();
	outcomeString = 'banned for ' + SentenceLengthAsString(sentenceYears);
    }
    const caseTitle = `THE GOVERNMENT v ${cu.getNicknameOrTitleWithInsignia()}`;
    const underline = new Array(caseTitle.length + 1).join('-');
    const currentTime = moment();
    let startTime = moment(cu.ban_vote_start_time);
    const totalVoters = 59;
    let baselineVoteDurationDays;
    let nextStateChangeMessage;
    if (guilty) {
	baselineVoteDurationDays = 3;
	const n = VoteDuration.HowManyMoreNoVotes(yesVoteCount, noVoteCount, VoteDuration.SimpleMajority);
	nextStateChangeMessage = `${n} more NO votes to unban`;
	if (cu.good_standing) {
	    // Vote outcome flipped. Reset the clock.
	    startTime = currentTime;
	}
	await cu.setGoodStanding(false);
	if (member) {
	    try {
		await member.voice.disconnect();
	    } catch (error) {
		console.log('Error while disconnecting a member from voice chat:', error);
	    }
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
	    await cu.setBanPardonTime(banPardonTime);
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
	    `${underline}\n` +
	    `Voting YES to ban: ${yesVoteCount}\n` +
	    `Voting NO against the ban:${noVoteCount}\n\n` +
	    `${cu.getNicknameOrTitleWithInsignia()} is ${outcomeString}` +
	    `${threeTicks}`
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
	await BanVoteCache.DeleteVotesForDefendant(cu.commissar_id);
	console.log('Trial cleanup done. Justice prevails!');
    } else {
	// Ban trial is still underway. Update it.
	const timeRemaining = endTime.fromNow();
	const trialMessage = (
	    `${threeTicks}` +
	    `${caseTitle}\n` +
	    `${underline}\n` +
	    `Voting YES to ban: ${yesVoteCount}\n` +
	    `Voting NO against the ban: ${noVoteCount}\n\n` +
	    `${cu.getNicknameOrTitleWithInsignia()} is ${outcomeString}. ` +
	    `The vote ends ${timeRemaining}.` +
	    `${threeTicks}`
	);
	await message.edit(trialMessage);
    }
}

// The given Discord message is already verified to start with the !ban prefix.
async function HandleBanCommand(discordMessage) {
    const banCourtCategory = await DiscordUtil.GetBanCourtCategoryChannel();
    const banCourtChannelCount = banCourtCategory.children.cache.size;
    if (banCourtChannelCount >= 49) {
	await discordMessage.channel.send('Too many ban trials in progress. Get more votes for the ones already underway to speed them up.');
	return;
    }
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
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is already on trial`);
	return;
    }
    if (!mentionedUser.last_seen) {
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is immune until they send a text message or join voice chat for the first time`);
	return;
    }
    const lastSeen = moment(mentionedUser.last_seen);
    if (moment().subtract(20, 'days').isAfter(lastSeen)) {
	const daysOfInactivity = Math.round(moment().diff(lastSeen, 'days'));
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is immune because their last message or voice acivity was ${daysOfInactivity} days ago.`);
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
	await BanVoteCache.RecordVoteIfChanged(defendant.commissar_id, juror.commissar_id, 0);
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
	const emoji = reaction.emoji.name;
	if (emoji === '✅') {
	    await BanVoteCache.RecordVoteIfChanged(defendant.commissar_id, juror.commissar_id, 1);
	} else if (emoji === '❌') {
	    await BanVoteCache.RecordVoteIfChanged(defendant.commissar_id, juror.commissar_id, 2);
	}
    }
    await reaction.users.remove(discordUser);
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
    await BanVoteCache.DeleteVotesForDefendant(mentionedUser.commissar_id);
    try {
	await discordMessage.channel.send(`Programmer pardon ${mentionedUser.getNicknameOrTitleWithInsignia()}!`);
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
    await defendantUser.setBanPardonTime(moment().add(365, 'days').format());
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
    await BanVoteCache.DeleteVotesForDefendant(defendantUser.commissar_id);
    try {
	await discordMessage.channel.send(`Convicted ${defendantUser.getNicknameOrTitleWithInsignia()}!`);
    } catch (error) {
	// In case the command was issued inside the courtroom, which no longer exists.
    }
}

// 
async function RateLimitBanCourtMessage(discordMessage) {
    const timeframeHours = 4;
    const maxMessagesPerChannelPerTimeframe = 4;
    const defendantUser = await UserCache.GetCachedUserByBanVoteChannelId(discordMessage.channel.id);
    if (!defendantUser) {
	// This is not a ban courtroom. Do nothing.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    if (!defendantUser.ban_vote_chatroom) {
	// No courtroom for some reason. Bail.
	return;
    }
    const channel = await guild.channels.resolve(defendantUser.ban_vote_chatroom);
    if (!channel) {
	// Could not find the channel. Bail.
	return;
    }
    const messages = await channel.messages.fetch({ limit: 20, cache: false });
    const currentTime = Date.now();
    let recentMessageCount = 0;
    for (const [messageId, message] of messages) {
	//console.log(messageId, message.author.username, message.createdTimestamp, message.content);
	if (message.author.id === discordMessage.author.id) {
	    const ageMillis = currentTime - message.createdTimestamp;
	    const ageHours = ageMillis / (60 * 60 * 1000);
	    if (ageHours < timeframeHours) {
		recentMessageCount++;
	    }
	}
    }
    // Recent message count includes the currently posted message, discordMessage.
    if (recentMessageCount > maxMessagesPerChannelPerTimeframe) {
	const explanation = `The wheels of justice turn slowly. There is a limit of 4 messages every 4 hours per juror per trial. Your contributions to ban court are appreciated. Feel free to edit your messages to add more. This message is automated and helps The Government keep #case-files reasonably short. Thank you and sorry for deleting your message.  --The Bot`;
	try {
	    await discordMessage.author.send(explanation);
	} catch (error) {
	    console.log('Failed to DM member for too frequent messages in ban court');
	}
	try {
	    await discordMessage.delete();
	} catch (error) {
	    console.log('Failed to delete a message in ban court');
	}
    }
}

module.exports = {
    HandleBanCommand,
    HandleConvictCommand,
    HandlePardonCommand,
    HandlePossibleReaction,
    RateLimitBanCourtMessage,
    UpdateTrial,
};
