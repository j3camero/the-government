const { createCanvas } = require('canvas');
const db = require('./database');
const { PermissionFlagsBits } = require('discord.js');
const DiscordUtil = require('./discord-util');
const exile = require('./exile-cache');
const fs = require('fs');
const kruskal = require('kruskal-mst');
const moment = require('moment');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
const Sleep = require('./sleep');
const UserCache = require('./user-cache');

const recentlyActiveSteamIds = {};
let channelPermsModifiedRecently = {};

setInterval(() => {
    // Clear the perms modified flags every few minutes, enabling them
    // to be modified again.
    channelPermsModifiedRecently = {};
}, 9 * 60 * 1000);

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
	if (v.ban_conviction_time && v.ban_pardon_time) {
	    // Exclude banned members from the ranks until they do their time.
	    continue;
	}
	const i = v.steam_id || v.discord_id || v.commissar_id;
	const hc = v.citizen ? v.harmonic_centrality : 0;
	vertices[i] = {
	    commissar_id: v.commissar_id,
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
	if (line.length !== 4) {
	    continue;
	}
	const i = line[0];
	if (!(i in recentlyActiveSteamIds)) {
	    continue;
	}
	const cu = UserCache.GetCachedUserBySteamId(i);
	if (cu) {
	    if (cu.ban_conviction_time && cu.ban_pardon_time) {
		// Exclude known banned users from the graph until they serve their time.
		// This will still let through the steam accounts of non-linked users
		// banned from discord but nothing much can be done about that automatically.
		// The solution in that case is to manually link the person's account for them.
		continue;
	    }
	}
	const activity = parseFloat(line[1]);
	if (!(i in vertices)) {
	    vertices[i] = {};
	}
	vertices[i].in_game_activity = activity;
	vertices[i].steam_id = i;
	vertices[i].vertex_id = i;
	vertices[i].distinct_date_count = parseInt(line[2]);
	vertices[i].distinct_month_count = parseInt(line[3]);
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
    // Helper function that calculates the "new guy" demotion. This
    // stops brand new members from power-leveling too quickly no
    // matter their relationships and activity level.
    function CalculateNewGuyDemotion(distinctDateCount, distinctMonthCount) {
	const d = distinctDateCount || 1;
	const m = distinctMonthCount || 1;
	const newGuyDays = 60;
	const newGuyMonths = 6;
	const intercept = 0.3;
	const slope = 1 - intercept;
	const dayDemotion = Math.min(d / newGuyDays, 1) * slope + intercept;
	const monthDemotion = Math.min(m / newGuyMonths, 1) * slope + intercept;
	const totalDemotion = dayDemotion * monthDemotion;
	return totalDemotion;
    }
    // Calculate final vertex weights as a weighted combination of
    // vertex features from multiple sources.
    for (const i in vertices) {
	const v = vertices[i];
	const hc = v.harmonic_centrality || 0;
	const iga = v.in_game_activity || 0;
	v.cross_platform_activity = 0.8 * hc + 0.2 * iga;
	const newGuyDemotion = CalculateNewGuyDemotion(v.distinct_date_count, v.distinct_month_count);
	const cid = v.commissar_id || 9999999;
	const joinOrderBonus = 3600 / cid;
	v.rank_score = newGuyDemotion * v.cross_platform_activity + joinOrderBonus;
    }
    // Sort the vertices by score.
    const verticesSortedByScore = [];
    for (const i in vertices) {
	const v = vertices[i];
	verticesSortedByScore.push(v);
    }
    verticesSortedByScore.sort((a, b) => {
	if (!a.rank_score && !b.rank_score) {
	    return 0;
	}
	if (!a.rank_score) {
	    return 1;
	}
	if (!b.rank_score) {
	    return -1;
	}
	return b.rank_score - a.rank_score;
    });
    console.log('Top ranked vertex:', verticesSortedByScore[0]);
    // Assign discrete ranks to each player.
    let rank = 0;
    let usersAtRank = 0;
    let rankIndex = 1;
    const recruitRank = RankMetadata.length - 1;
    console.log('verticesSortedByScore.length', verticesSortedByScore.length);
    for (const v of verticesSortedByScore) {
	const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
	if (!cu) {
	    continue;
	}
	if (!cu.citizen) {
	    await cu.setRank(recruitRank);
	    await cu.setRankScore(0);
	    await cu.setRankIndex(9999999);
	    continue;
	}
	while (usersAtRank >= RankMetadata[rank].count) {
	    rank++;
	    usersAtRank = 0;
	}
	// When we run out of ranks, this line defaults to the last/least rank.
	rank = Math.max(0, Math.min(RankMetadata.length - 1, rank));
	// Write the rank to the vertex record.
	v.rank = rank;
	// Do not await the promotion announcement. Fire and forget.
	AnnounceIfPromotion(cu, cu.rank, rank);
	await cu.setRank(rank);
	await cu.setRankScore(v.rank_score);
	await cu.setRankIndex(rankIndex);
	rankIndex++;
	usersAtRank++;
    }
    // Initialize each vertex's friend badges to empty.
    for (const v of verticesSortedByScore) {
	v.badges = {};
    }
    // Make sure the top leaders all have their own leader role and VC. If any
    // are missing, create them.
    console.log('Create and update friend role and rooms for top leaders');
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const allFriendRoles = {};
    for (const v of verticesSortedByScore) {
	const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
	if (!cu) {
	    continue;
	}
	if (cu.rank > 15) {
	    // Higher rank index means a lower rank. 15 is General 1.
	    continue;
	}
	const name = cu.getNicknameOrTitleWithInsignia();
	const rankData = RankMetadata[cu.rank];
	const color = rankData.color;
	if (cu.friend_role_id) {
	    try {
		v.friendRole = await guild.roles.fetch(cu.friend_role_id);
	    } catch (error) {
		console.log('Failed to fetch friend role for', name);
		console.log(error);
		continue;
	    }
	} else {
	    try {
		v.friendRole = await guild.roles.create({ name, color });
		await cu.setFriendRoleId(v.friendRole.id);
	    } catch (error) {
		console.log('Failed to create a friend role for', name);
		console.log(error);
		continue;
	    }
	}
	if (!v.friendRole) {
	    console.log('No valid friend role or failed to create.');
	    continue;
	}
	allFriendRoles[v.friendRole.id] = v.friendRole;
	v.badges[v.friendRole.id] = v.friendRole;
	if (v.friendRole.name !== name) {
	    console.log('Updating role name', v.friendRole.name, 'to', name);
	    await v.friendRole.setName(name);
	}
	const decimalColorCode = Number('0x' + color.replace('#', ''));
	if (v.friendRole.color !== color && v.friendRole.color !== decimalColorCode) {
	    console.log('Updating role color for', v.friendRole.name, 'from', v.friendRole.color, 'to', color);
	    await v.friendRole.setColor(color);
	}
	const connect = PermissionFlagsBits.Connect;
	const view = PermissionFlagsBits.ViewChannel;
	const send = PermissionFlagsBits.SendMessages;
	if (cu.friend_voice_room_id) {
	    try {
		v.friendRoom = await guild.channels.fetch(cu.friend_voice_room_id);
	    } catch (error) {
		console.log('Failed to fetch friend room for', name);
		console.log(error);
		continue;
	    }
	} else {
	    try {
		v.friendRoom = await guild.channels.create({
		    bitrate: 256000,
		    name,
		    permissionOverwrites: [
			{ id: guild.roles.everyone, deny: [connect, send, view] },
			{ id: v.friendRole.id, allow: [connect, send, view] },
			{ id: RoleID.Bots, allow: [connect, send, view] },
		    ],
		    type: 2,
		    userLimit: 99,
		});
		await cu.setFriendVoiceRoomId(v.friendRoom.id);
	    } catch (error) {
		console.log('Failed to create friend room for', name);
		console.log(error);
		continue;
	    }
	}
	if (!v.friendRoom) {
	    console.log('No valid friend room or failed to create.');
	    continue;
	}
	if (v.friendRoom.name !== name) {
	    console.log('Updating room name', v.friendRoom.name, 'to', name);
	    await v.friendRoom.setName(name);
	}
	// Hide room from most members while empty.
	if (!(v.friendRoom.id in channelPermsModifiedRecently)) {
	    if (v.friendRoom.members.size === 0) {
		if (v.friendRoom.permissionOverwrites.cache.has(RoleID.Grunt)) {
		    console.log('Hide room', v.friendRoom.name);
		    channelPermsModifiedRecently[v.friendRoom.id] = true;
		    await v.friendRoom.permissionOverwrites.set([
			{ id: guild.roles.everyone, deny: [connect, view] },
			{ id: v.friendRole.id, allow: [connect, view] },
			{ id: RoleID.Bots, allow: [connect, view] },
		    ]);
		}
	    } else {
		if (!v.friendRoom.permissionOverwrites.cache.has(RoleID.Grunt)) {
		    console.log('Reveal room', v.friendRoom.name);
		    channelPermsModifiedRecently[v.friendRoom.id] = true;
		    await v.friendRoom.permissionOverwrites.set([
			{ id: guild.roles.everyone, deny: [connect, view] },
			{ id: RoleID.Grunt, allow: [view] },
			{ id: RoleID.Officer, allow: [view] },
			{ id: RoleID.General, allow: [view] },
			{ id: RoleID.Commander, allow: [view] },
			{ id: v.friendRole.id, allow: [connect, view] },
			{ id: RoleID.Bots, allow: [connect, view] },
		    ]);
		}
	    }
	}
    }
    // Decide which people are friends with which others.
    console.log('Traversing edges to detect friends');
    let edgeCount = 0;
    let friendCount = 0;
    for (const i in edges) {
	for (const j in edges[i]) {
	    edgeCount++;
	    const e = edges[i][j];
	    const d = e.discord_coplay_time || 0;
	    const r = e.rust_coplay_time || 0;
	    const t = 0.04 * d + r;
	    if (t > 300) {
		friendCount++;
		const a = vertices[i];
		const b = vertices[j];
		if (b.friendRole) {
		    a.badges[b.friendRole.id] = b.friendRole;
		}
		if (a.friendRole) {
		    b.badges[a.friendRole.id] = a.friendRole;
		}
	    }
	}
    }
    console.log(edgeCount, 'edges traversed');
    console.log(friendCount, 'friends detected');
    // Enforce exiles by taking away exiled badges.
    const exiles = exile.GetAllExilesAsList();
    for (const ex of exiles) {
	const exiler = UserCache.GetCachedUserByCommissarId(ex.exiler);
	if (!exiler) {
	    continue;
	}
	const exilerVertexId = exiler.getSocialGraphVertexId();
	const exilerVertex = vertices[exilerVertexId];
	const exilee = UserCache.GetCachedUserByCommissarId(ex.exilee);
	if (!exilee) {
	    continue;
	}
	const exileeVertexId = exilee.getSocialGraphVertexId();
	const exileeVertex = vertices[exileeVertexId];
	if (!exileeVertex) {
	    continue;
	}
	if (ex.is_friend) {
	    exileeVertex.badges[exiler.friend_role_id] = exilerVertex.friendRole;
	} else {
	    if (exiler.friend_role_id in exileeVertex.badges) {
		delete exileeVertex.badges[exiler.friend_role_id];
	    }
	}
    }
    // Add and remove friend badges.
    console.log('Adding and removing friend badges');
    for (const v of verticesSortedByScore) {
	const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
	if (!cu) {
	    continue;
	}
	if (!cu.discord_id || !cu.citizen || !cu.good_standing) {
	    continue;
	}
	let discordMember;
	try {
	    discordMember = await guild.members.fetch(cu.discord_id);
	} catch (error) {
	    // Discord member probably left the discord. Ignore.
	    continue;
	}
	const currentRoles = await discordMember.roles.cache;
	const rolesToRemove = {};
	const rolesBefore = {};
	for (const [roleId, role] of currentRoles) {
	    rolesBefore[roleId] = role;
	    if ((roleId in allFriendRoles) && !(roleId in v.badges)) {
		rolesToRemove[roleId] = role;
	    }
	}
	for (const roleId in rolesToRemove) {
	    const badge = rolesToRemove[roleId];
	    console.log('Remove role', badge.name, 'from', discordMember.nickname);
	    await discordMember.roles.remove(badge);
	}
	for (const roleId in v.badges) {
	    if (roleId in rolesBefore) {
		continue;
	    }
	    const badge = v.badges[roleId];
	    console.log('Add role', badge.name, 'to', discordMember.nickname);
	    await discordMember.roles.add(badge);
	}
    }
    // Clean up & destroy any friend roles & rooms of downranked leaders.
    console.log('Clean up disused friend roles and rooms');
    for (const v of verticesSortedByScore) {
	const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
	if (!cu) {
	    continue;
	}
	if (cu.rank <= 15) {
	    // Skip Generals.
	    continue;
	}
	if (cu.friend_role_id) {
	    try {
		const friendRole = await guild.roles.fetch(cu.friend_role_id);
		await friendRole.delete();
		await cu.setFriendRoleId(null);
	    } catch (error) {
		console.log('Failed to delete friend role for', name);
		console.log(error);
		continue;
	    }
	}
	if (cu.friend_voice_room_id) {
	    try {
		const friendRoom = await guild.channels.fetch(cu.friend_voice_room_id);
		await friendRoom.delete();
		await cu.setFriendVoiceRoomId(null);
	    } catch (error) {
		console.log('Failed to delete friend room for', name);
		console.log(error);
		continue;
	    }
	}
    }
}

