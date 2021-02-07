// Code for drawing the Chain of Command as a picture.
//
// The resulting picture looks like a hierarchical org chart of the sort
// used by real-world organizations like militaries and big corporations.
const Canvas = require('canvas');
const com = require('./chain-of-command');

// Determines the number of columns used to display the chain of command.
function CountColumns(chain) {
    let count = 0;
    Object.values(chain).forEach((user) => {
	const lieutenant = 9;
	if (user.rank > lieutenant) {
	    // Ranked below Lieutenant so ignore.
	    return;
	}
	if (!user.children || user.children.length === 0 || user.rank === lieutenant) {
	    ++count;
	}
    });
    return count;
}

// Calculate the largest size of a squad headed by a Lieutenant.
function MaxSquadSize(chain) {
    let biggest = 0;
    Object.values(chain).forEach((user) => {
	const lieutenant = 9;
	if (user.rank === lieutenant) {
	    const squad = com.GetSubordinates(chain, user.id);
	    biggest = Math.max(squad.length, biggest);
	}
    });
    const biggestAllowed = 15;
    return Math.min(biggest, biggestAllowed);
}

function FindMrPresidentInChainOfCommand(chain) {
    let mrPresidentID;
    Object.values(chain).forEach((user) => {
	if (!user.boss) {
	    mrPresidentID = user.id;
	}
    });
    return mrPresidentID;
}

