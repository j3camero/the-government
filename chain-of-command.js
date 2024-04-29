const { createCanvas } = require('canvas');
const db = require('./database');
const { PermissionFlagsBits } = require('discord.js');
const DiscordUtil = require('./discord-util');
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
	const newGuyDays = 45;
	const newGuyMonths = 6;
	const intercept = 0.2;
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
	const newGuyDemotion = CalculateNewGuyDemotion(v.distinct_date_count, v.distinct_month_count);
	v.cross_platform_activity = newGuyDemotion * (0.8 * hc + 0.2 * iga) / 3600;
    }
    // Calculate final edge weights as a weighted combination of
    // edge features from multiple sources.
    const relationshipsToPrint = {
	'76561198294876014': 'BBQ',
	'76561198355439651': 'KEY',
	'76561198956010410': 'JIB',
    };
    const edgesFormattedForKruskal = [];
    for (const i in edges) {
	for (const j in edges[i]) {
	    const e = edges[i][j];
	    const d = e.discord_coplay_time || 0;
	    const r = e.rust_coplay_time || 0;
	    const a = vertices[i];
	    const b = vertices[j];
	    const iDemotion = CalculateNewGuyDemotion(a.distinct_date_count, a.distinct_month_count);
	    const jDemotion = CalculateNewGuyDemotion(b.distinct_date_count, b.distinct_month_count);
	    const edgeDemotion = iDemotion * jDemotion;
	    const t = edgeDemotion * (0.2 * d + r) / 3600;
	    if ((i in relationshipsToPrint) && (j in relationshipsToPrint)) {
		const iName = relationshipsToPrint[i];
		const jName = relationshipsToPrint[j];
		console.log(iName, jName, t);
	    }
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
	const formattedScore = Math.round(minScore).toString();  // To put commas in formatted score .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
	//console.log(formattedScore + ',' + displayName);
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
    // Print out the king's score.
    console.log('Top leadership score:', Math.round(king.leadershipScore));
    // Calculate 2nd in command's score as a percentage of the king's score.
    // This measures the stability of the tree. How close is the top leader to changing?
    const second = verticesSortedByScore[n - 2];
    const overthrowProgress = second.leadershipScore / (king.leadershipScore - second.leadershipScore);
    const regimeStability = 1 - overthrowProgress;
    const overthrowP = Math.round(100 * overthrowProgress);
    const regimeP = Math.round(100 * regimeStability);
    let stabilityMessage;
    if (regimeStability > 0.7) {
	stabilityMessage = 'Rock Solid';
    } else if (regimeStability > 0.5) {
	stabilityMessage = 'Highly Stable';
    } else if (regimeStability > 0.3) {
	stabilityMessage = 'Stable';
    } else if (regimeStability > 0.1) {
	stabilityMessage = 'Not Stable';
    } else {
	stabilityMessage = 'Regime Change Imminent';
    }
    const kingName = UserCache.TryToFindUserGivenAnyKnownId(king.vertex_id).getRankNameAndInsignia();
    const secondName = UserCache.TryToFindUserGivenAnyKnownId(second.vertex_id).getRankNameAndInsignia();
    console.log(secondName, 'progress towards overthrowing', kingName, overthrowP, '%');
    console.log('Regime stability', regimeP, '%', stabilityMessage);
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
    // Helper function to look up what rank someone should be by their score.
    function ScoreToRank(score) {
	for (let i = 0; i < RankMetadata.length; i++) {
	    const r = RankMetadata[i];
	    if (!r.minScore) {
		continue;
	    }
	    if (score > r.minScore) {
		return i;
	    }
	}
	// Default to the most junior rank just to be safe.
	return RankMetadata.length - 1;
    }
    // Assign discrete ranks to each player.
    for (const v of verticesSortedByScore) {
	v.rank = ScoreToRank(v.leadershipScore);
	const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
	if (cu) {
	    // Do not await the promotion announcement. Fire and forget.
	    await AnnounceIfPromotion(cu, cu.rank, v.rank);
	    await cu.setRank(v.rank);
	}
    }
    // Assign the bottom rank to any known users that do not appear in the tree.
    await UserCache.ForEach(async (user) => {
	if (user.steam_id in vertices) {
	    return;
	}
	if (user.discord_id in vertices) {
	    return;
	}
	if (user.commissar_id in vertices) {
	    return;
	}
	await user.setRank(RankMetadata.length - 1);
    });
    // Initialize each vertex's friend badges to empty.
    for (const v of verticesSortedByScore) {
	v.badges = {};
    }
    // Make sure the top leaders all have their own leader role and VC. If any
    // are missing, create them.
    console.log('Create and update friend role and rooms for top leaders');
    const numTopLeadersToMaintainVoiceRoomsFor = 17;
    const k = numTopLeadersToMaintainVoiceRoomsFor;
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
		    bitrate: 384000,
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
    // Give friend badge to all descendants of eligible leaders.
    let totalDescendantBadgeCount = 0;
    for (const v of verticesSortedByScore) {
	// For every vertex, iterate up the chain of command to find all
	// this player's bosses up to but not including the very top leader.
	let b = v;
	while (b.boss) {
	    if (b.friendRole) {
		// Players get badges from their bosses of high enough
		// rank going all the way up the chain of command but for
		// the very top leader.
		v.badges[b.friendRole.id] = b.friendRole;
		totalDescendantBadgeCount++;
	    }
	    b = vertices[b.boss];
	}
    }
    console.log(totalDescendantBadgeCount, 'total descendant badges issued');
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
	const discordMember = await guild.members.fetch(cu.discord_id);
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
    // Calculate abbreviated summary tree. Kind of like a compressed version of the real massive
    // tree that is more compact to render and easier to read.
    async function RenderSummaryTree(howManyTopLeadersToExpand, pixelHeight, outputImageFilename) {
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
	const leafNodeCount = CountLeafNodesOfTree(wholeSummaryTree);
	console.log('CountLeafNodesOfTree', leafNodeCount);
	const maxDepth = MaxDepthOfTree(wholeSummaryTree);
	console.log('MaxDepthOfTree', MaxDepthOfTree(wholeSummaryTree));
	const fontSize = 18;
	const rowHeight = Math.floor(fontSize * 3 / 2);
	const horizontalMargin = 8;
	const horizontalPixelsPerLeafNode = 140;
	const pixelWidth = leafNodeCount * horizontalPixelsPerLeafNode;
	const canvas = createCanvas(pixelWidth, pixelHeight);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#313338';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	function DrawTree(tree, leftX, rightX, topY) {
	    const leafNodes = CountLeafNodesOfTree(tree);
	    // Draw members.
	    const centerX = Math.floor((leftX + rightX) / 2) + 0.5;
	    let bottomY = topY;
	    for (let i = 0; i < tree.members.length; i++) {
		const vertexId = tree.members[i];
		const v = vertices[vertexId];
		const cu = UserCache.TryToFindUserGivenAnyKnownId(v.vertex_id);
		const rank = v.rank || (RankMetadata.length - 1);
		const rankData = RankMetadata[rank];
		let color = rankData.color || '#4285F4';	
		let insignia = rankData.insignia || '•';
		if (cu) {
		    if (cu.office) {
			color = '#189b17';
			insignia = '⚑';
		    }
		}
		insignia = insignia.replaceAll('⦁', '•').replaceAll('❱', '›')
		const nameY = topY + (i * rowHeight) + rowHeight / 2;
		const maxColumnWidth = rightX - leftX - horizontalMargin;
		let displayName = GetDisplayName(vertexId).replace(/(\r\n|\n|\r)/gm, '');;
		// Try removing characters from end of the display name to make it fit.
		while (true) {
		    const nameAndInsignia = displayName + ' ' + insignia;
		    const textWidth = ctx.measureText(nameAndInsignia).width;
		    if (textWidth < maxColumnWidth) {
			break;
		    } else {
			displayName = displayName.substring(0, displayName.length - 1);
		    }
		}
		if (displayName.length === 0) {
		    displayName = 'John Doe';
		}
		displayName = displayName.trim() + ' ' + insignia;
		bottomY += rowHeight;
		if (bottomY > canvas.height - rowHeight) {
		    const numHidden = tree.members.length - i;
		    if (numHidden > 1) {
			displayName = `+${numHidden} more`;
		    }
		}
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `${fontSize}px Uni Sans Heavy`;
		ctx.fillText(displayName, centerX, nameY, maxColumnWidth);
		if (bottomY > canvas.height - rowHeight) {
		    // Reached bottom of the page. Stop drawing names.
		    break;
		}
	    }
	    // Draw children recursively.
	    let leafNodesDrawn = 0;
	    let leftBracketX = rightX;
	    let rightBracketX = leftX;
	    const children = tree.children || [];
	    let childTopY = bottomY;
	    if (children.length > 1) {
		childTopY += 2 * rowHeight;
	    }
	    const bracketY = Math.floor((bottomY + childTopY) / 2) + 0.5;
	    ctx.strokeStyle = '#D2D5DA';
	    for (const child of children) {
		const childLeafNodes = CountLeafNodesOfTree(child);
		const childLeftX = leftX + leafNodesDrawn * horizontalPixelsPerLeafNode;
		const childRightX = childLeftX + childLeafNodes * horizontalPixelsPerLeafNode;
		const childCenterX = Math.floor((childLeftX + childRightX) / 2) + 0.5;
		leftBracketX = Math.min(leftBracketX, childCenterX);
		rightBracketX = Math.max(rightBracketX, childCenterX);
		// Draw the child sub-trees recursively.
		DrawTree(child, childLeftX, childRightX, childTopY);
		leafNodesDrawn += childLeafNodes;
		// Draw the vertical white line that points down towards the child.
		if (children.length > 1) {
		    ctx.beginPath();
		    ctx.moveTo(childCenterX, bracketY);
		    ctx.lineTo(childCenterX, bracketY + 8 + 0.5);
		    ctx.stroke();
		}
	    }
	    if (children.length > 1) {
		// Vertical line pointing up at the parent.
		ctx.beginPath();
		ctx.moveTo(centerX, bracketY - 8 + 0.5);
		ctx.lineTo(centerX, bracketY);
		ctx.stroke();
		// Horizontal line. Bracket that joins siblings.
		ctx.beginPath();
		ctx.moveTo(Math.floor(leftBracketX) + 0.5, bracketY);
		ctx.lineTo(Math.floor(rightBracketX) + 0.5, bracketY);
		ctx.stroke();
	    }
	}
	DrawTree(wholeSummaryTree, 0, canvas.width, rowHeight);
	const out = fs.createWriteStream(__dirname + '/' + outputImageFilename);
	const stream = canvas.createPNGStream();
	stream.pipe(out);
	// Wait for the image file to finish writing to disk.
	return new Promise((resolve, reject) => {
	    out.on('finish', () => {
		console.log('Wrote', outputImageFilename);
		resolve();
	    });
	});
    }
    await RenderSummaryTree(20, 800, 'chain-of-command-generals.png');
    await RenderSummaryTree(70, 800, 'chain-of-command-officers.png');
    const channel = await guild.channels.fetch('711850971072036946');
    await channel.bulkDelete(99);
    await channel.send({
	content: `**The Government Chain of Command**`,
	files: [{
	    attachment: 'chain-of-command-generals.png',
	    name: 'chain-of-command-generals.png'
	}],
    });
    await channel.send({
	content: `**More Detailed View**`,
	files: [{
	    attachment: 'chain-of-command-officers.png',
	    name: 'chain-of-command-officers.png'
	}],
    });
    await channel.send(
	`**Political Stability**\n` +
        `${secondName} is ${overthrowP}% of the way to overthrowing ${kingName}. ` +
        `The current regime is ${regimeP}% stable (${stabilityMessage}).`
    );
    await channel.send(`**The Algorithm**\nUpdates every 60 seconds. Your rank score = your activity in Discord + your activity in Rust + all your followers activity in Discord + all your followers activity in Rust. The structure comes from your relationships. Who you usually base with, roam with, raid with, and chill with in Discord. To climb the ranks, be a leader. Build a base and bag people in. Lead raids. Pair with https://rustcult.com every month to avoid missing out on your next promotion.`);
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

function GetDisplayName(vertexId) {
    let displayName = UserCache.TryToFindDisplayNameForUserGivenAnyKnownId(vertexId);
    if (displayName) {
	// This user is known to commissar. Use their known name.
	return displayName;
    } else {
	// This user is unknown to commissar. They are a rustcult.com user only.
	// Import their name from outside commissar.
	return recentlyActiveSteamIds[vertexId] || 'John Doe';
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