// A temporary in-memory cache of the highest rank seen per user.
// This is used to avoid spamming promotion notices if a user's
// rank oscilates up and down rapidly.
let maxRankByCommissarId = {};

// Clear the recent max rank cache every few hours.
setInterval(() => {
    console.log('Clearing maxRankByCommissarId');
    maxRankByCommissarId = {};
}, 8 * 60 * 60 * 1000);

// Announce a promotion in #public chat, if applicable.
//
// user - a commissar user.
// newRank - integer rank index of the user's new rank.
async function AnnounceIfPromotion(user, oldRank, newRank) {
    if (!user ||
	user.rank === undefined || user.rank === null ||
	oldRank === undefined || oldRank === null ||
	newRank === undefined || newRank === null ||
	!Number.isInteger(user.rank) ||
	!Number.isInteger(newRank) ||
	!Number.isInteger(oldRank) ||
	newRank >= oldRank) {
	// No promotion detected. Bail.
	return;
    }
    if (!user.last_seen) {
	return;
    }
    const lastSeen = moment(user.last_seen);
    if (moment().subtract(72, 'hours').isAfter(lastSeen)) {
	// No announcements for people who are invactive the last 24 hours.
	return;
    }
    const lowestPossibleRank = RankMetadata.length - 1;
    const maxRecentRank = maxRankByCommissarId[user.commissar_id] || lowestPossibleRank;
    // Lower rank index represents a higher-status rank.
    // If could do it again I would. But that's how it is.
    const newMaxRank = Math.min(newRank, maxRecentRank);
    if (newMaxRank >= maxRecentRank) {
	return;
    }
    maxRankByCommissarId[user.commissar_id] = newMaxRank;
    // If we get past here, a promotion has been detected.
    // Announce it in #public chat.
    const name = user.getNicknameOrTitleWithInsignia();
    const oldMeta = RankMetadata[oldRank];
    const newMeta = RankMetadata[newRank];
    const message = `${name} is promoted from ${oldMeta.title} ${oldMeta.insignia} to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    await DiscordUtil.MessagePublicChatChannel(message);
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

module.exports = {
    CalculateChainOfCommand,
};
