const Discord = require('discord.js');
const DiscordUtil = require('./discord-util');
const fc = require('./friend-cache');
const RoleID = require('./role-id.js');
const UserCache = require('./user-cache');

const friendBadgeRank = 15;
const threeTicks = '```';

async function CreateAndDestroyFriendBadgesByRank() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	const name = user.getNicknameOrTitleWithInsignia(true);
	const color = user.getRankColorDecimal();
	// CASE 1: user ranked up and needs a badge. Create one.
	if (user.rank <= friendBadgeRank && !user.friend_role_id) {
	    try {
		console.log('Making friend role for', name);
		const newFriendRole = await guild.roles.create({ color, name });
		await user.setFriendRoleId(newFriendRole.id);
		const member = await guild.members.fetch(user.discord_id);
		if (member) {
		    member.roles.add(newFriendRole);
		}
	    } catch (error) {
		console.log('ERROR while creating friend role:', error);
		return;
	    }
	}
	// CASE 2: user ranked down. Destroy their badge.
	else if (user.rank > friendBadgeRank + 1 && user.friend_role_id) {
	    const friendRole = await guild.roles.fetch(user.friend_role_id);
	    await friendRole.delete();
	    await user.setFriendRoleId(null);
	}
	// CASE 3: user has a badge. Update name and color if needed.
	else if (user.rank <= friendBadgeRank && user.friend_role_id) {
	    const friendRole = await guild.roles.fetch(user.friend_role_id);
	    if (friendRole.name !== name) {
		console.log('Updating role name', name);
		await friendRole.setName(name);
	    }
	    if (friendRole.color !== color) {
		console.log('Updating role color', name, color);
		await friendRole.setColor(color);
	    }
	    const member = await guild.members.fetch(user.discord_id);
	    if (member) {
		if (!member.roles.cache.has(friendRole.id)) {
		    member.roles.add(friendRole);
		}
	    }
	}
    }
    await SortRoles();
}

// Every time people are spotted in a friend room, the timestamp for
// that room is updated.
const lastTimeRoomHadPeopleInIt = {};
const lastTimeRoomClosed = {};

async function CreateAndDestroyFriendRoomsByRank() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	const name = user.getNicknameOrTitleWithInsignia(true);
	// CASE 1: user ranked up and needs a room. Create one.
	if (user.rank <= friendBadgeRank && !user.friend_voice_room_id) {
	    try {
		console.log('Making friend room for', name);
		const perms = [Discord.PermissionFlagsBits.Connect, Discord.PermissionFlagsBits.ViewChannel];
		const permissionOverwrites = [
		    { id: guild.roles.everyone, deny: perms },
		    { id: user.discord_id, allow: perms },
		];
		const newFriendRoom = await DiscordUtil.CreateNewVoiceChannelWithPerms(name, permissionOverwrites);
		await user.setFriendVoiceRoomId(newFriendRoom.id);
		const member = await guild.members.fetch(user.discord_id);
	    } catch (error) {
		console.log('ERROR while creating friend room:', error);
		return;
	    }
	}
	// CASE 2: user ranked down. Destroy their room.
	else if (user.rank > friendBadgeRank + 1 && user.friend_voice_room_id) {
	    const friendRoom = await guild.channels.fetch(user.friend_voice_room_id);
	    await friendRoom.delete();
	    await user.setFriendVoiceRoomId(null);
	}
	// CASE 3: user has a room. Update name if needed.
	else if (user.rank <= friendBadgeRank && user.friend_voice_room_id) {
	    const friendRoom = await guild.channels.fetch(user.friend_voice_room_id);
	    if (friendRoom.name !== name) {
		console.log('Updating room name', name);
		await DiscordUtil.TryToSetChannelNameWithRateLimit(friendRoom, name);
	    }
	    const connect = Discord.PermissionFlagsBits.Connect;
	    const view = Discord.PermissionFlagsBits.ViewChannel;
	    if (friendRoom.members.size > 0) {
		if (!(user.friend_voice_room_id in lastTimeRoomHadPeopleInIt)) {
		    const activePerms = [
			{ id: guild.roles.everyone, deny: [connect, view] },
			{ id: RoleID.Grunt, allow: [view] },
			{ id: RoleID.Officer, allow: [view] },
			{ id: RoleID.General, allow: [view] },
			{ id: RoleID.Commander, allow: [view] },
			{ id: RoleID.Bots, allow: [connect, view] },
			{ id: user.discord_id, allow: [connect, view] },
			{ id: user.friend_role_id, allow: [connect, view] },
		    ];
		    console.log('Opening friend room', name);
		    await friendRoom.permissionOverwrites.set(activePerms);
		}
		lastTimeRoomHadPeopleInIt[user.friend_voice_room_id] = Date.now();
		delete lastTimeRoomClosed[user.friend_voice_room_id];
	    } else {
		if (!(user.friend_voice_room_id in lastTimeRoomClosed)) {
		    const oneHour = 60 * 60 * 1000;
		    const oneHourAgo = Date.now() - oneHour;
		    const lastActiveTime = lastTimeRoomHadPeopleInIt[user.friend_voice_room_id] || oneHourAgo;
		    const howLongEmpty = Date.now() - lastActiveTime;
		    const cooldown = 15 * 60 * 1000;
		    if (howLongEmpty > cooldown) {
			const emptyPerms = [
			    { id: guild.roles.everyone, deny: [connect, view] },
			    { id: RoleID.Bots, allow: [connect, view] },
			    { id: user.discord_id, allow: [connect, view] },
			];
			console.log('Closing friend room', name);
			await friendRoom.permissionOverwrites.set(emptyPerms);
			lastTimeRoomClosed[user.friend_voice_room_id] = Date.now();
			delete lastTimeRoomHadPeopleInIt[user.friend_voice_room_id];
		    }
		}
	    }
	}
    }
}

