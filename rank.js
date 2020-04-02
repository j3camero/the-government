const fs = require('fs');
const Canvas = require('canvas');

function GenerateIdealRanksSorted(n) {
    // President, VP, and Generals.
    const ranks = [
	13, 12,
	11, 11,
	10, 10, 10, 10,
	9, 9, 9, 9, 9,
	8, 8, 8, 8, 8, 8
    ];
    if (n <= ranks.length) {
	return ranks.slice(0, n).reverse();
    }
    // Officers: max 10 people per rank.
    let remaining = n - ranks.length;
    for (let r = 7; r >= 4; --r) {
	const equalSlice = Math.floor(remaining / r);
	const howMany = Math.min(equalSlice, 10);
	for (let j = 0; j < howMany; ++j) {
	    ranks.push(r);
	}
	remaining -= howMany;
    }
    // Grunts: same number of people at each rank.
    for (let r = 3; r >= 1; --r) {
	const equalSlice = Math.floor(remaining / r);
	for (let j = 0; j < equalSlice; ++j) {
	    ranks.push(r);
	}
	remaining -= equalSlice;
    }
    return ranks.reverse();
}

const metadata = [
    {index: 0, title: 'n00b', insignia: '(n00b)', role: null},
    {index: 1, title: 'Recruit', insignia: '●', role: 'Grunt'},
    {index: 2, title: 'Corporal', insignia: '●●', role: 'Grunt'},
    {index: 3, title: 'Sergeant', insignia: '●●●', role: 'Grunt'},
    {index: 4, title: 'Lieutenant', insignia: '●', role: 'Officer'},
    {index: 5, title: 'Captain', insignia: '●●', role: 'Officer'},
    {index: 6, title: 'Major', insignia: '●●●', role: 'Officer'},
    {index: 7, title: 'Colonel', insignia: '●●●●', role: 'Officer'},
    {index: 8, title: 'General', insignia: '★', role: 'General'},
    {index: 9, title: 'General', insignia: '★★', role: 'General'},
    {index: 10, title: 'General', insignia: '★★★', role: 'General'},
    {index: 11, title: 'General', insignia: '★★★★', role: 'General'},
    {
	index: 12,
	title: 'Mr. Vice President',
	insignia: '⚑',
	role: 'Marshal',
	nicknameOverride: 'Mr. Vice President'
    },
    {
	index: 13,
	title: 'Mr. President',
	insignia: '⚑',
	role: 'Marshal',
	nicknameOverride: 'Mr. President'
    },
];

const rankMetadata = [
    {
	abbreviation: 'Mr.',
	count: 1,
	insignia: '⚑',
	titleOverride: true,
	role: 'Marshal',
	title: 'President',
    },
    {
	abbreviation: 'Mr.',
	count: 1,
	insignia: '⚑',
	titleOverride: true,
	role: 'Marshal',
	title: 'Vice President',
    },
    {
	abbreviation: 'Gen.',
	count: 2,
	insignia: '★★★★',
	role: 'General',
	title: 'General',
    },
    {
	abbreviation: 'Gen.',
	count: 4,
	insignia: '★★★',
	role: 'General',
	title: 'General',
    },
    {
	abbreviation: 'Gen.',
	count: 5,
	insignia: '★★',
	role: 'General',
	title: 'General',
    },
    {
	abbreviation: 'Gen.',
	count: 6,
	insignia: '★',
	role: 'General',
	title: 'General',
    },
    {
	abbreviation: 'Col.',
	count: 7,
	insignia: '●●●●',
	role: 'Officer',
	title: 'Colonel',
    },
    {
	abbreviation: 'Maj.',
	count: 9,
	insignia: '●●●',
	role: 'Officer',
	title: 'Major',
    },
    {
	abbreviation: 'Capt.',
	count: 11,
	insignia: '●●',
	role: 'Officer',
	title: 'Captain',
    },
    {
	abbreviation: 'Lt.',
	count: 13,
	insignia: '●',
	role: 'Officer',
	title: 'Lieutenant',
    },
    {
	abbreviation: 'Sgt.',
	count: 15,
	insignia: '●●●',
	role: 'Grunt',
	title: 'Sergeant',
    },
    {
	abbreviation: 'Cpl.',
	count: 17,
	insignia: '●●',
	role: 'Grunt',
	title: 'Corporal',
    },
    {
	abbreviation: 'Pvt.',
	count: 999,
	insignia: '●',
	role: 'Grunt',
	title: 'Private',
    },
];

