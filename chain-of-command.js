const { createCanvas } = require('canvas');
const db = require('./database');
const fs = require('fs');
const kruskal = require('kruskal-mst');
const moment = require('moment');
const UserCache = require('./user-cache');

const recentlyActiveSteamIds = {};

async function CalculateChainOfCommand() {
    console.log('Chain of command');
    // Load recently active steam IDs from a file.
    ReadSteamAccountsFromFile('recently-active-steam-ids-march-2024.csv');
    // Initialize the social graph made up up vertices (people) and edges (relationships).
    const vertices = {};
    const edges = {};
    // Populate vertex data from discord.
    const discordVertices = UserCache.GetAllUsersAsFlatList();
    let minHC = null;
    let maxHC = null;
    let sumHC = 0;
    for (const v of discordVertices) {
	const activeInGame = v.steam_id in recentlyActiveSteamIds;
	if (!v.last_seen && !activeInGame) {
	    continue;
	}
	const lastSeen = moment(v.last_seen);
	const limit = moment().subtract(90, 'days');
	if (lastSeen.isBefore(limit) && !activeInGame) {
	    continue;
	}
	const i = v.steam_id || v.discord_id || v.commissar_id;
	const hc = v.citizen ? v.harmonic_centrality : 0;
	vertices[i] = {
	    discord_id: v.discord_id,
	    harmonic_centrality: v.harmonic_centrality,
	    steam_id: v.steam_id,
	    vertex_id: i,
	};
	if (minHC === null || v.harmonic_centrality < minHC) {
	    minHC = v.harmonic_centrality;
	}
	if (maxHC === null || v.harmonic_centrality > maxHC) {
	    maxHC = v.harmonic_centrality;
	}
	sumHC += v.harmonic_centrality;
    }
    console.log('Harmonic centrality summary stats');
    console.log('#', discordVertices.length);
    console.log('min', minHC);
    console.log('max', maxHC);
    console.log('sum', sumHC);
    console.log('max%', 100 * maxHC / sumHC, '%');
    console.log('mean', sumHC / discordVertices.length);
    console.log(Object.keys(vertices).length, 'combined vertices');
    // Populate edge data from discord.
    const discordEdges = await db.GetTimeMatrix();
    let minDiscord = null;
    let maxDiscord = null;
    let sumDiscord = 0;
    for (const e of discordEdges) {
	const loUser = UserCache.GetCachedUserByCommissarId(e.lo_user_id);
	const hiUser = UserCache.GetCachedUserByCommissarId(e.hi_user_id);
	const loid = loUser.steam_id || loUser.discord_id || loUser.commissar_id;
	const hiid = hiUser.steam_id || hiUser.discord_id || hiUser.commissar_id;
	const a = loid < hiid ? loid : hiid;
	const b = loid < hiid ? hiid : loid;
	if (!(a in vertices)) {
	    continue;
	}
	if (!(b in vertices)) {
	    continue;
	}
	if (!(a in edges)) {
	    edges[a] = {};
	}
	edges[a][b] = {
	    discord_coplay_time: e.discounted_diluted_seconds,
	};
	if (minDiscord === null || e.discounted_diluted_seconds < minDiscord) {
	    minDiscord = e.discounted_diluted_seconds;
	}
	if (maxDiscord === null || e.discounted_diluted_seconds > maxDiscord) {
	    maxDiscord = e.discounted_diluted_seconds;
	}
	sumDiscord += e.discounted_diluted_seconds;
    }
    console.log('Discord coplay time summary stats');
    console.log('#', discordEdges.length);
    console.log('min', minDiscord);
    console.log('max', maxDiscord);
    console.log('sum', sumDiscord);
    console.log('max%', 100 * maxDiscord / sumDiscord, '%');
    console.log('mean', sumDiscord / discordEdges.length);
    console.log(Object.keys(vertices).length, 'combined vertices');
    // Populate vertex data from Rust.
    let minActivity = null;
    let maxActivity = null;
    let sumActivity = 0;
    const rustVertexLines = ReadLinesFromCsvFile('in-game-activity-points-march-2024.csv');
    for (const line of rustVertexLines) {
	if (line.length !== 2) {
	    continue;
	}
	const i = line[0];
	if (!(i in recentlyActiveSteamIds)) {
	    continue;
	}
	const activity = parseFloat(line[1]);
	if (!(i in vertices)) {
	    vertices[i] = {};
	}
	vertices[i].in_game_activity = activity;
	vertices[i].steam_id = i;
	vertices[i].vertex_id = i;
	if (minActivity === null || activity < minActivity) {
	    minActivity = activity;
	}
	if (maxActivity === null || activity > maxActivity) {
	    maxActivity = activity;
	}
	sumActivity += activity;
    }
    console.log('Rust in-game activity summary stats');
    console.log('#', rustVertexLines.length);
    console.log('min', minActivity);
    console.log('max', maxActivity);
    console.log('sum', sumActivity);
    console.log('max%', 100 * maxActivity / sumActivity, '%');
    console.log('mean', sumActivity / rustVertexLines.length);
    console.log(Object.keys(vertices).length, 'combined vertices');
    // Populate edge data from Rust.
    let minRust = null;
    let maxRust = null;
    let sumRust = 0;
    const rustEdgeLines = ReadLinesFromCsvFile('in-game-relationships-march-2024.csv');
    for (const line of rustEdgeLines) {
	if (line.length !== 3) {
	    continue;
	}
	const i = line[0];
	const j = line[1];
	const t = parseFloat(line[2]);
	const a = i < j ? i : j;
	const b = i < j ? j : i;
	if (!(a in vertices)) {
	    continue;
	}
	if (!(b in vertices)) {
	    continue;
	}
	if (!(a in edges)) {
	    edges[a] = {};
	}
	if (!(b in edges[a])) {
	    edges[a][b] = {};
	}
	edges[a][b].rust_coplay_time = t;
	if (minRust === null || t < minRust) {
	    minRust = t;
	}
	if (maxRust === null || t > maxRust) {
	    maxRust = t;
	}
	sumRust += t;
    }
    console.log('Rust in-game relationships summary stats');
    console.log('#', rustEdgeLines.length);
    console.log('min', minRust);
    console.log('max', maxRust);
    console.log('sum', sumRust);
    console.log('max%', 100 * maxRust / sumRust, '%');
    console.log('mean', sumRust / rustEdgeLines.length);
    console.log(Object.keys(vertices).length, 'combined vertices');
    console.log(Object.keys(edges).length, 'edge buckets');
    // Calculate final vertex weights as a weighted combination of
    // vertex features from multiple sources.
    for (const i in vertices) {
	const v = vertices[i];
	const hc = v.harmonic_centrality || 0;
	const iga = v.in_game_activity || 0;
	v.cross_platform_activity = (0.5 * hc + iga) / 3600;
    }
    // Calculate final edge weights as a weighted combination of
    // edge features from multiple sources.
    const edgesFormattedForKruskal = [];
    for (const i in edges) {
	for (const j in edges[i]) {
	    const e = edges[i][j];
	    const d = e.discord_coplay_time || 0;
	    const r = e.rust_coplay_time || 0;
	    const t = (d + 2 * r) / 3600;
	    e.cross_platform_relationship_strength = t;
	    if (t > 0) {
		e.cross_platform_relationship_distance = 1 / t;
		edgesFormattedForKruskal.push({
		    from: i,
		    to: j,
		    weight: e.cross_platform_relationship_distance,
		});
	    }
	}
    }
    // Calculate Minimum Spanning Tree (MST) of the relationship graph.
    console.log('Calculating MST');
    const forest = kruskal.kruskal(edgesFormattedForKruskal);
    console.log('MST forest has', forest.length, 'edges');
    // Index the edges of the MST by vertex for efficiency.
    for (const edge of forest) {
	const from = vertices[edge.from];
	if (!from.mstEdges) {
	    from.mstEdges = [];
	}
	from.mstEdges.push(edge.to);
	const to = vertices[edge.to];
	if (!to.mstEdges) {
	    to.mstEdges = [];
	}
	to.mstEdges.push(edge.from);
    }
    // Roll up the points starting from edges of the graph.
    const verticesSortedByScore = [];
    while (true) {
	// Each iteration of the loop the first thing to do is find the next vertex to score.
	let next;
	let minScore;
	let remainingVertices = 0;
	for (const i in vertices) {
	    const v = vertices[i];
	    if (v.leadershipScore || v.leadershipScore === 0) {
		continue;
	    }
	    remainingVertices++;
	    const mstEdges = v.mstEdges || [];
	    let scoredNeighbors = 0;
	    let scoreSum = v.cross_platform_activity || 0;
	    for (const j of mstEdges) {
		const u = vertices[j];
		const hasScore = u.leadershipScore || u.leadershipScore === 0;
		if (hasScore) {
		    scoredNeighbors++;
		    scoreSum += u.leadershipScore;
		}
	    }
	    const degree = mstEdges.length;
	    const unscoredNeighbors = degree - scoredNeighbors;
	    if (unscoredNeighbors < 2) {
		if (!next || scoreSum < minScore) {
		    next = v;
		    minScore = scoreSum;
		}
	    }
	}
	if (!next) {
	    // No more nodes left unscored. Terminate the loop.
	    break;
	}
	// If we get here, then a new vertex has been chosen to score next. Calculate each vertex's
	// boss and subordinates, turning the otherwise directionless graph into a top-down tree.
	next.leadershipScore = minScore;
	const displayName = GetDisplayName(next.vertex_id);
	const formattedScore = Math.round(minScore).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	let boss;
	const subordinates = [];
	next.subordinates = [];
	const mstEdges = next.mstEdges || [];
	for (const i of mstEdges) {
	    const v = vertices[i];
	    if (!v.leadershipScore && v.leadershipScore !== 0) {
		boss = v;
	    } else {
		subordinates.push(v);
		next.subordinates.push(i);
	    }
	}
	let bossName = 'NONE';
	if (boss) {
	    bossName = GetDisplayName(boss.vertex_id);
	    next.boss = boss.vertex_id;
	}
	subordinates.sort((a, b) => b.leadershipScore - a.leadershipScore);
	const subNames = [];
	for (const sub of subordinates) {
	    const subName = GetDisplayName(sub.vertex_id);
	    subNames.push(subName);
	}
	const allSubs = subNames.join(' ');
	//console.log('(', remainingVertices, ')', formattedScore, displayName, '( boss:', bossName, ') +', allSubs);
	verticesSortedByScore.push(next);
    }
    // Find any isolated kings and plug them directly into the king of kings. This unites all
    // the disconnected components of the graph into one.
    const n = verticesSortedByScore.length;
    const king = verticesSortedByScore[n - 1];
    for (const v of verticesSortedByScore) {
	if (v.boss) {
	    continue;
	}
	if (v === king) {
	    continue;
	}
	v.boss = king.vertex_id;
	king.subordinates.push(v.vertex_id);
	king.leadershipScore += v.leadershipScore;
    }
    // Sort each node's subordinates.
    for (const v of verticesSortedByScore) {
	v.subordinates.sort((a, b) => {
	    const aScore = vertices[a].leadershipScore;
	    const bScore = vertices[b].leadershipScore;
	    return bScore - aScore;
	});
    }
    // Calculate the descendants of each node.
    for (const v of verticesSortedByScore) {
	v.descendants = [v.vertex_id];
	for (const subId of v.subordinates) {
	    const sub = vertices[subId];
	    v.descendants = v.descendants.concat(sub.descendants);
	}
    }
    // Calculate abbreviated summary tree. Kind of like a compressed version of the real massive
    // tree that is more compact to render and easier to read.
    function RenderTree(howManyTopLeadersToExpand, pixelWidth, pixelHeight, outputImageFilename) {
	for (let i = n - howManyTopLeadersToExpand; i < n; i++) {
	    const v = verticesSortedByScore[i];
	    if (v.subordinates.length > 0) {
		v.expand = true;
	    }
	}
	for (const v of verticesSortedByScore) {
	    const expandedChildren = [];
	    let nonExpandedChildren = [];
	    for (const subId of v.subordinates) {
		const sub = vertices[subId];
		if (sub.expand) {
		    expandedChildren.push(sub.summaryTree);
		} else {
		    // If this node is not expanded then neither are its children.
		    nonExpandedChildren = nonExpandedChildren.concat(sub.descendants);
		}
	    }
	    // Sort the non-expanded children to properly interleave members from different branches in rank order.
	    nonExpandedChildren.sort((a, b) => {
		const aScore = vertices[a].leadershipScore;
		const bScore = vertices[b].leadershipScore;
		return bScore - aScore;
	    });
	    if (expandedChildren.length === 0) {
		if (nonExpandedChildren.length === 0) {
		    v.summaryTree = {
			members: [v.vertex_id],
		    };
		} else {
		    v.summaryTree = {
			members: [v.vertex_id],
			children: [{
			    members: nonExpandedChildren,
			}],
		    };
		}
	    } else {
		if (nonExpandedChildren.length > 0) {
		    expandedChildren.push({
			members: nonExpandedChildren,
		    });
		}
		v.summaryTree = {
		    children: expandedChildren,
		    members: [v.vertex_id],
		};
	    }
	}
	const wholeSummaryTree = king.summaryTree;
	const serializedSummaryTree = JSON.stringify(wholeSummaryTree, null, 2);
	console.log('Summary tree (', serializedSummaryTree.length, 'chars )');
	//console.log(serializedSummaryTree);
	console.log('CountNodesOfTree', CountNodesOfTree(wholeSummaryTree));
	console.log('CountMembersInTree', CountMembersInTree(wholeSummaryTree));
	console.log('CountLeafNodesOfTree', CountLeafNodesOfTree(wholeSummaryTree));
	const maxDepth = MaxDepthOfTree(wholeSummaryTree);
	console.log('MaxDepthOfTree', MaxDepthOfTree(wholeSummaryTree));
	const largeFontSize = 26;
	const smallFontSize = largeFontSize / 2;
	const horizontalMargin = 8;
	const canvas = createCanvas(pixelWidth, pixelHeight);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#313338';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	function DrawTree(tree, leftX, rightX, topY) {
	    const leafNodes = CountLeafNodesOfTree(tree);
	    const horizontalPixelsPerLeafNode = (rightX - leftX) / leafNodes;
	    // Draw members.
	    const centerX = Math.floor((leftX + rightX) / 2) + 0.5;
	    let bottomY = topY;
	    for (let i = 0; i < tree.members.length; i++) {
		const vertexId = tree.members[i];
		const cu = UserCache.TryToFindUserGivenAnyKnownId(vertexId);
		const color = cu ? cu.getRankColor() : '#4285F4';
		const fontSize = tree.children ? largeFontSize : smallFontSize;
		const rowHeight = 2 * fontSize;
		const nameY = topY + (i * rowHeight) + rowHeight / 2;
		const maxColumnWidth = rightX - leftX - horizontalMargin;
		let displayName = GetDisplayName(vertexId).replaceAll('⦁', '•').replaceAll('❱', '›');
		bottomY += rowHeight;
		if (bottomY > canvas.height - 2 * largeFontSize) {
		    const numHidden = tree.members.length - i;
		    if (numHidden > 1) {
			displayName = `+${numHidden} more`;
		    }
		}
		ctx.font = `${fontSize}px Uni Sans Heavy`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = color;
		ctx.fillText(displayName, centerX, nameY, maxColumnWidth);
		if (bottomY > canvas.height - 2 * largeFontSize) {
		    // Reached bottom of the page. Stop drawing names.
		    break;
		}
	    }
	    // Draw children recursively.
	    const childTopY = bottomY + 2 * largeFontSize;
	    const bracketY = Math.floor((bottomY + childTopY) / 2) + 0.5;
	    ctx.strokeStyle = '#D2D5DA';
	    let leafNodesDrawn = 0;
	    let leftBracketX = rightX;
	    let rightBracketX = leftX;
	    const children = tree.children || [];
	    for (const child of children) {
		const childLeafNodes = CountLeafNodesOfTree(child);
		const childLeftX = leftX + leafNodesDrawn * horizontalPixelsPerLeafNode;
		const childRightX = childLeftX + childLeafNodes * horizontalPixelsPerLeafNode;
		const childCenterX = Math.floor((childLeftX + childRightX) / 2) + 0.5;
		leftBracketX = Math.min(leftBracketX, childCenterX);
		rightBracketX = Math.max(rightBracketX, childCenterX);
		// Draw the vertical white line that points down towards the child.
		ctx.beginPath();
		ctx.moveTo(childCenterX, bracketY);
		ctx.lineTo(childCenterX, Math.floor(childTopY - 12) + 0.5);
		ctx.stroke();
		DrawTree(child, childLeftX, childRightX, childTopY);
		leafNodesDrawn += childLeafNodes;
	    }
	    if (tree.children) {
		// Vertical line pointing up at the parent.
		ctx.beginPath();
		ctx.moveTo(centerX, Math.floor(bottomY + 12) + 0.5);
		ctx.lineTo(centerX, bracketY);
		ctx.stroke();
		// Horizontal line. Bracket that joins siblings.
		ctx.beginPath();
		ctx.moveTo(Math.floor(leftBracketX) + 0.5, bracketY);
		ctx.lineTo(Math.floor(rightBracketX) + 0.5, bracketY);
		ctx.stroke();
	    }
	}
	DrawTree(wholeSummaryTree, 0, canvas.width, largeFontSize);
	const out = fs.createWriteStream(__dirname + '/' + outputImageFilename);
	const stream = canvas.createPNGStream();
	stream.pipe(out);
	out.on('finish', () =>  console.log('Wrote', outputImageFilename));
    }
    RenderTree(15, 1920, 1080, 'chain-of-command-general.png');
    RenderTree(50, 7000, 1080, 'chain-of-command-officer.png');
}

