const db = require('./database');
const fs = require('fs');
const kruskal = require('kruskal-mst');
const UserCache = require('./user-cache');

async function CalculateChainOfCommand() {
    console.log('Chain of command');
    // Initialize the social graph made up up vertices (people) and edges (relationships).
    const vertices = {};
    const edges = {};
    // Populate vertex data from discord.
    const discordVertices = UserCache.GetAllUsersAsFlatList();
    let minHC = null;
    let maxHC = null;
    let sumHC = 0;
    for (const v of discordVertices) {
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
	const activity = parseFloat(line[1]);
	if (!(i in vertices)) {
	    vertices[i] = {};
	}
	vertices[i].in_game_activity = activity;
	vertices[i].steam_id = i;
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
	v.cross_platform_activity = hc + iga;
    }
    // Calculate final edge weights as a weighted combination of
    // edge features from multiple sources.
    const edgesFormattedForKruskal = [];
    for (const i in edges) {
	for (const j in edges[i]) {
	    const e = edges[i][j];
	    const d = e.discord_coplay_time || 0;
	    const r = e.rust_coplay_time || 0;
	    const t = d + 2 * r;
	    e.cross_platform_relationship_strength = t / 3600;
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
    while (true) {
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
	next.leadershipScore = minScore;
	let cu;
	cu = UserCache.GetCachedUserByDiscordId(next.discord_id);
	if (!cu) {
	    cu = UserCache.GetCachedUserBySteamId(next.steam_id);
	}
	const displayName = cu ? cu.getNicknameOrTitleWithInsignia() : next.vertex_id || next.steam_id || next.discord_id || 'Unknown Player';
	const formattedScore = Math.round(minScore).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	//console.log(formattedScore, displayName, '(', remainingVertices, 'vertices remaining', ')');
    }
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

module.exports = {
    CalculateChainOfCommand,
};
