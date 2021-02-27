// Routines for handling bot commands like !ping and !ban.
const Canvas = require('canvas');
const DiscordUtil = require('./discord-util');
const fs = require('fs');
const UserCache = require('./user-cache');

// The given Discord message is already verified to start with the !ping prefix.
// This is an example bot command that has been left in for fun. Maybe it's
// also useful for teaching people how to use bot commands. It's a harmless
// practice command that does nothing.
async function HandlePingCommand(discordMessage) {
    await discordMessage.channel.send('Pong!');
}

// A cheap live test harness to test the code that finds the main chat channel.
// This lets me test it anytime I'm worried it's broken.
async function HandlePingPublicChatCommand(discordMessage) {
    // TODO: add permissions so only high ranking people can use
    // this command.
    await DiscordUtil.MessagePublicChatChannel('Pong!');
}

// A message that starts with !howhigh
async function HandleHowHighCommand(discordMessage) {
    const funnyResponses = [
	'So high.',
	'You wanna get high?',
	'I have no idea what is going on.',
	'You\'re a towel!',
	'That\'s it! That\'s the melody to Funkytown.',
	'Wut?',
	'I haven\'t been high since Wednesday. Oh, oh it is Wednesday?',
    ];
    const randomFunnyResponse = funnyResponses[Math.floor(Math.random() * funnyResponses.length)];
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 7) {
	await discordMessage.channel.send(randomFunnyResponse);
	return;
    }
    let tx;
    let ty;
    let tz;
    let fx;
    let fy;
    let fz;
    try {
	tx = parseFloat(tokens[1]);
	ty = parseFloat(tokens[2]);
	tz = parseFloat(tokens[3]);
	fx = parseFloat(tokens[4]);
	fy = parseFloat(tokens[5]);
	fz = parseFloat(tokens[6]);
    } catch (error) {
	await discordMessage.channel.send(randomFunnyResponse);
	return;
    }
    const dx = tx - fx;
    const dy = ty - fy;
    const dz = tz - fz;
    if (Math.abs(dy) > 100) {
	await discordMessage.channel.send('No firing solution. Excessive vertical separation.');
	return;
    }
    const dh = Math.sqrt(dx * dx + dz * dz);
    if (dh < 20) {
	await discordMessage.channel.send('No firing solution. Target too close.');
	return;
    }
    if (dh > 200) {
	await discordMessage.channel.send('No firing solution. Target too far.');
	console.log('dh', dh);
	return;
    }
    const i = -0.00379;
    const j = 0.0000934;
    const k = -0.00377;
    const q = k * dh * dh;
    const r = dh * (dh * j + 1);
    const c = 0.897;
    const s = i * dh * dh + c - dy;
    if (Math.abs(q) < 0.00001) {
	await discordMessage.channel.send('No firing solution. q parameter error.');
	return;
    }
    if (r * r - 4 * q * s < 0) {
	await discordMessage.channel.send('No firing solution. Negative discriminant.');
	return;
    }
    const b = (Math.sqrt(r * r - 4 * q * s) - r) / (2 * q);
    const a = k * b * b + j * b + i;
    const elevationAngleDegrees = Math.atan(b) * 180 / Math.PI;
    const elevationAngleWindow = (elevationAngleDegrees - 4) / (33.4248394153579 - 4);
    if (elevationAngleWindow < 0) {
	await discordMessage.channel.send('No firing solution. Target too close.');
	return;
    }
    if (elevationAngleWindow > 1) {
	await discordMessage.channel.send('No firing solution. Target too far.');
	return;
    }
    const elevationAngleString = Math.round(100 * elevationAngleWindow).toString().padStart(2, '0');
    const elevationPixels = Math.round(189 + (1 - elevationAngleWindow) * (599 - 189));
    const image = await Canvas.loadImage('window.png');
    const canvas = new Canvas.Canvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, image.width, image.height);
    context.lineWidth = 3;

    function lineAt(y, strokeStyle) {
	context.strokeStyle = strokeStyle;
	context.beginPath();
	context.moveTo(442, y);
	context.lineTo(962, y);
	context.stroke();
    }

    lineAt(elevationPixels, 'rgba(0, 255, 0, 0.1)');
    lineAt(elevationPixels - 12, 'rgba(255, 0, 0, 0.3)');
    lineAt(elevationPixels + 12, 'rgba(255, 0, 0, 0.3)');

    const buf = canvas.toBuffer();
    await fs.writeFileSync('elevation.png', buf);
    await discordMessage.channel.send('Elevation ' + elevationAngleString + '%', {
	files: [{
	    attachment: 'elevation.png',
	    name: 'elevation.png'
	}]
    });
}

