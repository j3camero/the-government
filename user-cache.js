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
		row.office
	    );
	newCache[row.commissar_id] = newUser;
    });
    commissarUserCache = newCache;
}

// Calls a function once for every cached user.
//   - innerFunction: this function is called once for each cached user, like:
//                    innerFunction(user), where user is a CommisarUser object.
//   - userCache (optional): for unit testing. Leave it out in production.
function ForEach(innerFunction, userCache) {
    if (!userCache) {
	userCache = commissarUserCache;
    }
    Object.values(userCache).forEach((user) => {
	innerFunction(user);
    });
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
    let foundUser = null;
    ForEach((user) => {
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
function GetAllNicknames() {
    const nicknames = {};
    ForEach((user) => {
	nicknames[user.commissar_id] = user.nickname;
    });
    return nicknames;
}

// Get the N top users by Harmonic Centrality. Returns a list of pairs:
// [(commissar_id, centrality), ...]
function GetMostCentralUsers(topN) {
    const flat = [];
    ForEach(user => flat.push({
	commissar_id: user.commissar_id,
	centrality: user.harmonic_centrality || 0,
    }));
    flat.sort((a, b) => {
	return b.centrality - a.centrality;
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

module.exports = {
    BulkCentralityUpdate,
    CreateNewDatabaseUser,
    ForEach,
    GetAllNicknames,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetMostCentralUsers,
    LoadAllUsersFromDatabase,
};
