const RankMetadata = require('./rank-definitions');
const CommissarUser = require('./commissar-user');
const DB = require('./database');
const FilterUsername = require('./filter-username');
const fc = require('./friend-cache');
const moment = require('moment');

// Below is a cache of the users that is kept in-memory, keyed by commissar_id.
// Various functions are provided to load and sync users, and search the cache.
let commissarUserCache = {};

// Read all the users from the database, then swap the cache.
async function LoadAllUsersFromDatabase() {
    const results = await DB.Query('SELECT * FROM users');
    const newCache = {};
    results.forEach((row) => {
	const newUser = new CommissarUser(
	    row.commissar_id,
	    row.discord_id,
	    row.nickname,
	    row.nick,
	    row.rank,
	    row.rank_score,
	    row.rank_index,
	    row.last_seen,
	    row.office,
	    row.harmonic_centrality,
	    row.peak_rank,
	    row.gender,
	    row.citizen,
	    row.good_standing,
	    row.friend_role_id,
	    row.friend_category_id,
	    row.friend_text_chat_id,
	    row.friend_voice_room_id,
	    row.ban_vote_start_time,
	    row.ban_vote_chatroom,
	    row.ban_vote_message,
	    row.yen,
	    row.inactivity_tax_paid_until,
	    row.ban_conviction_time,
	    row.ban_pardon_time,
	    row.presidential_election_vote,
	    row.presidential_election_message_id,
	    row.steam_id,
	    row.steam_name,
	    row.steam_name_update_time,
	    row.trump_cards,
	    row.cost_basis,
	    row.calendar_day_count,
	    row.last_calendar_day,
	    row.calendar_month_count,
	    row.last_calendar_month,
	);
	newCache[row.commissar_id] = newUser;
	if (row.friend_role_id) {
	    fc.friendRoleCache[row.friend_role_id] = row.commissar_id;
	}
	if (row.friend_voice_room_id) {
	    fc.friendRoomCache[row.friend_voice_room_id] = row.commissar_id;
	}
    });
    commissarUserCache = newCache;
    const n = Object.keys(commissarUserCache).length;
    console.log(`Loaded ${n} users from the database.`);
}

// Calls a function once for every cached user.
//   - innerFunction: this function is called once for each cached user, like:
//                    innerFunction(user), where user is a CommisarUser object.
//   - userCache (optional): for unit testing. Leave it out in production.
async function ForEach(innerFunction, userCache) {
    if (!userCache) {
	userCache = commissarUserCache;
    }
    const userList = Object.values(userCache);
    const n = userList.length;
    // Sequential for loop on purpose, so that we can await each item one after the other.
    for (let i = n - 1; i >= 0; i--) {
	const user = userList[i];
	await innerFunction(user);
    }
}

// Get a cached user record by Commissar ID.
function GetCachedUserByCommissarId(commissar_id) {
    if (commissar_id in commissarUserCache) {
	return commissarUserCache[commissar_id];
    } else {
	throw `Could not find cached user with commissar_id = ${commissar_id}.`;
    }
}

// Get a cached user record by Discord ID.
function GetCachedUserByDiscordId(discord_id) {
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.discord_id === discord_id) {
	    return user;
	}
    }
    return null;
}

// Get a cached user record by Steam ID.
function GetCachedUserBySteamId(steam_id) {
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.steam_id === steam_id) {
	    return user;
	}
    }
    return null;
}

// Try to find a user given any known ID.
function TryToFindUserGivenAnyKnownId(i) {
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.steam_id === i) {
	    return user;
	}
	if (user.discord_id === i) {
	    return user;
	}
	if (user.commissar_id === i) {
	    return user;
	}
    }
    return null;
}

// Try to find a display name for a user given any known ID.
function TryToFindDisplayNameForUserGivenAnyKnownId(i) {
    const u = TryToFindUserGivenAnyKnownId(i);
    if (u) {
	return u.getNicknameOrTitle();
    } else {
	return null;
    }
}

async function GetOrCreateUserByDiscordId(discordMember) {
    const cu = await GetCachedUserByDiscordId(discordMember.user.id);
    if (cu) {
	return cu;
    }
    return await CreateNewDatabaseUser(discordMember);
}

// Creates a new user in the database. On success, the new user is added to the cache.
async function CreateNewDatabaseUser(discordMember) {
    const discord_id = discordMember.user.id;
    const nickname = FilterUsername(discordMember.user.username);
    console.log(`Create a new DB user for ${nickname}`);
    const rank = RankMetadata.length - 1;
    const rank_score = 0;
    const rank_index = 9999999;
    const last_seen = null;
    const office = null;
    const fields = {discord_id, nickname, rank, last_seen};
    const result = await DB.Query('INSERT INTO users SET ?', fields);
    const commissar_id = result.insertId;
    const newUser = new CommissarUser(
	commissar_id,
	discord_id,
	nickname,
	null,
	rank, rank_score, rank_index,
	last_seen,
	office,
	0, rank, null,
	true, true,
	null, null, null, null,
	null, null, null,
	0,
	null, null, null, null, null,
	null, null, null,
	0, 0,
    );
    commissarUserCache[commissar_id] = newUser;
    return newUser;
}

// Returns a dictionary of nicknames, keyed by Commissar ID.
async function GetAllNicknames() {
    const nicknames = {};
    await ForEach((user) => {
	nicknames[user.commissar_id] = user.getNicknameOrTitleWithInsignia();
    });
    return nicknames;
}

