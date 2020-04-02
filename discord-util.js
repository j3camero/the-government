// Helper functions not specific to any particular Discord bot.
const Discord = require('discord.js');
const fs = require('fs');

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

module.exports = {
    GetAllMatchingTextChannels,
    GetMainChatChannel,
    GetMainDiscordGuild,
    GetRoleByName,
    GuildMemberHasRole,
    UpdateChainOfCommandChatChannel,
};
