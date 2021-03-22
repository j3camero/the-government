const DiscordUtil = require('./discord-util');
const moment = require('moment');
const RateLimit = require('./rate-limit');
const UserCache = require('./user-cache');

async function UpdateBanTrial(cu) {
    if (!cu.ban_vote_end_time) {
	// No trial to update.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const member = await guild.members.fetch(cu.discord_id);
    const banCourtCategory = await DiscordUtil.GetBanCourtCategoryChannel();
    const roomName = cu.nickname;
    // Update or create the courtroom: a text chat room under the Ban Court category.
    const channel = await RateLimit.Run(async () => {
	if (cu.ban_vote_chatroom) {
	    return await guild.channels.resolve(cu.ban_vote_chatroom);
	} else {
	    const newChannel = await guild.channels.create(roomName, { type: 'text' });
	    await newChannel.setParent(banCourtCategory);
	    await newChannel.createOverwrite(member, {
		'CONNECT': true,
		'VIEW_CHANNEL': true,
	    });
	    return newChannel;
	}
    });
    await cu.setBanVoteChatroom(channel.id);
    // Update or create the ban vote message itself. The votes are reactions to this message.
    const message = await RateLimit.Run(async () => {
	if (cu.ban_vote_message) {
	    return await channel.messages.fetch(cu.ban_vote_message);
	} else {
	    const newMessage = await channel.send('Welcome to the Ban Court');
	    await newMessage.react('✅');
	    await newMessage.react('❌');
	    await newMessage.pin();
	    return newMessage;
	}
    });
    await cu.setBanVoteMessage(message.id);
    const noVotes = [];
    const yesVotes = [];
    // Count up all the votes. Remove any unauthorized votes.
    for (const [reactionId, reaction] of message.reactions.cache) {
	for (const [jurorId, juror] of await reaction.users.fetch()) {
	    if (juror.bot) {
		continue;
	    }
	    const jurorUser = await UserCache.GetCachedUserByDiscordId(juror.id);
	    if (!jurorUser || jurorUser.rank > 5) {
		// Remove unauthorized vote. This check will catch unauthorized votes that
		// made it through the initial filter because the bot was not running.
		await reaction.users.remove(juror);
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
    let nextStateChangeMessage = `${cu.getNicknameWithInsignia()} is currently `;
    if (guilty) {
	const n = HowManyMoreNo(yesVoteCount, noVoteCount);
	nextStateChangeMessage += `banned. ${n} more NO votes to unban.`;
	await cu.setGoodStanding(false);
	await AddDefendantRole(guild, member);
	await member.voice.kick();
    } else {
	const n = HowManyMoreYes(yesVoteCount, noVoteCount);
	nextStateChangeMessage += `NOT GUILTY. ${n} more YES votes to ban.`;
	await cu.setGoodStanding(true);
	await RemoveDefendantRole(guild, member);
    }
    const threeTicks = '```';
    const trialMessage = `${threeTicks}SECRET CLAN v ${cu.nickname}\n\nVoting YES to ban\n-----------------${yesVoteNames}\n\nVoting NO against the ban\n-------------------------${noVoteNames}\n\n${nextStateChangeMessage}${threeTicks}`;
    await message.edit(trialMessage);
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
    const n = 5 * (yes + no) + 10;
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
    const n = yes + no + 2;
    for (let i = 0; i < n; ++i) {
	if (VoteOutcome(yes + i, no)) {
	    return i;
	}
    }
    // Shouldn't get here.
    return 0;
}

async function AddDefendantRole(guild, member) {
    const defendant = await DiscordUtil.GetRoleByName(guild, 'Defendant');
    const notGuilty = await DiscordUtil.GetRoleByName(guild, 'Not Guilty');
    const marshal = await DiscordUtil.GetRoleByName(guild, 'Marshal');
    const general = await DiscordUtil.GetRoleByName(guild, 'General');
    const officer = await DiscordUtil.GetRoleByName(guild, 'Officer');
    const grunt = await DiscordUtil.GetRoleByName(guild, 'Grunt');
    DiscordUtil.AddRole(member, defendant);
    DiscordUtil.RemoveRole(member, notGuilty);
    DiscordUtil.RemoveRole(member, marshal);
    DiscordUtil.RemoveRole(member, general);
    DiscordUtil.RemoveRole(member, officer);
    DiscordUtil.RemoveRole(member, grunt);
}

async function RemoveDefendantRole(guild, member) {
    const defendant = await DiscordUtil.GetRoleByName(guild, 'Defendant');
    const notGuilty = await DiscordUtil.GetRoleByName(guild, 'Not Guilty');
    DiscordUtil.RemoveRole(member, defendant);
    DiscordUtil.AddRole(member, notGuilty);
}

// The given Discord message is already verified to start with the !ban prefix.
async function HandleBanCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.rank > 5) {
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
    await discordMessage.channel.send(`Test ban ${mentionedUser.getNicknameWithInsignia()}!`);
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
    await UpdateBanTrial(defendant);
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
    if (!juror || juror.rank > 5) {
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
	await channel.delete();
	await mentionedUser.setBanVoteChatroom(null);
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
};