// Get the N top users by Harmonic Centrality.
//
// topN - the number of top most central users to return. Omit this
//        to return all citizens sorted by centrality.
function GetMostCentralUsers(topN) {
    const flat = [];
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.citizen) {
	    flat.push(user);
	}
    }
    flat.sort((a, b) => {
	return b.harmonic_centrality - a.harmonic_centrality;
    });
    return flat.slice(0, topN);
}

// Get the N top users by rank score.
//
// topN - the number of top users to return.
function GetTopRankedUsers(topN) {
    const flat = [];
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.citizen) {
	    flat.push(user);
	}
    }
    flat.sort((a, b) => {
	return b.rank_score - a.rank_score;
    });
    return flat.slice(0, topN);
}

function GetAllUsersAsFlatList() {
    const flat = [];
    for (const i in commissarUserCache) {
	const u = commissarUserCache[i];
	flat.push(u);
    }
    return flat;
}

async function BulkCentralityUpdate(centralityScores) {
    // Sequential for loop used on purpose. This loop awaits each user update
    // in turn.
    for (const commissar_id in centralityScores) {
	if (!commissar_id) {
	    throw 'Nope';
	}
	const centrality = centralityScores[commissar_id];
	const user = GetCachedUserByCommissarId(commissar_id);
	await user.setHarmonicCentrality(centrality);
    }
}

async function GetAllCitizenCommissarIds() {
    const ids = [];
    await ForEach((user) => {
	if (user.citizen) {
	    ids.push(user.commissar_id);
	}
    });
    return ids;
}

function GetCachedUserByBanVoteMessageId(messageId) {
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.ban_vote_message === messageId) {
	    return user;
	}
    }
    return null;
}

function GetCachedUserByBanVoteChannelId(channelId) {
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (user.ban_vote_chatroom === channelId) {
	    return user;
	}
    }
    return null;
}

function GetUsersSortedByLastSeen(inactivityLimitInDays) {
    const users = [];
    const seconds = 86400 * inactivityLimitInDays;
    const timeCutoff = moment().subtract(seconds, 'seconds');
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	const lastSeen = moment(user.last_seen);
	if (user.citizen && user.good_standing && lastSeen.isAfter(timeCutoff)) {
	    users.push(user);
	}
    }
    users.sort((a, b) => {
	const at = moment(a.last_seen);
	const bt = moment(b.last_seen);
	if (at.isBefore(bt)) {
	    return 1;
	} else if (at.isAfter(bt)) {
	    return -1;
	} else {
	    return 0;
	}
    });
    return users;
}

function CountVoiceActiveUsers(inactivityLimitInDays) {
    let count = 0;
    const timeCutoff = moment().subtract(inactivityLimitInDays, 'days');
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	const lastSeen = moment(user.last_seen);
	if (lastSeen.isAfter(timeCutoff)) {
	    count += 1;
	}
    }
    return count;
}

function GetUsersWithRankAndScoreHigherThan(rankIndex, scoreThreshold) {
    const matches = [];
    for (const [commissarId, user] of Object.entries(commissarUserCache)) {
	if (!user) {
	    continue;
	}
	if (!user.last_seen || !user.good_standing || !user.citizen) {
	    continue;
	}
	if (user.rank !== rankIndex) {
	    continue;
	}
	if (user.harmonic_centrality > scoreThreshold) {
	    matches.push(user);
	}
    }
    return matches;
}

function CountPresidentialElectionVotes() {
    const votes = {};
    for (const i in commissarUserCache) {
	const u = commissarUserCache[i];
	const v = u.presidential_election_vote;
	if (v) {
	    if (!(v in votes)) {
		votes[v] = 0;
	    }
	    votes[v]++;
	}
    }
    return votes;
}

function GetOneSteamConnectedUserWithLeastRecentlyUpdatedSteamName() {
    let chosenUser = null;
    let oldestUpdateTime;
    const keys = Object.keys(commissarUserCache);
    // Crawl users in reverse order to update most recent joiners by default.
    keys.reverse();
    for (const i of keys) {
	const u = commissarUserCache[i];
	if (!u.steam_id) {
	    continue;
	}
	if (!u.steam_name_update_time) {
	    return u;
	}
	const t = moment(u.steam_name_update_time);
	if (!oldestUpdateTime || t.isBefore(oldestUpdateTime)) {
	    oldestUpdateTime = t;
	    chosenUser = u;
	}
    }
    return chosenUser;
}

function GetAllBannedUsers() {
    const flat = [];
    for (const i in commissarUserCache) {
	const u = commissarUserCache[i];
	if (u.ban_conviction_time && u.ban_pardon_time) {
	    flat.push(u);
	}
    }
    return flat;
}

module.exports = {
    BulkCentralityUpdate,
    CountVoiceActiveUsers,
    CreateNewDatabaseUser,
    ForEach,
    GetAllBannedUsers,
    GetAllCitizenCommissarIds,
    GetAllNicknames,
    GetAllUsersAsFlatList,
    GetCachedUserByBanVoteChannelId,
    GetCachedUserByBanVoteMessageId,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetCachedUserBySteamId,
    GetOneSteamConnectedUserWithLeastRecentlyUpdatedSteamName,
    GetMostCentralUsers,
    GetOrCreateUserByDiscordId,
    GetTopRankedUsers,
    GetUsersSortedByLastSeen,
    GetUsersWithRankAndScoreHigherThan,
    LoadAllUsersFromDatabase,
    TryToFindDisplayNameForUserGivenAnyKnownId,
    TryToFindUserGivenAnyKnownId,
};
