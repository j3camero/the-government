// This class represents a member of the clan.

class CommissarUser {
    constructor(commissar_id, discord_id, steam_id, nickname, rank, participation_score, participation_update_date, rank_limit, rank_limit_cooldown) {
	this.commissar_id = commissar_id;
	this.discord_id = discord_id;
	this.steam_id = steam_id;
	this.nickname = nickname;
	this.rank = rank;
	this.participation_score = participation_score;
	this.participation_update_date = participation_update_date;
	this.rank_limit = rank_limit;
	this.rank_limit_cooldown = rank_limit_cooldown;
	// Dirty flag indicates that this record has changed and needs to be backed up to the database.
	this.dirty = false;
    }

    setDiscordId(discord_id) {
	this.discord_id = discord_id;
	this.dirty = true;
    }

    setSteamId(steam_id) {
	this.steam_id = steam_id;
	this.dirty = true;
    }

    setNickname(nickname) {
	this.nickname = nickname;
	this.dirty = true;
    }

    setRank(rank) {
	this.rank = rank;
	this.dirty = true;
    }

    setParticipationScore(participation_score) {
	this.participation_score = participation_score;
	this.dirty = true;
    }

    setParticipationUpdateDate(participation_update_date) {
	this.participation_update_date = participation_update_date;
	this.dirty = true;
    }

    setRankLimit(rank_limit) {
	this.rank_limit = rank_limit;
	this.dirty = true;
    }

    setRankLimitCooldown(rank_limit_cooldown) {
	this.rank_limit_cooldown = rank_limit_cooldown;
	this.dirty = true;
    }

    writeToDatabase(connection) {
	this.dirty = false;
	const sql = 'UPDATE users SET discord_id = ?, steam_id = ?, nickname = ?, rank = ?, participation_score = ?, participation_update_date = ?, rank_limit = ?, rank_limit_cooldown = ? WHERE commissar_id = ?';
	const values = [this.discord_id, this.steam_id, this.nickname, this.rank, this.participation_score, this.participation_update_date, this.rank_limit, this.rank_limit_cooldown, this.commissar_id];
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
    console.log(`Writing dirty users to the DB.`);
    Object.keys(commissarUserCache).forEach((id) => {
	const u = commissarUserCache[id];
	if (u.dirty) {
	    console.log(`    * ${u.nickname}`);
	    u.writeToDatabase(connection);
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
function CreateNewDatabaseUser(connection, discord_id, steam_id, nickname, rank, participation_score, participation_update_date, rank_limit, rank_limit_cooldown, callback) {
    console.log(`Create a new DB user for ${nickname}`);
    const fields = {discord_id, steam_id, nickname, rank, participation_score, participation_update_date, rank_limit, rank_limit_cooldown};
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

module.exports = {
    CommissarUser,
    CreateNewDatabaseUser,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    LoadAllUsersFromDatabase,
    WriteAllUsersToDatabase,
    WriteDirtyUsersToDatabase,
};
