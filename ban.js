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
    const banCourtCategory = await DiscordUtil.GetBanCourtCategoryChannel();
    const roomName = cu.nickname;
    // Update or create the courtroom: a text chat room under the Ban Court category.
    const channel = await RateLimit.Run(async () => {
	if (cu.ban_vote_chatroom) {
	    return await guild.channels.resolve(cu.ban_vote_chatroom);
	} else {
	    const newChannel = await guild.channels.create(roomName, { type: 'text' });
	    await newChannel.setParent(banCourtCategory);
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
    for (const [reactionId, reaction] of message.reactions.cache) {
	console.log(reaction.emoji.name, reaction.count);
    }
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
    await UpdateBanTrial(mentionedUser);
}

// Handle all incoming Discord reactions. Not all may be votes.
// Some are regular message reactions in ordinary Discord chats.
// So this routine has to decide for itself which are relevant.
//   reaction - a Discord.js MessageReaction.
//   discordUser - the Discord User that made this reaction.
//   clearConflictingReactions - whether to remove other reactions
//                               from the same user automatically.
async function HandlePossibleReaction(reaction, discordUser, clearConflictingReactions) {
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
    await UpdateBanTrial(defendant);
}

// The given Discord message is already verified to start with the !pardon prefix.
async function HandlePardonCommand(discordMessage) {
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
    if (mentionedUser.ban_vote_message) {
	await mentionedUser.setBanVoteMessage(null);
    }
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
    UpdateBanTrial,
};
