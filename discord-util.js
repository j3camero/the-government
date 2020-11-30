// Helper functions not specific to any particular Discord bot.
const Discord = require('discord.js');
const fs = require('fs');
const UserCache = require('./commissar-user');

let guildRolesCached = false;

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

// Returns the main text chat channel for a discord guild.
function GetMainChatChannel(guild) {
  // First, look for any text channel called #main.
  const mains = GetAllMatchingTextChannels(guild, 'main');
  if (mains.length > 0) {
    return mains[0];
  }
  // If no #main found, look for any text channel called #general.
  const generals = GetAllMatchingTextChannels(guild, 'general');
  if (generals.length > 0) {
    return generals[0];
  }
  // If no #main or #general found, return any text channel at all.
  let matchingChannel;
  guild.channels.cache.forEach((channel) => {
    if (channel.type === 'text') {
      matchingChannel = channel;
    }
  });
  if (matchingChannel) {
    return matchingChannel;
  }
  // If no text channels found at all, give up.
  return null;
}

// The the "main" Discord Guild for the Secret Clan.
async function GetMainDiscordGuild(client) {
    const guildID = '305840605328703500';
    const guild = await client.guilds.fetch(guildID);
    return guild;
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
    fs.writeFileSync('chain-of-command.png', buf);
    await channel.send(mainMessage, {
	files: [{
	    attachment: 'chain-of-command.png',
	    name: 'chain-of-command.png'
	}]
    });
    channel.send(footerMessage);
}

async function UpdateHarmonicCentralityChatChannel(client, centrality) {
    const guild = await GetMainDiscordGuild(client);
    const channels = GetAllMatchingTextChannels(guild, 'harmonic-centrality');
    if (channels.length === 0) {
	throw new Error('Could not find #harmonic-centrality chat channel.');
    }
    const channel = channels[0];
    // Bulk delete messages
    channel.bulkDelete(3);
    const flat = [];
    Object.keys(centrality).forEach((i) => {
	flat.push({
	    cid: i,
	    centrality: centrality[i],
	});
    });
    flat.sort((a, b) => {
	return b.centrality - a.centrality;
    });
    const topN = 5;
    const threeBackticks = '\`\`\`';
    let message = ('This is how we elect Mr. President. Harmonic Centrality is a math formula that ' +
		   'calculates \'influence\' in a social network. It is impartial and fair. Anyone ' +
		   'can become Mr. President. Here are the top candidates right now:\n' + threeBackticks);
    for (let i = 0; i < topN && i < flat.length; ++i) {
	const cu = UserCache.GetCachedUserByCommissarId(flat[i].cid);
	const scoreString = Math.round(flat[i].centrality).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const margin = flat[i].centrality / flat[0].centrality - 1;
	const marginString = Math.round(100 * margin);
	message += `${i + 1} ${cu.nickname} (\$${scoreString})`
	if (i > 0) {
	    message += ` [${marginString}\%]`
	}
	message += '\n';
    }
    message += threeBackticks;
    channel.send(message);
}

async function GetCommissarIdsOfDiscordMembers(client) {
    const guild = await GetMainDiscordGuild(client);
    const members = await guild.members.fetch();
    const ids = [];
    members.forEach((member) => {
	const discordID = member.id;
	const cu = UserCache.GetCachedUserByDiscordId(discordID);
	if (cu) {
	    ids.push(cu.commissar_id);
	}
    });
    return ids;
}

module.exports = {
    GetAllMatchingTextChannels,
    GetCommissarIdsOfDiscordMembers,
    GetMainChatChannel,
    GetMainDiscordGuild,
    GetRoleByName,
    GuildMemberHasRole,
    UpdateChainOfCommandChatChannel,
    UpdateHarmonicCentralityChatChannel,
};
