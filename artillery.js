const Canvas = require('canvas');
const fs = require('fs');

// Handle a chat message that starts with !art, !artillery, !howhigh, etc.
// This calculates the trajectory of a rocket in Rust to assist in precision
// aiming from a distance. It's ENIAC for Rust.
async function HandleArtilleryCommand(discordMessage) {
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
    let bearingRadians = Math.atan2(tz - fz, tx - fx);
    const bearingDegrees = bearingRadians * 180 / Math.PI;
    const bearingRounded = Math.round(bearingDegrees);
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
    await discordMessage.channel.send(`Elevation ${elevationAngleString} % - Direction ${bearingRounded}`, {
	files: [{
	    attachment: 'elevation.png',
	    name: 'elevation.png'
	}]
    });
}

module.exports = HandleArtilleryCommand;
