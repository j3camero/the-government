const ChainOfCommand = require('./chain-of-command');
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
	    row.rank,
	    row.last_seen,
	    row.office,
	    row.harmonic_centrality,
	    row.peak_rank,
	    row.gender,
	    row.citizen,
	    row.friend_category_id,
	    row.friend_text_chat_id,
	    row.friend_voice_room_id,
	    row.ban_vote_end_time,
	    row.ban_vote_chatroom,
	    row.ban_vote_message,
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
    // Sequential for loop on purpose, so that we can await each item one after the other.
    for (let i = 0; i < userList.length; ++i) {
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
async function GetCachedUserByDiscordId(discord_id) {
    let foundUser = null;
    await ForEach((user) => {
	if (user.discord_id === discord_id) {
	    foundUser = user;
	}
    });
    return foundUser;
}

// Creates a new user in the database. On success, the new user is added to the cache.
async function CreateNewDatabaseUser(discordMember) {
    const discord_id = discordMember.user.id;
    const nickname = FilterUsername(discordMember.user.username);
    console.log(`Create a new DB user for ${nickname}`);
    const rank = ChainOfCommand.metadata.length - 1;
    const last_seen = moment().format();
    const office = null;
    const fields = {discord_id, nickname, rank, last_seen};
    const result = await DB.Query('INSERT INTO users SET ?', fields);
    const commissar_id = result.insertId;
    const newUser = new CommissarUser(
	commissar_id,
	discord_id,
	nickname,
	rank,
	last_seen,
	office
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

// Get the N top users by Harmonic Centrality. Returns a list of pairs:
// [(commissar_id, centrality), ...]
async function GetMostCentralUsers(topN) {
    const flat = [];
    await ForEach(user => flat.push(user));
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

module.exports = {
    BulkCentralityUpdate,
    CreateNewDatabaseUser,
    ForEach,
    GetAllCitizenCommissarIds,
    GetAllNicknames,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetMostCentralUsers,
    LoadAllUsersFromDatabase,
};