// A message that starts with !gender.
async function HandleGenderCommand(discordMessage) {
    const discordId = discordMessage.author.id;
    const cu = UserCache.GetCachedUserByDiscordId(discordId);
    const tokens = discordMessage.content.split(' ');
    if (tokens.length !== 2) {
	await discordMessage.channel.send('Error: wrong number of parameters. Example: `!gender F`');
	return;
    }
    if (tokens[0] !== '!gender') {
	// This should never happen, but just in case...
	throw 'Handler only handles the !gender function. Possible dispatch error.';
    }
    const genderString = tokens[1].toUpperCase();
    if (genderString.length !== 1 || !genderString.match(/[A-Z]/i)) {
	await discordMessage.channel.send('Error: gender must be exactly one letter. Example: `!gender F`');
	return;
    }
    await cu.setGender(genderString);
    await discordMessage.channel.send(`Gender changed to ${genderString}.`);
}

// The given Discord message is already verified to start with the !ban prefix.
// Now authenticate and implement it.
async function HandleBanCommand(discordMessage) {
    if (discordMessage.mentions.members.size === 1) {
	const banMember = discordMessage.mentions.members.first();
	await discordMessage.channel.send(`Test ban ${banMember.nickname}!`);
    } else if (discordMessage.mentions.members.size < 1) {
	await discordMessage.channel.send('Ban who? Example: !ban @nickname');
    } else if (discordMessage.mentions.members.size > 1) {
	await discordMessage.channel.send('Must ban exactly one username at a time. Example: !ban @nickname');
    }
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
	await discordMessage.channel.send(
	    'Error: !friend one person at a time. Example: !friend @nickname');
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
	    if (mentionedMember) {
		await discordMessage.channel.send(
		    'Error: !friend one person at a time. Example: !friend 987654321098765432');
		return null;
	    }
	    try {
		const guild = await DiscordUtil.GetMainDiscordGuild();
		mentionedMember = await guild.members.fetch(token);
	    } catch (error) {
		await discordMessage.channel.send(
		    `Error: invalid Discord user ID ${token}. Right-click the person you want and select Copy ID.`);
		return null;
	    }
	} else {
	    await discordMessage.channel.send(
		`Error: invalid Discord user ID ${token}. Right-click the person you want and select Copy ID.`);
	    return null;
	}
    }
    // We might get this far and find no member mentioned by @ or by ID.
    if (!mentionedMember) {
	await discordMessage.channel.send('Example: !friend @nickname');
	return null;
    }
    // If we get this far, it means we found exactly one member mentioned,
    // whether by @mention or by user ID.
    return mentionedMember;
}

async function GetAuthorFriendRole(discordMessage) {
    const cu = await UserCache.GetCachedUserByDiscordId(discordMessage.author.id);
    if (!cu || !cu.friend_role_id) {
	console.log(`Author ${discordMessage.author.username} lacks friend role.`);
	return null;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const friendRole = await guild.roles.resolve(cu.friend_role_id);
    return friendRole;
}

// The given Discord message is already verified to start with the !friend prefix.
async function HandleFriendCommand(discordMessage) {
    const friendRole = await GetAuthorFriendRole(discordMessage);
    if (!friendRole) {
	return;
    }
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	return;
    }
    console.log(`ADD FRIEND: ${discordMessage.author.username} adds ${mentionedMember.nickname}`);
    DiscordUtil.AddRole(mentionedMember, friendRole);
}

// The given Discord message is already verified to start with the !unfriend prefix.
async function HandleUnfriendCommand(discordMessage) {
    const friendRole = await GetAuthorFriendRole(discordMessage);
    if (!friendRole) {
	return;
    }
    const mentionedMember = await ParseExactlyOneMentionedDiscordMember(discordMessage);
    if (!mentionedMember) {
	return;
    }
    console.log(`UN FRIEND: ${discordMessage.author.username} unfriends ${mentionedMember.nickname}`);
    DiscordUtil.RemoveRole(mentionedMember, friendRole);
}

// Handle any unrecognized commands, possibly replying with an error message.
async function HandleUnknownCommand(discordMessage) {
    // TODO: add permission checks. Only high enough ranks should get a error
    // message as a reply. Those of lower rank shouldn't get any response at
    // all to avoid spam.
    //await discordMessage.channel.send(`Unknown command.`);
}

// This function analyzes a Discord message to see if it contains a bot command.
// If so, control is dispatched to the appropriate command-specific handler function.
async function Dispatch(discordMessage) {
    if (!discordMessage.content || discordMessage.content.length === 0) {
	return;
    }
    if (discordMessage.content.charAt(0) !== '!') {
	return;
    }
    const tokens = discordMessage.content.split(' ');
    if (tokens.length === 0) {
	return;
    }
    const command = tokens[0];
    if (command === '!ban') {
	await HandleBanCommand(discordMessage);
    } else if (command === '!gender') {
	await HandleGenderCommand(discordMessage);
    } else if (command === '!howhigh') {
	await HandleHowHighCommand(discordMessage);
    } else if (command === '!ping') {
	await HandlePingCommand(discordMessage);
    } else if (command === '!pingpublic') {
	await HandlePingPublicChatCommand(discordMessage);
    } else if (command === '!friend') {
	await HandleFriendCommand(discordMessage);
    } else if (command === '!unfriend') {
	await HandleUnfriendCommand(discordMessage);
    } else {
	await HandleUnknownCommand(discordMessage);
    }
}

module.exports = {
    Dispatch,
};
