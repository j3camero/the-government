const rankModule = require('./rank');

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

// Sort and rank all clan members together. Return a list of promotions to announce.
function UpdateRanks() {
    let candidates = [];
    Object.keys(commissarUserCache).forEach((commissar_id) => {
	const user = commissarUserCache[commissar_id];
	candidates.push(user);
    });
    // Sort the clan members for ranking purposes.
    candidates.sort((a, b) => {
	// Users tie with themselves.
	if (a.commissar_id == b.commissar_id) {
            return 0;
	}
	const ap = a.participation_score || 0;
	const bp = b.participation_score || 0;
	const threshold = 0.0000000001;
	if (Math.abs(ap - bp) > threshold) {
	    // Normal case: rank users by participation score.
	    return ap - bp;
	} else {
	    // If the participation scores are close to equal, revert to seniority.
	    return b.commissar_id - a.commissar_id;
	}
    });
    const promotions = [];
    const ranks = rankModule.GenerateIdealRanksSorted(candidates.length);
    for (let i = 0; i < candidates.length; ++i) {
	const c = candidates[i];
	let r = ranks[i];
	if (c.rank_limit && r > c.rank_limit) {
	    // Enforce rank limit.
	    r = c.rank_limit;
	}
	if (r > c.rank) {
	    // Promotion detected.
	    promotions.push(c.commissar_id);
	}
	candidates[i].setRank(r);
    }
    return promotions;
}

function MaybeDecayParticipationPoints() {
    const participationDecay = 0.9962;
    const today = TimeUtil.UtcDateStamp();
    const yesterday = TimeUtil.YesterdayDateStamp();
    Object.keys(commissarUserCache).forEach((commissar_id) => {
	const cu = commissarUserCache[commissar_id];
	if (!moment(cu.participation_update_date).isSame(today, 'day') &&
	    !moment(cu.participation_update_date).isSame(yesterday, 'day')) {
	    // The user has a participation score, but it's from before yesterday.
	    const op = cu.participation_score;
	    // Decay the score.
	    cu.setParticipationScore(op * participationDecay);
	    // The update date is yesterday in case they want to take part today.
	    cu.setParticipationUpdateDate(yesterday);
	}
    });
}

module.exports = {
    CommissarUser,
    CreateNewDatabaseUser,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    LoadAllUsersFromDatabase,
    UpdateRanks,
    WriteAllUsersToDatabase,
    WriteDirtyUsersToDatabase,
};