async function SortRoles() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const allRoles = await guild.roles.fetch();
    const sortableRoles = [];
    for (const [id, role] of allRoles) {
	const isFriendRole = role.id in fc.friendRoleCache;
	if (isFriendRole) {
	    const uid = fc.friendRoleCache[role.id];
	    const cu = UserCache.GetCachedUserByCommissarId(uid);
	    const score = parseFloat(cu.rank_score);
	    sortableRoles.push({ role, score });
	}
    }
    sortableRoles.sort((a, b) => a.score - b.score);
    const rolePositions = [];
    let positionCount = 0;
    for (const r of sortableRoles) {
	rolePositions.push({
	    role: r.role.id,
 	    position: positionCount,
	});
	console.log(positionCount, r.role.name, r.score);
	positionCount++;
    }
    await guild.roles.setPositions(rolePositions);
}

async function HandleFriendCommand(discordMessage) {
    const authorUser = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!authorUser) {
	return;
    }
    if (!authorUser.friend_role_id) {
	await discordMessage.channel.send(threeTicks + `You can't have friends yet. Level up until you get a friend badge with your name on it.` + threeTicks);
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(threeTicks + `Couldn't find that member. They might have left the Discord guild. Have them re-join then try again.` + threeTicks);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (!mentionedUser) {
	return;
    }
    const authorName = authorUser.getNicknameOrTitleWithInsignia(true);
    const mentionedName = mentionedUser.getNicknameOrTitleWithInsignia(true);
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const friendRole = await guild.roles.fetch(authorUser.friend_role_id);
    if (mentionedMember.roles.cache.has(friendRole.id)) {
	await discordMessage.channel.send(threeTicks + `You are already friends with ${mentionedName}` + threeTicks);
    } else {
	await mentionedMember.roles.add(friendRole);
	await discordMessage.channel.send(threeTicks + `${authorName} added ${mentionedName} to their friends list` + threeTicks);
    }
}

async function HandleUnfriendCommand(discordMessage) {
    const authorUser = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!authorUser) {
	return;
    }
    if (!authorUser.friend_role_id) {
	await discordMessage.channel.send(threeTicks + `You can't have friends yet. Level up until you get a friend badge with your name on it.` + threeTicks);
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send(threeTicks + `Couldn't find that member. They might have left the Discord guild. Have them re-join then try again.` + threeTicks);
	return;
    }
    const mentionedUser = await UserCache.GetCachedUserByDiscordId(mentionedMember.id);
    if (!mentionedUser) {
	return;
    }
    const authorName = authorUser.getNicknameOrTitleWithInsignia(true);
    const mentionedName = mentionedUser.getNicknameOrTitleWithInsignia(true);
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const friendRole = await guild.roles.fetch(authorUser.friend_role_id);
    if (mentionedMember.roles.cache.has(friendRole.id)) {
	await mentionedMember.roles.remove(friendRole);
	await discordMessage.channel.send(threeTicks + `${authorName} removed ${mentionedName} from their friends list` + threeTicks);
    } else {
	await discordMessage.channel.send(threeTicks + `You are not friends with ${mentionedName}` + threeTicks);
    }
    // Kick them from the voice channel if they are in it.
    const channel = mentionedMember.voice.channel;
    if (channel) {
	if (channel.id === authorUser.friend_voice_room_id) {
	    await mentionedMember.voice.disconnect();
	}
    }
}

// To avoid race conditions on the cheap, use a system of routine updates.
// To schedule an update, a boolean flag is flipped. That way, the next time
// the cycle goes around, it knows that an update is needed. Redundant or
// overlapping updates are avoided this way.
let isUpdateNeeded = false;
setTimeout(FriendUpdate, 9000);

async function FriendUpdate() {
    if (isUpdateNeeded) {
	console.log('Updating friend rooms.');
	await CreateAndDestroyFriendRoomsByRank();
	isUpdateNeeded = false;
    }
    setTimeout(FriendUpdate, 1000);
}

function ScheduleUpdate() {
    isUpdateNeeded = true;
}

module.exports = {
    CreateAndDestroyFriendBadgesByRank,
    HandleFriendCommand,
    HandleUnfriendCommand,
    ScheduleUpdate,
};
