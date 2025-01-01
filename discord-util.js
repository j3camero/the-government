// Helper functions not specific to any particular Discord bot.
const config = require('./config');
const Discord = require('discord.js');
const fs = require('fs');
const moment = require('moment');
const RoleID = require('./role-id');
const Sleep = require('./sleep');

// Create the Discord client. Does not connect yet.
const client = new Discord.Client({
    fetchAllMembers: true,
    intents: [
	Discord.GatewayIntentBits.DirectMessages,
	Discord.GatewayIntentBits.Guilds,
	Discord.GatewayIntentBits.GuildMembers,
	Discord.GatewayIntentBits.GuildMessages,
	Discord.GatewayIntentBits.GuildMessageReactions,
	Discord.GatewayIntentBits.GuildModeration,
	Discord.GatewayIntentBits.GuildScheduledEvents,
	Discord.GatewayIntentBits.GuildVoiceStates,
	Discord.GatewayIntentBits.MessageContent,
    ],
    partials: [
	Discord.Partials.Channel,
	Discord.Partials.GuildMember,
	Discord.Partials.Message,
	Discord.Partials.Reaction,
	Discord.Partials.User,
    ]
});

// Set to true once the guild roles have been cached once.
let guildRolesCached = false;

const threeTicks = '```';

// Returns a Promise that resolves when the Discord bot is connected.
async function Connect() {
    return new Promise((resolve, reject) => {
	client.on('ready', () => {
	    resolve(client);
	});
	client.login(config.discordBotToken);
    });
}

// Looks up a Discord role by name. Returns the entire structured Discord Role object.
async function GetRoleByName(guild, roleName) {
    if (!guildRolesCached) {
	await guild.roles.fetch();
	guildRolesCached = true;
    }
    const role = guild.roles.cache.find(role => role.name === roleName);
    if (role) {
	return role;
    } else {
	return null;
    }
}

// Checks if a Discord guild member has a role. The targetRole is a structured Discord Role object.
async function GuildMemberHasRole(member, targetRole) {
    if (!guildRolesCached) {
	await member.guild.roles.fetch();
	guildRolesCached = true;
    }
    const foundRole = member.roles.cache.find(role => (role.id === targetRole.id) || (role.id === targetRole));
    return foundRole ? true : false;
}

// Adds a role to a GuildMember.
//
// Tries to be efficient by checking if the member already has the role.
async function AddRole(member, role) {
    const has = await GuildMemberHasRole(member, role);
    if (!role || has) {
	return;
    }
    console.log('Adding role', role.name || role, 'to', member.nickname);
    try {
	await member.roles.add(role);
    } catch (error) {
	console.log('Error while adding a role to a member:');
	console.log(error);
    }
}

// Removes a role from a GuildMember.
//
// Tries to be efficient by checking if the member already has the role.
async function RemoveRole(member, role) {
    const has = await GuildMemberHasRole(member, role);
    if (!role || !has) {
	return;
    }
    console.log('Removing role', role.name || role, 'from', member.nickname);
    try {
	await member.roles.remove(role);
    } catch (error) {
	console.log('Error while removing a role from a member:');
	console.log(error);
    }
}

async function GetCategoryChannelByName(channelName) {
    const guild = await GetMainDiscordGuild();
    for (const [id, channel] of guild.channels.cache) {
	if (channel.name === channelName && channel.type === 4) {
	    return channel;
	}
    }
    return null;
}

async function GetBanCourtCategoryChannel() {
    return await GetCategoryChannelByName('Ban Court');
}

// Returns a list of text channels with names that match channelName.
function GetAllMatchingTextChannels(guild, channelName) {
  const matchingChannels = [];
  guild.channels.cache.forEach((channel) => {
    if (channel.name === channelName && channel.type === 0) {
      matchingChannels.push(channel);
    }
  });
  return matchingChannels;
}

// The the "main" Discord Guild for the Secret Clan.
async function GetMainDiscordGuild() {
    const guildID = '305840605328703500';
    const guild = await client.guilds.fetch(guildID);
    return guild;
}

// Returns the #public text chat channel in the main discord guild.
async function GetPublicChatChannel() {
    const guild = await GetMainDiscordGuild();
    const chatroomNames = ['main', 'public', 'general'];
    for (const i in chatroomNames) {
	const roomName = chatroomNames[i];
	const matchingRooms = GetAllMatchingTextChannels(guild, roomName);
	if (matchingRooms.length > 0) {
	    return matchingRooms[0];
	}
    }
    throw 'Failed to find any main chat channel!';
}

