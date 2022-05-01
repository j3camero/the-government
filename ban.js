const DiscordUtil = require('./discord-util');
const moment = require('moment');
const UserCache = require('./user-cache');

const banCommandRank = 5;  // General 1
const banVoteRank = 9;  // Lieutenant

async function UpdateTrial(cu) {
    if (!cu.ban_vote_end_time) {
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
    const roomName = cu.nickname;
    // Update or create the courtroom: a text chat room under the Ban Court category.
    let channel;
    if (cu.ban_vote_chatroom) {
	channel = await guild.channels.resolve(cu.ban_vote_chatroom);
    } else {
	channel = await guild.channels.create(roomName, { type: 'text' });
	await channel.setParent(banCourtCategory);
	if (member) {
	    await channel.createOverwrite(member, {
		CONNECT: true,
		SEND_MESSAGES: true,
		VIEW_CHANNEL: true,
	    });
	}
    }
    if (!channel) {
	console.log('Failed to find or create ban court channel', roomName);
	return;
    }
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
	    if (!jurorUser || !jurorUser.citizen || jurorUser.rank > banVoteRank) {
		// Remove unauthorized vote. This check will catch unauthorized votes that
		// made it through the initial filter because the bot was not running.
		// Also when a juror loses their rank their vote is removed here.
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
    const guilty = VoteOutcome(yesVoteCount, noVoteCount);
    const outcomeString = guilty ? 'banned' : 'NOT GUILTY';
    const caseTitle = `THE GOVERNMENT v ${cu.getNicknameWithInsignia()}`;
    const underline = new Array(caseTitle.length + 1).join('-');
    const threeTicks = '```';
    const currentTime = moment();
    let endTime = moment(cu.ban_vote_end_time);
    const twentyFourHours = moment().add(24, 'hours');
    const sevenDays = moment().add(168, 'hours');
    let nextStateChangeMessage;
    if (guilty) {
	const n = HowManyMoreNo(yesVoteCount, noVoteCount);
	nextStateChangeMessage = `${n} more NO votes to unban`;
	if (cu.good_standing) {
	    endTime = sevenDays;
	    console.log('New trial end time:', endTime.format());
	    await cu.setBanVoteEndTime(endTime.format());
	}
	await cu.setGoodStanding(false);
	if (member) {
	    await member.voice.kick();
	}
    } else {
	const n = HowManyMoreYes(yesVoteCount, noVoteCount);
	nextStateChangeMessage = `${n} more YES votes to ban`;
	if (endTime.isAfter(twentyFourHours)) {
	    endTime = twentyFourHours;
	    console.log('New trial end time:', endTime.format());
	    await cu.setBanVoteEndTime(endTime.format());
	}
	await cu.setGoodStanding(true);
    }
    if (currentTime.isAfter(endTime)) {
	// Ban trial is over. End it and clean it up.
	console.log('Trial ended. Cleaning up.');
	console.log(currentTime, 'is after', endTime);
	if (!member) {
	    console.log('Trying to ban an invalid member. Bad sign...');
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
	try {
	    await channel.delete();
	} catch (error) {
	    // Channel has likely already been deleted.
	}
	await cu.setBanVoteEndTime(null);
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

function VoteOutcome(yes, no) {
    if (yes === 0) {
	return false;
    }
    const voteRatio = yes / (no + yes);
    const threshold = 2 / 3;
    return voteRatio >= threshold;
}

// How many more no votes needed to overturn a conviction?
function HowManyMoreNo(yes, no) {
    const n = 42;
    for (let i = 0; i < n; ++i) {
	if (!VoteOutcome(yes, no + i)) {
	    return i;
	}
    }
    // Shouldn't get here.
    return 0;
}

// How many more yes votes needed to secure a conviction?
function HowManyMoreYes(yes, no) {
    const n = 42;
    for (let i = 0; i < n; ++i) {
	if (VoteOutcome(yes + i, no)) {
	    return i;
	}
    }
    // Shouldn't get here.
    return 0;
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
    if (mentionedUser.ban_vote_end_time) {
	await discordMessage.channel.send(`${mentionedUser.getNicknameOrTitleWithInsignia()} is already on trial.`);
	return;
    }
    await discordMessage.channel.send(`${mentionedUser.getNicknameWithInsignia()} has been sent to Ban Court!`);
    const sevenDays = moment().add(7, 'days').format();
    await mentionedUser.setBanVoteEndTime(sevenDays);
    QueueUpdate(mentionedUser.commissar_id);
}

// A list of commisar IDs that are waiting to have their ban votes updated in Discord.
// This will stop the update operation from being swamped by people spamming the
// voting buttons. The channel will still update within a few seconds, but multiple
// spammed updates will be grouped.
const updateQueue = [];

// Enqueue an update for a user's ban vote chatroom in Discord.
function QueueUpdate(commissar_id) {
    if (!updateQueue.includes(commissar_id)) {
	updateQueue.push(commissar_id);
    }
}

// A helper function that processes one item of the update queue then goes back to sleep.
async function ProcessQueue() {
    if (updateQueue.length === 0) {
	// Short delay whenever no items are processed. This makes the queue more responsive
	// than a fixed-delay loop.
	setTimeout(ProcessQueue, 1000);
	return;
    }
    const commissar_id = updateQueue.shift();
    const defendant = await UserCache.GetCachedUserByCommissarId(commissar_id);
    if (!defendant) {
	// Shouldn't happen. Bail.
	return;
    }
    await UpdateTrial(defendant);
    // Long delay after successfully processing an item. It needs time to comfortably finish.
    setTimeout(ProcessQueue, 10 * 1000);
}

// Kick off the processing of the queue.
setTimeout(ProcessQueue, 1000);

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
	    if (otherReaction.emoji !== reaction.emoji) {
		await otherReaction.users.remove(discordUser);
	    }
	}
    }
    // Queue an update for the Discord chatroom. This stops people flooding
    // the bot with spam votes.
    QueueUpdate(defendant.commissar_id);    
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
    if (mentionedUser.ban_vote_end_time) {
	await mentionedUser.setBanVoteEndTime(null);
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

module.exports = {
    HandleBanCommand,
    HandlePardonCommand,
    HandlePossibleReaction,
    UpdateTrial,
};