function RenderChainOfCommand(chain, nicknames) {
    const width = 1920;
    const height = 1080;
    const edgeMargin = 16;
    const darkGrey = '#36393f';
    const lightGrey = '#d2d5da';
    const numCols = CountColumns(chain);
    const colWidth = (width - 2 * edgeMargin) / numCols;
    const numRows = MaxSquadSize(chain);
    const colors = {
	'General': '#f4b400',
	'Grunt': '#4285f4',
	'Marshal': '#189b17',
	'Officer': '#db4437',
    };
    const fontSizes = {
	'General': 24,
	'Grunt': 12,
	'Marshal': 24,
	'Officer': 12,
    };

    // Calculate how much total vertical height is taken up by text.
    const totalTextHeight = (
	numRows * fontSizes['Grunt'] +
	// Only 3 Officer levels counted here because the Lieutenants
	// get rendered with their crews, not on their own.
	3 * fontSizes['Officer'] +
	4 * fontSizes['General'] +
	2 * fontSizes['Marshal']
    );
    const textVerticalMarginRatio = 1.25;
    const totalTextMargin = Math.round(totalTextHeight * textVerticalMarginRatio);
    const totalLinkHeight = height - totalTextHeight - totalTextMargin - 2 * edgeMargin;
    const linkHeight = totalLinkHeight / 9;

    // Initialize the canvas.
    const canvas = new Canvas.createCanvas(width, height, 'png');
    const context = canvas.getContext('2d');
    context.fillStyle = darkGrey;
    context.fillRect(0, 0, width, height);

    // Draws one username at a centered x, y coordinate.
    function DrawName(user, x, y, maxWidth) {
	const rank = com.metadata[user.rank];
	context.fillStyle = colors[rank.role] || lightGrey;
	const formattedName = nicknames[user.id] || user.id;
	// Shrink the font to make the text fit if necessary.
	let fontSize = fontSizes[rank.role];
	for ( ; fontSize >= 9; fontSize -= 1) {
	    context.font = `${fontSize}px Arial`;
	    const textWidth = context.measureText(formattedName).width;
	    if (textWidth <= maxWidth) {
		break;
	    }
	}
	x -= context.measureText(formattedName).width / 2;
	y += fontSize / 2 - 2;
	context.fillText(formattedName, Math.floor(x), Math.floor(y));
    }

    // Draws a standin for a group of people, like "+3 More *".
    function DrawStandin(groupSize, x, y, maxWidth) {
	const rank = com.metadata[12];
	context.fillStyle = colors[rank.role] || lightGrey;
	const formattedName = `+${groupSize} More ${rank.insignia}`;
	// Shrink the font to make the text fit if necessary.
	let fontSize = fontSizes[rank.role];
	for ( ; fontSize >= 9; fontSize -= 1) {
	    context.font = `${fontSize}px Arial`;
	    const textWidth = context.measureText(formattedName).width;
	    if (textWidth <= maxWidth) {
		break;
	    }
	}
	x -= context.measureText(formattedName).width / 2;
	y += fontSize / 2 - 2;
	context.fillText(formattedName, Math.floor(x), Math.floor(y));
    }

    let currentColumn = 0;

    function ConsumeColumn() {
	const x = (currentColumn * colWidth) + (colWidth / 2) + edgeMargin;
	++currentColumn;
	return x;
    }

    // Draws a bunch of names in a column.
    function DrawSquad(squad) {
	squad.sort((a, b) => {
	    return a.rank - b.rank;
	});
	const x = ConsumeColumn();
	const lineHeight = fontSizes['Grunt'] * (1 + textVerticalMarginRatio);
	let y = height - edgeMargin - numRows * lineHeight + lineHeight / 2;
	squad.forEach((member, i) => {
	    if (squad.length > numRows && i === numRows - 1) {
		DrawStandin(squad.length - numRows, x, y, colWidth);
	    } else if (squad.length <= numRows || i < numRows - 1) {
		DrawName(member, x, y, colWidth);
	    } else {
		// Don't draw the rest of the extra usernames beyond the max.
	    }
	    y += lineHeight;
	});
	return x;
    }

    // Draw a line.
    function DrawLink(x1, y1, x2, y2) {
	context.strokeStyle = lightGrey;
	context.beginPath();
	context.moveTo(Math.floor(x1) + 0.5, Math.floor(y1) + 0.5);
	context.lineTo(Math.floor(x2) + 0.5, Math.floor(y2) + 0.5);
	context.stroke();
    }

    // Recursively draw the tree.
    function DrawTree(userID, topY) {
	const user = chain[userID];
	if (user.rank >= 9) {
	    // User is Lieutenant or below. Draw squad as flat list.
	    const squad = com.GetSubordinates(chain, user.id);
	    const x = DrawSquad(squad, currentColumn);
	    return { hi: x, lo: x, width: colWidth, x };
	}
	// User is high ranking. Draw as part of the tree.
	const rankMetadata = com.metadata[user.rank];
	const textHeight = fontSizes[rankMetadata.role];
	const bufferHeight = Math.round(textHeight * textVerticalMarginRatio);
	const textBottomY = topY + textHeight + bufferHeight;
	const textMiddleY = (topY + textBottomY) / 2;
	const linkTopY = textBottomY;
	const linkBottomY = linkTopY + linkHeight;
	const linkMiddleY = (linkTopY + linkBottomY) / 2;
	let totalWidth = 0;
	const children = user.children || [];
	let hi, lo, hix, lox;
	children.forEach((childID) => {
	    const child = DrawTree(childID, linkBottomY);
	    if (!hi || child.hi > hi) {
		hi = child.hi;
	    }
	    if (!lo || child.lo < lo) {
		lo = child.lo;
	    }
	    if (!hix || child.x > hix) {
		hix = child.x;
	    }
	    if (!lox || child.x < lox) {
		lox = child.x;
	    }
	    totalWidth += child.width;
	    // Vertical line segment above each child's name.
	    DrawLink(child.x, linkMiddleY, child.x, linkBottomY);
	});
	// Horizontal line segment that links all the children.
	DrawLink(lox, linkMiddleY, hix, linkMiddleY);
	let x;
	if (children.length > 0) {
	    x = (hi + lo) / 2;
	} else {
	    x = ConsumeColumn();
	}
	// Vertical line segment under the user's name.
	DrawLink(x, linkMiddleY, x, linkTopY);
	// Last but not least, draw the user's own name, centered nicely.
	DrawName(user, x, textMiddleY, totalWidth);
	return { hi, lo, width: totalWidth, x }
    }

    const mrPresidentID = FindMrPresidentInChainOfCommand(chain);
    DrawTree(mrPresidentID, edgeMargin);
    return canvas;
}

module.exports = RenderChainOfCommand;
