const DiscordUtil = require('./discord-util');
const UserCache = require('./user-cache');

const threeTicks = '```';

async function HandleYenCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    await discordMessage.channel.send('```Current balance: ' + `${cu.yen}` + ' yen```');
}

function IsDigit(s) {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return s in digits;
}

function IsDigitString(s) {
    if (s.length === 0) {
	return false;
    }
    for (let i = 0; i < s.length; i++) {
	if (!IsDigit(s[i])) {
	    return false;
	}
    }
    return true;
}

function ExactlyOneOfTwoStringsMustBeAnInteger(a, b) {
    const aIsDigitString = IsDigitString(a);
    const bIsDigitString = IsDigitString(b);
    if (aIsDigitString && !bIsDigitString) {
	return parseInt(a);
    }
    if (!aIsDigitString && bIsDigitString) {
	return parseInt(b);
    }
    return null;
}

async function UpdateYenChannel() {
    const users = [];
    await UserCache.ForEach((user) => {
	if (user.yen > 0) {
	    users.push(user);
	}
    });
    users.sort((a, b) => {
	if (a.yen > b.yen) {
	    return 1;
	}
	if (a.yen < b.yen) {
	    return -1;
	}
	return 0;
    });
    let message = '';
    let savedMessage;
    let rank = 1;
    let maxYenDigits;
    for (const user of users) {
	const yenString = `¥ ${user.yen}`;
	if (!maxYenDigits) {
	    maxYenDigits = yenString.length;
	}
	const paddedYen = yenString.padStart(maxYenDigits);
	const name = user.getNicknameOrTitleWithInsignia();
	message += `${rank}. ${paddedYen} ${name}\n`;
	if (message.length > 1900) {
	    break;
	}
	savedMessage = message;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const yenChannelId = '1007017809492070522';
    const channel = await guild.channels.resolve(yenChannelId);
    await channel.bulkDelete(3);
    await channel.send(threeTicks + savedMessage + threeTicks);
}

async function YenLog(message) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const logChannelId = '1007018312158429184';
    const channel = await guild.channels.resolve(logChannelId);
    await channel.send(threeTicks + message + threeTicks);
}

async function HandlePayCommandWithAmount(discordMessage, amount) {
    const authorDiscordId = discordMessage.author.id;
    const authorCommissarUser = await UserCache.GetCachedUserByDiscordId(authorDiscordId);
    if (!authorCommissarUser) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (authorCommissarUser.yen < amount) {
	await discordMessage.channel.send('You don\'t have enough yen.');
	return;
    }
    const mentionedMember = await DiscordUtil.ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	await discordMessage.channel.send('Invalid payee. You must specify who to send yen to. Example: `!pay @Jeff 42`');
	return;
    }
    const mentionedDiscordId = mentionedMember.user.id;
    const mentionedCommissarUser = await UserCache.GetCachedUserByDiscordId(mentionedDiscordId);
    if (!mentionedCommissarUser) {
	await discordMessage.channel.send('Error. Invalid recipient for funds.');
	return;
    }
    const senderYenBefore = authorCommissarUser.yen;
    const payeeYenBefore = mentionedCommissarUser.yen;
    const senderYenAfter = senderYenBefore - amount;
    const payeeYenAfter = payeeYenBefore + amount;
    await authorCommissarUser.setYen(senderYenAfter);
    await mentionedCommissarUser.setYen(payeeYenAfter);
    const senderName = authorCommissarUser.getNicknameOrTitleWithInsignia();
    const payeeName = mentionedCommissarUser.getNicknameOrTitleWithInsignia();
    const sweet = Math.random() < 0.1 ? 'of those sweet sweet ' : '';
    const message = `${senderName} sent ${amount} ${sweet}yen to ${payeeName}`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
    await UpdateYenChannel();
}

async function HandlePayCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 3) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!pay @Jeff 42`');
	return;
    }
    const amount = ExactlyOneOfTwoStringsMustBeAnInteger(tokens[1], tokens[2]);
    if (!amount || amount === null || amount === 0) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!pay @Jeff 42`');
	return;
    }
    await HandlePayCommandWithAmount(discordMessage, amount);
}

async function HandleTipCommand(discordMessage) {
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!tip @Jeff`');
	return;
    }
    const amount = 1;
    await HandlePayCommandWithAmount(discordMessage, amount);
}

async function HandleYenCreateCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (cu.commissar_id !== 7) {
	// Only Jeff (user 7) can use this command.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!yencreate 100`');
	return;
    }
    let amount;
    try {
	amount = parseInt(tokens[1]);
    } catch (error) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!yencreate 100`');
	return;
    }
    const yenBefore = cu.yen;
    const yenAfter = yenBefore + amount;
    await cu.setYen(yenAfter);
    const message = `Minted ${amount} brand new yen.`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
    await UpdateYenChannel();
}

async function HandleYenDestroyCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	await discordMessage.channel.send('Error. Invalid account.');
	return;
    }
    if (cu.commissar_id !== 7) {
	// Only Jeff (user 7) can use this command.
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error. Wrong number of parameters. Example: `!yendestroy 100`');
	return;
    }
    let amount;
    try {
	amount = parseInt(tokens[1]);
    } catch (error) {
	await discordMessage.channel.send('Error. You must enter a positive whole number. Example: `!yendestroy 100`');
	return;
    }
    const yenBefore = cu.yen;
    const yenAfter = Math.max(yenBefore - amount, 0);
    await cu.setYen(yenAfter);
    const name = cu.getNicknameOrTitleWithInsignia();
    const message = `Took ${amount} yen out of circulation.`;
    await discordMessage.channel.send(threeTicks + message + threeTicks);
    await YenLog(message);
    await UpdateYenChannel();
}

async function HandleYenFaqCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = await UserCache.GetCachedUserByDiscordId(discordId);
    if (!cu) {
	return;
    }
    if (cu.commissar_id !== 7) {
	return;
    }
    let message = '';
    await discordMessage.channel.send(message);
}

module.exports = {
    HandlePayCommand,
    HandleTipCommand,
    HandleYenCommand,
    HandleYenCreateCommand,
    HandleYenDestroyCommand,
    HandleYenFaqCommand,
};
