const fs = require('fs');
const moment = require('moment');
const rankModule = require('./rank');
const TimeUtil = require('./time-util');

// This class represents a member of the clan.

class CommissarUser {
    constructor(commissar_id, discord_id, steam_id, nickname, rank, last_seen, participation_score, participation_update_date, rank_limit, rank_limit_cooldown) {
	this.commissar_id = commissar_id;
	this.discord_id = discord_id;
	this.steam_id = steam_id;
	this.nickname = nickname;
	this.rank = rank;
	this.last_seen = last_seen;
	this.participation_score = participation_score;
	this.participation_update_date = participation_update_date;
	this.rank_limit = rank_limit;
	this.rank_limit_cooldown = rank_limit_cooldown;
	// Dirty flag indicates that this record has changed and needs to be backed up to the database.
	this.dirty = false;
    }

    setDiscordId(discord_id) {
	if (discord_id !== this.discord_id) {
	    this.dirty = true;
	}
	this.discord_id = discord_id;
    }

    setSteamId(steam_id) {
	if (steam_id !== this.steam_id) {
	    this.dirty = true;
	}
	this.steam_id = steam_id;
    }

    setNickname(nickname) {
	nickname = FilterUsername(nickname);
	if (nickname !== this.nickname) {
	    this.dirty = true;
	}
	this.nickname = nickname;
    }

    setRank(rank) {
	if (rank !== this.rank) {
	    this.dirty = true;
	}
	this.rank = rank;
    }

    seenNow() {
	this.dirty = true;
	this.last_seen = moment().format();
    }

    setParticipationScore(participation_score) {
	if (participation_score !== this.participation_score) {
	    this.dirty = true;
	}
	this.participation_score = participation_score;
    }

    setParticipationUpdateDate(participation_update_date) {
	if (participation_update_date !== this.participation_update_date) {
	    this.dirty = true;
	}
	this.participation_update_date = participation_update_date;
    }

    setRankLimit(rank_limit) {
	if (rank_limit !== this.rank_limit) {
	    this.dirty = true;
	}
	this.rank_limit = rank_limit;
    }

    setRankLimitCooldown(rank_limit_cooldown) {
	if (rank_limit_cooldown !== this.rank_limit_cooldown) {
	    this.dirty = true;
	}
	this.rank_limit_cooldown = rank_limit_cooldown;
    }

    writeToDatabase(connection) {
	this.dirty = false;
	const sql = ('UPDATE users SET discord_id = ?, steam_id = ?, nickname = ?, ' +
		     'rank = ?, last_seen = ?, participation_score = ?, ' +
		     'participation_update_date = ?, rank_limit = ?, ' +
		     'rank_limit_cooldown = ? WHERE commissar_id = ?');
	const values = [
	    this.discord_id, this.steam_id, this.nickname, this.rank, this.last_seen,
	    this.participation_score, this.participation_update_date, this.rank_limit,
	    this.rank_limit_cooldown, this.commissar_id];
	connection.query(sql, values, (err, result) => {
	    if (err) {
		throw err;
	    }
	    if (result.affectedRows !== 1) {
		throw `Updated wrong number of records. Should only update 1 (${result.affectedRows}).`;
	    }
	});
    }
}

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
		row.steam_id,
		row.nickname,
		row.rank,
		row.last_seen,
		row.participation_score,
		row.participation_update_date,
		row.rank_limit,
		row.rank_limit_cooldown
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

// Removes some characters, replaces others.
function FilterUsername(username) {
    const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_` ()!?\'*+/\\:=~èáéíóúüñà';
    const substitutions = {
	'ғ': 'f',
	'ｕ': 'U',
	'ᶜ': 'c',
	'Ќ': 'K',
	'ץ': 'Y',
	'๏': 'o',
	'Ữ': 'u',
	'Ｍ': 'M',
	'Ａ': 'A',
	'ŕ': 'r',
	'Ｋ': 'K',
    };
    let s = '';
    for (let i = 0; i < username.length; i++) {
	const c = username.charAt(i);
	if (allowedChars.indexOf(c) >= 0) {
	    s += c;
	} else if (c in substitutions) {
	    s += substitutions[c];
	}
    }
    const maxNameLength = 18;
    s = s.trim().slice(0, maxNameLength).trim();
    if (s.length === 0) {
	s = '???';
    }
    return s;
}

// Creates a new user in the database. On success, the new user is added to the cache and the callback is called.
function CreateNewDatabaseUser(connection, discordMember, callback) {
    const discord_id = discordMember.user.id;
    const nickname = FilterUsername(discordMember.user.username);
    console.log(`Create a new DB user for ${nickname}`);
    const rank = rankModule.metadata.length - 1;
    const last_seen = moment().format();
    const participation_score = 0;
    const participation_update_date = TimeUtil.YesterdayDateStamp();
    const rank_limit = 1;
    const rank_limit_cooldown = moment().format();
    const steam_id = null;
    const fields = {discord_id, steam_id, nickname, rank, last_seen, participation_score, participation_update_date, rank_limit, rank_limit_cooldown};
    connection.query('INSERT INTO users SET ?', fields, (err, result) => {
	if (err) {
	    throw err;
	}
	const commissar_id = result.insertId;
	const newUser = new CommissarUser(
	    commissar_id,
	    discord_id,
	    steam_id,
	    nickname,
	    rank,
	    last_seen,
	    participation_score,
	    participation_update_date,
	    rank_limit,
	    rank_limit_cooldown
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

function GetUserWithHighestParticipationPoints() {
    let maxPoints;
    let maxUser;
    Object.values(commissarUserCache).forEach((user) => {
	if (!maxPoints || user.participation_score > maxPoints) {
	    maxPoints = user.participation_score;
	    maxUser = user;
	}
    });
    return maxUser;
}

module.exports = {
    CommissarUser,
    CreateNewDatabaseUser,
    GetAllNicknames,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetUserWithHighestParticipationPoints,
    LoadAllUsersFromDatabase,
    WriteAllUsersToDatabase,
    WriteDirtyUsersToDatabase,
};
