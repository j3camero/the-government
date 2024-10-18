const DiscordUtil = require('./discord-util');
const UserCache = require('./user-cache');

async function InitZergCommand(discordMessage) {
    const cu = await UserCache.GetCachedUserByDiscordId(discordMessage.member.id);
    if (!cu) {
	return;
    }
    if (cu.commissar_id !== 7) {
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch('1291189726279241739');
    await channel.send('Signup list goes here');
}

async function UpdateZergList() {
    console.log('Updating zerg list');
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch('1291189726279241739');
    const message = await channel.messages.fetch('1291193875033096192');
    const reaction = await message.reactions.resolve('✅');
    const fetchedReaction = await reaction.fetch();
    const users = await fetchedReaction.users.fetch();
    const names = [];
    for (const [userId, user] of users) {
	let member = null;
	try {
	    member = await guild.members.fetch(userId);
	} catch (error) {
	    member = null;
	}
	if (member) {
	    names.push(member.nickname);
	}
    }
    let signUpList = '```Click the button to sign up.```';
    if (names.length > 0) {
	names.sort();
	signUpList = '```' + names.join('\n') + '```';
    }
    await message.edit(`Press the button to join the zerg base. If you join then you can't have any other base. Everyone on the list will keep 100% of their loot in the zerg base. We go straight to T3 and start raiding without wasting hours making individual bases. The plan is to snowball 24/7 in shifts.\n${signUpList}`);
}

async function HandleReactionAdd(reaction, user) {
    if (reaction.message.id !== '1291193875033096192') {
	return;
    }
    const discordId = user.id;
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const member = await guild.members.fetch(discordId);
    await DiscordUtil.AddRole(member, '1291210093064618025');
    await UpdateZergList();
}

async function HandleReactionRemove(reaction, user) {
    if (reaction.message.id !== '1291193875033096192') {
	return;
    }
    const discordId = user.id;
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const member = await guild.members.fetch(discordId);
    await DiscordUtil.RemoveRole(member, '1291210093064618025');
    await UpdateZergList();
}

module.exports = {
    HandleReactionAdd,
    HandleReactionRemove,
    InitZergCommand,
};
