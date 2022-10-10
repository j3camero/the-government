
const rulesChannelId = '987549333144633355';

async function HandleRulesCommand(discordMessage) {
    const author = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!author || author.commissar_id !== 7) {
	// Auth: this command for developer use only.
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const rulesChannel = await guild.channels.resolve(rulesChannelId);
    const messages = await rulesChannel.messages.fetch();
    const rulesMessage = messages.first();
    const oldText = rulesMessage.content;
    const newText = discordMessage.content.substring(7);
    const diffs = diff.diffLines(oldText, newText);
    let diffText = '```diff\n';
    for (const d of diffs) {
	const lines = d.value.split('\n');
	for (let i = 0; i < d.count; i++) {
	    const line = lines[i];
	    if (d.added) {
		diffText += '+';
	    }
	    if (d.removed) {
		diffText += '-';
	    }
	    diffText += line + '\n';
	}
    }
    diffText += '```';
    await discordMessage.channel.send(diffText);
}

module.exports = {
    HandleRulesCommand,
};