// Helper function that reads and parses a CSV file into memory.
// Only use for small files. This function is memory inefficient.
// Returns an array of arrays.
function ReadLinesFromCsvFile(filename) {
    const fileContents = fs.readFileSync(filename).toString();
    const lines = fileContents.split('\n');
    const tokenizedLines = [];
    for (const line of lines) {
	const tokens = line.split(',');
	tokenizedLines.push(tokens);
    }
    return tokenizedLines;
}

// Helper function that reads and parses a CSV file into memory.
// This is only for a particular file that contains steam IDs and
// steam names. The reason why the regular CSV parser is no good
// for this situation is because sometimes steam names contain commas.
// This parser is specialized for the special case of 2 columns with
// ids and names so it is not fooled by commas in steam names.
function ReadSteamAccountsFromFile(filename) {
    const fileContents = fs.readFileSync(filename).toString();
    const lines = fileContents.split('\n');
    for (const line of lines) {
	const commaIndex = line.indexOf(',');
	if (commaIndex < 0) {
	    continue;
	}
	const steamId = line.substring(0, commaIndex);
	const steamName = line.substring(commaIndex + 1);
	recentlyActiveSteamIds[steamId] = steamName;
    }
}

function GetDisplayName(vertexId) {
    let displayName = UserCache.TryToFindDisplayNameForUserGivenAnyKnownId(vertexId);
    if (displayName) {
	// This user is known to commissar. Use their known name.
	return displayName;
    } else {
	// This user is unknown to commissar. They are a rustcult.com user only.
	// Import their name from outside commissar.
	const n = recentlyActiveSteamIds[vertexId] || 'John Doe';
	return `${n} ⦁`;
    }
}

function CountNodesOfTree(t) {
    let nodeCount = 1;
    const children = t.children || [];
    for (const child of children) {
	nodeCount += CountNodesOfTree(child);
    }
    return nodeCount;
}

function CountMembersInTree(t) {
    let memberCount = t.members.length;
    const children = t.children || [];
    for (const child of children) {
	memberCount += CountMembersInTree(child);
    }
    return memberCount;
}

function CountLeafNodesOfTree(t) {
    if (!t.children) {
	return 1;
    }
    let leafCount = 0;
    for (const child of t.children) {
	leafCount += CountLeafNodesOfTree(child);
    }
    return leafCount;
}

function MaxDepthOfTree(t) {
    if (!t.children) {
	return 1;
    }
    let maxDepth = -1;
    for (const child of t.children) {
	const d = MaxDepthOfTree(child);
	maxDepth = Math.max(d + 1, maxDepth);
    }
    return maxDepth;
}

module.exports = {
    CalculateChainOfCommand,
};