// Return the commissar user record with the highest participation score
// from among the given canidates.
function GetUserWithHighestParticipationScore(candidates) {
    let maxScore;
    let maxUserRecord;
    Object.keys(candidates).forEach((id) => {
	const cu = candidates[id];
	if (!cu || !cu.participation_score) {
	    return;
	}
	if (!maxScore || cu.participation_score > maxScore) {
	    maxScore = cu.participation_score;
	    maxUserRecord = cu;
	}
    });
    return maxUserRecord;
}

// Remove a value from an array by value.
// Modifies the original array in-place and also returns it.
// Only removes the first occurrence of the value.
function RemoveByValue(arr, valueToRemove) {
    const index = arr.indexOf(valueToRemove);
    if (index !== -1) {
	arr.splice(index, 1);
    }
    return arr;
}

// Convert a flat list of relationship records into a matrix format
// keyed for efficient access by user ID.
//
// Pairs of candidates that have no recorded relationship are
// assigned a fraction of a second of credit depending on the
// closeness of their user IDs. This is done for symmetry-breaking
// and stability reasons. New or inactive users will attach to
// users who originally joined around the same time they did.
function ConvertRelationshipsToTimeMatrix(relationships, candidates) {
    const matrix = {};
    // First initialize every element of the matrix with a very small
    // subsidy for stability & symmetry-breaking.
    candidates.forEach((i) => {
	const row = {};
	candidates.forEach((j) => {
	    // The matrix is symmetric so only process the entries where i < j.
	    if (i >= j) {
		return;
	    }
	    // The maximum number of imaginary seconds that could
	    // theoretically be handed out by this formula. The
	    // subsidy is tiny, just enough to break the symmetries.
	    const maxSubsidy = 0.01;
	    // How close together are the two user IDs. This is a rough
	    // proxy for finding users that joined around the same date.
	    const howCloseTogether = 1 / (j - i);
	    // How senior is the most senior of the two users. This
	    // breaks the symmetry that would otherwise exist between
	    // different pairs of users whose IDs are separated by the
	    // same amount. The system will favor relationships between
	    // older users to ones between newer users.
	    const howSenior = Math.exp(-0.0000007 * i - 0.00000011 * j);
	    row[j] = maxSubsidy * howCloseTogether * howSenior;
	});
	if (Object.keys(row).length > 0) {
	    matrix[i] = row;
	}
    });
    // Overwrite the small subsidies with real data.
    relationships.forEach((r) => {
	if (candidates.includes(r.lo_user_id) && candidates.includes(r.hi_user_id)) {
	    matrix[r.lo_user_id][r.hi_user_id] = r.discounted_diluted_seconds;
	}
    });
    return matrix;
}

// Return a list of all this user's superiors' IDs, including their own.
function GetSuperiorIDs(userID, chain) {
    if (!userID) {
	return [];
    }
    const bossID = chain[userID].boss;
    const ids = GetSuperiorIDs(bossID, chain);
    ids.push(userID);
    return ids;
}

// Find the best match between a boss and a candidate.
//
// The matchmaker! This algorithm chooses everyone's boss.
// Chooses the boss and candidate with the maximum total
// time spent between the candidate and their new boss,
// the boss' boss, and so on up the chain. Maximizes the
// time spent between the candidate and the boss' entire
// "chain of command". Imagine that the whole chain of
// command gets a vote on who to choose next in line, not
// just the immediate boss.
//
// bosses - a list of objects with details of the bosses.
// candidates - a flat list of integer IDs.
// timeMatrix - a matrix of the time spent between each
//              pair of players.
// chain - the chain of command so far.
// maxChildren - ignore bosses with too many children.
//
// Returns the best match as an object like:
//   { bossID: 6, minionID: 7 }
function SelectBestMatch(bosses, candidates, timeMatrix, chain, maxChildren) {
    let hiScore;
    let bossID;
    let minionID;
    bosses.forEach((boss) => {
	if (boss.children && boss.children.length >= maxChildren) {
	    return;
	}
	const chainOfCommandIDs = GetSuperiorIDs(boss.id, chain);
	candidates.forEach((candID) => {
	    let score = 0;
	    chainOfCommandIDs.forEach((b) => {
		const lo = b < candID ? b : candID;
		const hi = b < candID ? candID : b;
		score += timeMatrix[lo][hi];
	    });
	    if (!hiScore || score > hiScore) {
		hiScore = score;
		bossID = boss.id;
		minionID = candID;
	    }
	});
    });
    return {
	bossID,
	minionID,
    };
}

