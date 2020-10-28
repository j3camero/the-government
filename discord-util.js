// Helper functions not specific to any particular Discord bot.
const Discord = require('discord.js');
const fs = require('fs');
const UserCache = require('./commissar-user');

// Looks up the ID of a Discord role by name.
function GetRoleByName(guild, roleName) {
  for (let role of guild.roles.values()) {
    if (role.name === roleName) {
        return role.id;
    }
  }
  return null;
}

// Checks if a Discord guild member has a role, by name.
function GuildMemberHasRole(member, roleName) {
  let found = false;
  member.roles.forEach((role) => {
    if (role.name === roleName) {
      found = true;
    }
  });
  return found;
}

// Returns a list of text channels with names that match channelName.
function GetAllMatchingTextChannels(guild, channelName) {
  const matchingChannels = [];
  guild.channels.forEach((channel) => {
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
  guild.channels.forEach((channel) => {
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
function GetMainDiscordGuild(client) {
    const guildID = '305840605328703500';
    let exactMatch;
    let bestMatch;
    let minTimestamp;
    client.guilds.forEach((guild) => {
	if (guild.id === guildID) {
	    exactMatch = guild;
	}
	if (!minTimestamp || guild.joinedTimestamp < minTimestamp) {
	    bestMatch = guild;
	    minTimestamp = guild.joinedTimestamp;
	}
    });
    if (exactMatch) {
	return exactMatch;
    }
    if (bestMatch) {
	return bestMatch;
    }
    throw 'Error: Main Discord guild not found!';
}

function UpdateChainOfCommandChatChannel(guild, canvas) {
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
    channel.bulkDelete(3)
	.then((messages) => {
	    console.log(`Bulk deleted ${messages.size} messages`);
	})
	.catch(console.error);
    setTimeout(() => {
	const buf = canvas.toBuffer();
	fs.writeFileSync('chain-of-command.png', buf);
	channel.send(mainMessage, {
	    files: [{
		attachment: 'chain-of-command.png',
		name: 'chain-of-command.png'
	    }]
	})
	    .then((message) => {
		// Main message successfully sent. Send footer message now.
		channel.send(footerMessage);
	    })
	    .catch(console.error);;
 
    }, 10);
}

function UpdateHarmonicCentralityChatChannel(client, centrality) {
    const guild = GetMainDiscordGuild(client);
    const channels = GetAllMatchingTextChannels(guild, 'harmonic-centrality');
    if (channels.length === 0) {
	throw new Error('Could not find #harmonic-centrality chat channel.');
    }
    const channel = channels[0];
    // Bulk delete messages
    channel.bulkDelete(3)
	.then((messages) => {
	    console.log(`Bulk deleted ${messages.size} messages`);
	})
	.catch(console.error);
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
    channel.send(message)
	.then((message) => {
	    console.log('Updated #harmonic-centrality');
	})
	.catch(console.error);
}

function GetCommissarIdsOfDiscordMembers(client) {
    const ids = [];
    const guild = GetMainDiscordGuild(client);
    //console.log('Guild:', guild);
    guild.members.fetch().then(console.log).catch(console.error);
    console.log('Members:', guild.members.length);
    guild.members.forEach((member) => {
	const discordID = member.id;
	const cu = UserCache.GetCachedUserByDiscordId(discordID);
	console.log('discordID:', discordID, 'cu:', cu);
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
