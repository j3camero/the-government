const DiscordUtil = require('./discord-util');
const fs = require('fs');

const rulesChannelId = '614764682758062080';

async function UpdateRulesIfChanged() {
    const rulesDotTxt = fs.readFileSync('rules.txt').toString();
    console.log('Loaded rules.txt length:', rulesDotTxt.length);
    if (rulesDotTxt.length < 10) {
	console.log('New rules too short. Bailing.');
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch(rulesChannelId);
    if (!channel) {
	console.log(`Can't find the rules channel.`);
	return;
    }
    await channel.bulkDelete(3);
    await channel.send(rulesDotTxt);
}

module.exports = {
    UpdateRulesIfChanged,
};