// Calculate a maximum children limit for the bosses.
//
// This function's job is to stop the highest ranking bosses
// from filling up on all the minions, leaving none to the
// lower ranking bosses. It makes sure that the minions start
// spreading out to more bosses before they run critically
// short in supply.
function LimitMaxChildren(numMinionsLeftToChoose, bosses) {
    if (bosses.length <= 0) {
	return 0;
    }
    // Tally up a histogram of bosses by number of children.
    const histogram = {};
    bosses.forEach((boss) => {
	const numChildren = boss.children ? boss.children.length : 0;
	histogram[numChildren] = (histogram[numChildren] || 0) + 1;
    });
    // Fill the bosses from least children to most, stopping when there
    // are no minions left to choose. This is not really how the
    // selection process works - it's just how we calculate the max
    // number of children that the "fullest" boss should have.
    let cumulative = 0;
    let n = 0;
    while (numMinionsLeftToChoose > 0) {
	cumulative += histogram[n] || 0;
	numMinionsLeftToChoose -= cumulative;
	++n;
    }
    return n;
}

// Calculate chain of command.
//
//   - presidentID: the Commissar ID of the chosen President to head
//                  the chain of command.
//   - candidates: a list of integer user IDs to include in the ranking.
//   - relationships: a list of relationship records. Each record
//                    represents a relationship between a pair of
//                    people. Fields:
//                      - lo_user_id, hi_user_id: integer Commissar IDs
//                      - discounted_diluted_seconds: float (sec)
//
// Returns a dict of dicts representing the calculated chain of command.
// The outer dict is keyed by integer user ID. The inner records have
// these fields:
//   - id: integer Commissar ID.
//   - boss: integer Commissar ID of boss. undefined for Mr. President
//           to indicate that Mr. President has no boss.
//   - children: list of Commmisar IDs of direct children.
//   - rank: integer depth in the tree = rank assigned. Lower number
//           means higher rank.
//
// This function is pure ranking logic, with no connection to database
// calls or other external dependencies. It is unit-testable offline.
function CalculateChainOfCommand(presidentID, candidates, relationships) {
    if (!candidates.includes(presidentID)) {
	throw new Error('Invalid Presidential candidate.');
    }
    const timeMatrix = ConvertRelationshipsToTimeMatrix(relationships, candidates);
    const chain = {};
    candidates.forEach((id) => {
	chain[id] = { id };
    });
    // Mr. President is the first boss.
    const mrPresident = chain[presidentID];
    mrPresident.rank = 0;
    RemoveByValue(candidates, presidentID);
    // Fill the ranks from top to bottom, choosing minions one by one.
    // When the minion rank fills up, the minions become the new bosses.
    // Then the selection process continues, filling up the next rank.
    let bosses = [mrPresident];
    let minions = [];
    let minionRank = 1;
    while (candidates.length > 0) {
	// Choose the next minion to add to the Chain of Command.
	const numMinionsLeftToChoose = Math.min(
	    rankMetadata[minionRank].count - minions.length,
	    candidates.length);
	const maxChildren = LimitMaxChildren(numMinionsLeftToChoose, bosses);
	const pair = SelectBestMatch(bosses, candidates, timeMatrix, chain, maxChildren);
	const boss = chain[pair.bossID];
	const minion = chain[pair.minionID];
	minion.rank = minionRank;
	minions.push(minion);
	RemoveByValue(candidates, minion.id);
	// Associate the new minion with their chosen boss.
	minion.boss = boss.id;
	if (!boss.children) {
	    boss.children = [];
	}
	boss.children.push(minion.id);
	boss.children.sort();
	// If the minion rank has been filled, then the minions become the new bosses.
	if (minions.length >= rankMetadata[minionRank].count) {
	    bosses = minions;
	    minions = [];
	    minionRank += 1;
	    if (minionRank >= rankMetadata.length) {
		throw new Error('Not enough ranks for everyone! ' +
				'Add more space in the rank structure.');
	    }
	}
    }
    return chain;
}

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