// Send a message to the main Discord server's #public channel.
async function MessagePublicChatChannel(discordMessage) {
    const channel = await GetPublicChatChannel();
    await channel.send(discordMessage);
}

async function UpdateHarmonicCentralityChatChannel(mostCentralUsers) {
    const daysAgo = 30;
    const currentTime = moment();
    const cutoff = currentTime.subtract(daysAgo, 'days');
    const guild = await GetMainDiscordGuild();
    const channels = GetAllMatchingTextChannels(guild, 'ranks');
    if (channels.length === 0) {
	throw new Error('Could not find #harmonic-centrality chat channel.');
    }
    const channel = channels[0];
    await channel.bulkDelete(99);
    await channel.send(`Harmonic Centrality is a math formula that calculates 'influence' in a social network. It is impartial and fair. Anyone can become a General.\n\nMembers active in the last 30 days are shown in green.`);
    const lines = [];
    let maxLength = 0;
    for (const user of mostCentralUsers) {
	const score = user.harmonic_centrality / 1000;
	const scoreString = Math.ceil(score).toString();  // To enable commas add .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	maxLength = Math.max(scoreString.length, maxLength);
	const paddedScore = scoreString.padStart(maxLength, ' ');
	const name = user.getNicknameOrTitleWithInsignia();
	let plusOrMinus = '-';
	if (user.last_seen) {
	    const lastSeen = moment(user.last_seen);
	    if (lastSeen.isAfter(cutoff)) {
		plusOrMinus = '+';
	    }
	}
	const line = `${plusOrMinus} ${paddedScore} ${name}`;
	lines.push(line);
    }
    await SendLongList(lines, channel, true);
}

async function ParseExactlyOneMentionedDiscordMember(discordMessage) {
    // Look for exactly one member being mentioned.
    let mentionedMember;
    // First, check for explicit @mentions. There must be at most 1 or it's an error.
    if (!discordMessage ||
	!discordMessage.mentions ||
	!discordMessage.mentions.members ||
	discordMessage.mentions.members.size < 1) {
	// No members mentioned using @mention. Do nothing. A member might be mentioned
	// in another way, such as by Discord ID.
    } else if (discordMessage.mentions.members.size === 1) {
	return discordMessage.mentions.members.first();
    } else if (discordMessage.mentions.members.size > 1) {
	return null;
    }
    // Second, check for mentions by full Discord user ID. This will usually be a long
    // sequence of digits. Still, finding more than 1 mentioned member is an error.
    const tokens = discordMessage.content.split(' ');
    // Throw out the first token, which we know is the command itself. Keep only the arguments.
    tokens.shift();
    for (const token of tokens) {
	const isNumber = /^\d+$/.test(token);
	if (token.length > 5 && isNumber) {
	    try {
		const guild = await GetMainDiscordGuild();
		mentionedMember = await guild.members.fetch(token);
	    } catch (error) {
		console.log('Error while fetching a member from the discord guild:');
		console.log(error);
		return null;
	    }
	}
    }
    // We might get this far and find no member mentioned by @ or by ID.
    if (!mentionedMember) {
	return null;
    }
    // If we get this far, it means we found exactly one member mentioned,
    // whether by @mention or by user ID.
    return mentionedMember;
}

// Sends a long list of text strings to a text channel. Breaks it up into
// multiple messages if too big.
async function SendLongList(list, channel, diff) {
    const ifDiff = diff ? 'diff\n' : '';
    const maxMessageLength = 1900;
    let message = '';
    for (const s of list) {
	message += s + '\n';
	if (message.length > maxMessageLength) {
	    await channel.send(threeTicks + ifDiff + message + threeTicks);
	    message = '';
	}
    }
    if (message.length > 0) {
	await channel.send(threeTicks + ifDiff + message + threeTicks);
    }
}

// Deletes recent messages from a member.
//
// Only one of these requests can be in-flight per member at any given time.
const membersWithOngoingMessageDeletion = {};
async function DeleteMessagesByMember(member, maxAgeInSeconds) {
    if (member.id in membersWithOngoingMessageDeletion) {
	// Use a mutex to enforce only one process per member at a time.
	return;
    }
    membersWithOngoingMessageDeletion[member.id] = 1;
    console.log(`Deleting messages by ${member.nickname} from the last ${maxAgeInSeconds} seconds.`);
    const maxAgeInMillis = maxAgeInSeconds * 1000;
    const currentTime = new Date().getTime();
    const cutoffTime = currentTime - maxAgeInMillis;
    let failureCount = 0;
    while (failureCount < 3) {
	await Sleep(1000);
	const message = member.lastMessage;
	console.log(`Deleting message ID ${message.id}`);
	if (!message) {
	    console.log(`No more messages to delete.`);
	    failureCount++;
	    continue;
	}
	if (message.createdTimestamp < cutoffTime) {
	    continue;
	}
	try {
	    await message.delete();
	} catch (error) {
	    console.log(`Failed to delete a message. ${error}`);
	    failureCount++;
	    continue;
	}
    }
    console.log(`Finishes deleting messages from member ${member.nickname}.`);
    // Release the lock.
    delete membersWithOngoingMessageDeletion[member.id];
}

