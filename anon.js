const DiscordUtil = require('./discord-util');

const anonChannelId = '1144367458979942571';

async function CheckForMessageInAnonChannel(message) {
    if (message.channel.id !== anonChannelId) {
	// Only process messages in the special #anon channel.
	return;
    }
    if (message.author.bot) {
	// Don't process messages from other bots or from this bot itself.
	// This stops an infinite feedback loop from happening where the
	// bot responds to its own messages by sending more messages.
	return;
    }
    const content = message.content;
    const files = Array.from(message.attachments.values());
    await message.channel.send({ content, files });
    await message.delete();
}

async function HandleAnonCommand(message) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const anonChannel = await guild.channels.fetch(anonChannelId);
    let content = message.content;
    if (content.startsWith('!anon ')) {
	content = content.substring(6);
    }
    const files = Array.from(message.attachments.values());
    await anonChannel.send({ content, files });
    if (!message.guild) {
	return;
    }
    if (message.guild.id === guild.id) {
	await message.delete();
    }
}

module.exports = {
    CheckForMessageInAnonChannel,
    HandleAnonCommand,
};
