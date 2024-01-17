const RankMetadata = require('./rank-definitions');
const CommissarUser = require('./commissar-user');
const DB = require('./database');
const FilterUsername = require('./filter-username');
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
	    row.last_seen,
	    row.office,
	    row.harmonic_centrality,
	    row.peak_rank,
	    row.gender,
	    row.citizen,
	    row.good_standing,
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
	);
	newCache[row.commissar_id] = newUser;
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
    const last_seen = moment().format();
    const office = null;
    const fields = {discord_id, nickname, rank, last_seen};
    const result = await DB.Query('INSERT INTO users SET ?', fields);
    const commissar_id = result.insertId;
    const newUser = new CommissarUser(
	commissar_id,
	discord_id,
	nickname,
	null,
	rank,
	last_seen,
	office,
	0, 12, null,
	true, true,
	null, null, null,
	null, null, null,
	0,
	null, null, null, null, null,
	null,
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
//
// Returns a list of pairs:
//   [(commissar_id, centrality), ...]
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

module.exports = {
    BulkCentralityUpdate,
    CountVoiceActiveUsers,
    CreateNewDatabaseUser,
    ForEach,
    GetAllCitizenCommissarIds,
    GetAllNicknames,
    GetCachedUserByBanVoteChannelId,
    GetCachedUserByBanVoteMessageId,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetMostCentralUsers,
    GetOrCreateUserByDiscordId,
    GetUsersSortedByLastSeen,
    GetUsersWithRankAndScoreHigherThan,
    LoadAllUsersFromDatabase,
};