async function moveMemberToAfk(member) {
    const afkLoungeId = '703716669452714054';
    await member.voice.setChannel(afkLoungeId, `${member.nickname} has been sent to the AFK channel.`);
    return;
}

const lastTimeNameChangedByChannelId = {};

async function TryToSetChannelNameWithRateLimit(channel, newName) {
    if (channel.name === newName) {
	return;
    }
    const t = Date.now();
    const s = lastTimeNameChangedByChannelId[channel.id] || 0;
    const elapsed = t - s;
    const tenMinutes = 10 * 60 * 1000;
    if (elapsed < tenMinutes) {
	return;
    }
    lastTimeNameChangedByChannelId[channel.id] = t;
    // Do not await. This call is known to hang for a long time when rate limited.
    // Best thing in such cases is to move on.
    channel.setName(newName);
}

const lastTimePermsChangedByChannelId = {};

async function TryToSetChannelPermsWithRateLimit(channel, newPerms) {
    const t = Date.now();
    const s = lastTimePermsChangedByChannelId[channel.id] || 0;
    const elapsed = t - s;
    const tenMinutes = 10 * 60 * 1000;
    if (elapsed < tenMinutes) {
	return;
    }
    lastTimePermsChangedByChannelId[channel.id] = t;
    // Do not await. This call is known to hang for a long time when rate limited.
    // Best thing in such cases is to move on.
    channel.permissionOverwrites.set(newPerms);
}

async function CreateNewVoiceChannelWithBitrate(channelName, permissionOverwrites, bitrate) {
    const guild = await GetMainDiscordGuild();
    const options = {
	bitrate,
	permissionOverwrites,
	name: channelName,
	type: 2,
	userLimit: 99,
    };
    console.log('Creating channel.');
    return await guild.channels.create(options);
}

async function CreateNewVoiceChannelWithPerms(channelName, permissionOverwrites) {
    const bitratesToTry = [384000, 256000, 128000];
    for (const bitrate of bitratesToTry) {
	try {
	    return await CreateNewVoiceChannelWithBitrate(channelName, permissionOverwrites, bitrate);
	} catch (err) {
	    console.log('Failed to create channel with bitrate', bitrate);
	}
    }
    console.log('Failed to create channel with any bitrate');
    return null;
}

async function CreateNewVoiceChannel(channelName) {
    const guild = await GetMainDiscordGuild();
    const perms = [Discord.PermissionFlagsBits.Connect, Discord.PermissionFlagsBits.ViewChannel];
    const defaultPermissionOverwrites = [
	{ id: guild.roles.everyone, deny: perms },
	{ id: RoleID.Commander, allow: perms },
	{ id: RoleID.General, allow: perms },
	{ id: RoleID.Officer, allow: perms },
	{ id: RoleID.Grunt, allow: perms },
	{ id: RoleID.Bots, allow: perms },
    ];
    if (channelName === 'Alpha') {
	defaultPermissionOverwrites.push({ id: RoleID.Recruit, allow: perms });
    }
    return CreateNewVoiceChannelWithPerms(channelName, defaultPermissionOverwrites);
}

module.exports = {
    AddRole,
    Connect,
    CreateNewVoiceChannel,
    CreateNewVoiceChannelWithPerms,
    DeleteMessagesByMember,
    GetAllMatchingTextChannels,
    GetBanCourtCategoryChannel,
    GetCategoryChannelByName,
    GetPublicChatChannel,
    GetMainDiscordGuild,
    GetRoleByName,
    GuildMemberHasRole,
    MessagePublicChatChannel,
    ParseExactlyOneMentionedDiscordMember,
    RemoveRole,
    SendLongList,
    TryToSetChannelNameWithRateLimit,
    TryToSetChannelPermsWithRateLimit,
    UpdateHarmonicCentralityChatChannel,
    moveMemberToAfk
};
