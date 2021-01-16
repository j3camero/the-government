const CommissarUser = require('./commissar-user');
const FilterUsername = require('./filter-username');
const moment = require('moment');
const rankModule = require('./rank');

// Below is a cache of the users that is kept in-memory, keyed by commissar_id.
// Various functions are provided to load and sync users, and search the cache.
let commissarUserCache = {};

// Read all the users from the database, then swap the cache.
// Calls the provided callback on success.
function LoadAllUsersFromDatabase(connection, callback) {
    connection.query('SELECT * FROM users', (err, result) => {
	if (err) {
	    throw err;
	}
	const newCache = {};
	result.forEach((row) => {
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
	if (callback) {
	    callback();
	}
    });
}

// Write only the dirty records to the database.
function WriteDirtyUsersToDatabase(connection) {
    let firstOne = true;
    Object.keys(commissarUserCache).forEach((id) => {
	const u = commissarUserCache[id];
	if (u.dirty) {
	    u.writeToDatabase(connection);
	    if (firstOne) {
		console.log(`Writing dirty users to the DB.`);
		firstOne = false;
	    }
	    console.log(`    * ${u.nickname}`);
	}
    });
}

// Update all the cached users in the database.
function WriteAllUsersToDatabase(connection) {
    console.log(`Writing all users to the DB.`);
    Object.keys(commissarUserCache).forEach((id) => {
	const u = commissarUserCache[id];
	u.writeToDatabase(connection);
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
    Object.keys(commissarUserCache).forEach((commissar_id) => {
	const user = commissarUserCache[commissar_id];
	if (user.discord_id === discord_id) {
	    foundUser = user;
	}
    });
    return foundUser;
}

// Creates a new user in the database. On success, the new user is added to the cache and the callback is called.
function CreateNewDatabaseUser(connection, discordMember, callback) {
    const discord_id = discordMember.user.id;
    const nickname = FilterUsername(discordMember.user.username);
    console.log(`Create a new DB user for ${nickname}`);
    const rank = rankModule.metadata.length - 1;
    const last_seen = moment().format();
    const office = null;
    const fields = {discord_id, nickname, rank, last_seen};
    connection.query('INSERT INTO users SET ?', fields, (err, result) => {
	if (err) {
	    throw err;
	}
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
	if (callback) {
	    callback();
	}
    });
}

// Returns a dictionary of nicknames, keyed by Commissar ID.
function GetAllNicknames() {
    const nicknames = {};
    Object.values(commissarUserCache).forEach((user) => {
	nicknames[user.commissar_id] = user.nickname;
    });
    return nicknames;
}

module.exports = {
    CreateNewDatabaseUser,
    GetAllNicknames,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    LoadAllUsersFromDatabase,
    WriteAllUsersToDatabase,
    WriteDirtyUsersToDatabase,
};