// Get all subordinates of the user, including the user themselves, as a flat list.
function GetSubordinates(chain, userID) {
    const user = chain[userID];
    let subordinates = [user];
    const children = user.children || [];
    children.forEach((childID) => {
	const childSubordinates = GetSubordinates(chain, childID);
	subordinates = subordinates.concat(childSubordinates);
    });
    return subordinates;
}

// Calculate the largest size of a squad headed by a Lieutenant.
function MaxSquadSize(chain) {
    let biggest = 0;
    Object.values(chain).forEach((user) => {
	const lieutenant = 9;
	if (user.rank === lieutenant) {
	    const squad = GetSubordinates(chain, user.id);
	    biggest = Math.max(squad.length, biggest);
	}
    });
    return biggest;
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
    const lineHeight = 32;
    const edgeMargin = 16;
    const darkGrey = '#32353b';
    const lightGrey = '#a2a5aa';
    const numCols = CountColumns(chain);
    const colWidth = (width - 2 * edgeMargin) / numCols;
    const numRows = MaxSquadSize(chain);
    const totalTextHeight = lineHeight * (numRows + 9);
    const totalLinkHeight = height - totalTextHeight - 2 * edgeMargin;
    const linkHeight = totalLinkHeight / 9;
    const canvas = new Canvas.createCanvas(width, height, 'png');
    const context = canvas.getContext('2d');
    context.fillStyle = darkGrey;
    context.fillRect(0, 0, width, height);

    // Draws one username at a centered x, y coordinate.
    function DrawName(user, x, y, maxWidth) {
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
	const rank = rankMetadata[user.rank];
	context.fillStyle = colors[rank.role] || lightGrey;
	let name = user.id;
	if (user.id in nicknames) {
	    name = nicknames[user.id];
	}
	if (rank.titleOverride) {
	    name = `${rank.abbreviation} ${rank.title}`;
	}
	const formattedName = `${name} ${rank.insignia}`;
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
	const x = ConsumeColumn();
	let y = edgeMargin + 9 * (lineHeight + linkHeight) + lineHeight / 2;
	squad.forEach((member) => {
	    DrawName(member, x, y, colWidth);
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
    function DrawTree(userID) {
	const user = chain[userID];
	if (user.rank >= 9) {
	    // User is Lieutenant or below. Draw squad as flat list.
	    const squad = GetSubordinates(chain, user.id);
	    const x = DrawSquad(squad, currentColumn);
	    return { hi: x, lo: x, width: colWidth, x };
	}
	// User is high ranking. Draw as part of the tree.
	let hi, lo, hix, lox;
	const children = user.children || [];
	const linkY = edgeMargin + user.rank * (lineHeight + linkHeight) + lineHeight + linkHeight / 2;
	let totalWidth = 0;
	children.forEach((childID) => {
	    const child = DrawTree(childID);
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
	    DrawLink(child.x, linkY, child.x, linkY + linkHeight / 2);
	});
	// Horizontal line segment that links all the children.
	DrawLink(lox, linkY, hix, linkY);
	let x;
	if (children.length > 0) {
	    x = (hi + lo) / 2;
	} else {
	    x = ConsumeColumn();
	}
	// Vertical line segment under the user's name.
	DrawLink(x, linkY, x, linkY - linkHeight / 2);
	const y = edgeMargin + user.rank * (lineHeight + linkHeight) + lineHeight / 2;
	DrawName(user, x, y, totalWidth);
	return { hi, lo, width: totalWidth, x }
    }

    const mrPresidentID = FindMrPresidentInChainOfCommand(chain);
    DrawTree(mrPresidentID);
    return canvas;
}

module.exports = {
    CalculateChainOfCommand,
    ConvertRelationshipsToTimeMatrix,
    GenerateIdealRanksSorted,
    GetSubordinates,
    GetSuperiorIDs,
    LimitMaxChildren,
    metadata,
    RemoveByValue,
    RenderChainOfCommand,
    SelectBestMatch,
};
