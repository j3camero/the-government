// Helper functions not specific to any particular Discord bot.
const config = require('./config');
const Discord = require('discord.js');
const fs = require('fs');
const RateLimit = require('./rate-limit');

// Create the Discord client. Does not connect yet.
const client = new Discord.Client({
    fetchAllMembers: true,
});

// Set to true once the guild roles have been cached once.
let guildRolesCached = false;

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
function GuildMemberHasRole(member, targetRole) {
    const foundRole = member.roles.cache.find(role => role.id === targetRole.id);
    return foundRole ? true : false;
}

// Adds a role to a GuildMember.
//
// Tries to be efficient by checking if the member already has the role.
function AddRole(member, role) {
    if (!role || GuildMemberHasRole(member, role)) {
	return;
    }
    RateLimit.Run(() => {
	console.log('Adding role', role.name, 'to', member.nickname);
	member.roles.add(role);
    });
}

// Removes a role from a GuildMember.
//
// Tries to be efficient by checking if the member already has the role.
function RemoveRole(member, role) {
    if (!role || !GuildMemberHasRole(member, role)) {
	return;
    }
    RateLimit.Run(() => {
	console.log('Removing role', role.name, 'from', member.nickname);
	member.roles.remove(role);
    });
}

async function GetCategoryChannelByName(channelName) {
    const guild = await GetMainDiscordGuild();
    for (const [id, channel] of guild.channels.cache) {
	if (channel.name === channelName && channel.type === 'category') {
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
    if (channel.name === channelName && channel.type === 'text') {
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
    channel.send(discordMessage);
}

async function UpdateChainOfCommandChatChannel(guild, canvas) {
    const mainMessage = (
	'The Chain of Command auto updates based on who you spend time with in Discord. ' +
	    'Anyone can become Mr. President because of the impartial AI algorithm.');
    const footerMessage = (
	'Most clans have some kind of President-for-life or other fixed leadership ' +
	    'positions. Not us. That is what makes our clan totally unique.');
    const channels = GetAllMatchingTextChannels(guild, 'chain-of-command');
    if (channels.length === 0) {
	throw new Error('Could not find #chain-of-command chat channel.');
    }
    const channel = channels[0];
    // Bulk delete messages
    await channel.bulkDelete(3);
    const buf = canvas.toBuffer();
    fs.writeFileSync('live-chain-of-command.png', buf);
    await channel.send(mainMessage, {
	files: [{
	    attachment: 'live-chain-of-command.png',
	    name: 'chain-of-command.png'
	}]
    });
    channel.send(footerMessage);
}

async function UpdateHarmonicCentralityChatChannel(mostCentralUsers) {
    const guild = await GetMainDiscordGuild();
    const channels = GetAllMatchingTextChannels(guild, 'harmonic-centrality');
    if (channels.length === 0) {
	throw new Error('Could not find #harmonic-centrality chat channel.');
    }
    const channel = channels[0];
    // Bulk delete messages
    await channel.bulkDelete(3);
    const threeBackticks = '\`\`\`';
    let message = ('This is how we elect Mr. President. Harmonic Centrality is a math formula that ' +
		   'calculates \'influence\' in a social network. It is impartial and fair. Anyone ' +
		   'can become Mr. President. Here are the top candidates right now:\n' + threeBackticks);
    for (let i = 0; i < mostCentralUsers.length; ++i) {
	const cu = mostCentralUsers[i];
	const scoreString = Math.round(cu.harmonic_centrality).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const margin = cu.harmonic_centrality / mostCentralUsers[0].harmonic_centrality - 1;
	const marginString = Math.round(100 * margin);
	message += `${i + 1} ${cu.getNicknameOrTitleWithInsignia()} (\$${scoreString})`
	if (i > 0) {
	    message += ` [${marginString}\%]`
	}
	message += '\n';
    }
    message += threeBackticks;
    await channel.send(message);
}

module.exports = {
    AddRole,
    Connect,
    GetAllMatchingTextChannels,
    GetBanCourtCategoryChannel,
    GetCategoryChannelByName,
    GetPublicChatChannel,
    GetMainDiscordGuild,
    GetRoleByName,
    GuildMemberHasRole,
    MessagePublicChatChannel,
    RemoveRole,
    UpdateChainOfCommandChatChannel,
    UpdateHarmonicCentralityChatChannel,
};
