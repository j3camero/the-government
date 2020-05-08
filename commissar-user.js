const fs = require('fs');
const moment = require('moment');
const rankModule = require('./rank');
const TimeUtil = require('./time-util');

// This class represents a member of the clan.

class CommissarUser {
    constructor(commissar_id, discord_id, nickname, rank, last_seen, office) {
	this.commissar_id = commissar_id;
	this.discord_id = discord_id;
	this.nickname = nickname;
	this.rank = rank;
	this.last_seen = last_seen;
	this.office = office;
	// Dirty flag indicates that this record has changed and needs to be backed up to the database.
	this.dirty = false;
    }

    setDiscordId(discord_id) {
	if (discord_id !== this.discord_id) {
	    this.dirty = true;
	}
	this.discord_id = discord_id;
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

    setOffice(office) {
	if (office !== this.office) {
	    this.dirty = true;
	}
	this.office = office;
    }

    writeToDatabase(connection) {
	this.dirty = false;
	const sql = ('UPDATE users SET discord_id = ?, nickname = ?, ' +
		     'rank = ?, last_seen = ?, office = ? ' +
		     'WHERE commissar_id = ?');
	const values = [
	    this.discord_id, this.nickname, this.rank,
	    this.last_seen, this.office, this.commissar_id
	];
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
    const steam_id = null;
    const fields = {discord_id, steam_id, nickname, rank, last_seen};
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
    // User 6 is Bob.
    return commissarUserCache[6];
}

const executiveOffices = {
    'PRES': {
	abbreviation: 'Pres.',
	longTitle: 'President',
	rank: 0,
	shortTitle: 'President',
    },
    'VP': {
	abbreviation: 'VP',
	longTitle: 'Vice President',
	rank: 1,
	shortTitle: 'Vice President',
    },
    'CJCS': {
	abbreviation: 'Chmn.',
	longTitle: 'Chairman of the Joint Chiefs of Staff',
	rank: 2,
	shortTitle: 'Chairman',
    },
    'MINDEF': {
	abbreviation: 'Min.',
	longTitle: 'Minister of Defense',
	rank: 2,
	shortTitle: 'Minister',
    },
    'ARMY': {
	abbreviation: 'Chf.',
	chatroom: 'army-only',
	longTitle: 'Chief of the Army',
	rank: 3,
	role: 'Army',
	shortTitle: 'Chief',
    },
    'MARINES': {
	abbreviation: 'Cmdt.',
	chatroom: 'marines-only',
	longTitle: 'Commandant of the Marines',
	rank: 3,
	role: 'Marines',
	shortTitle: 'Commandant',
    },
    'AIR': {
	abbreviation: 'Sec.',
	chatroom: 'air-force',
	longTitle: 'Secretary of the Air Force',
	rank: 3,
	role: 'Air Force',
	shortTitle: 'Secretary',
    },
    'INTEL': {
	abbreviation: 'Dir.',
	chatroom: 'intel-only',
	longTitle: 'Director of Intelligence',
	rank: 3,
	role: 'Intel',
	shortTitle: 'Director',
    },
};

// Returns a user with the given target rank, who doesn't already have an office.
// If all users of the target rank already have an office, returns null.
//   - targetRank: find a user of this rank exactly.
//   - userCache: for unit testing a mock user cache can be passed in. In
//                production the real user cache is passed in.
//   - chainOfCommand: the most recently computed chain of command.
function FindUnassignedUser(targetRank, chainOfCommand, userCache) {
    let foundUser = null;
    Object.keys(chainOfCommand).forEach((commissar_id) => {
	const cachedUser = userCache[commissar_id];
	const comUser = chainOfCommand[commissar_id];
	if (cachedUser && comUser && comUser.rank === targetRank && !cachedUser.office) {
	    foundUser = cachedUser;
	}
    });
    return foundUser;
}

// Updates the clan executives. Fire any users that don't match their jobs any
// more, then appoint new executives to fill any open spots.
//   - userCache: for unit testing, pass in a mock of the user cache. In
//                production, pass the real user cache in.
//   - chainOfCommand: the most recently computed chain of command.
function UpdateClanExecutives(chainOfCommand, userCache) {
    const filledPositions = {};
    // Dismiss executives who don't match any more.
    Object.values(userCache).forEach((user) => {
	if (!user.office) {
	    return;
	}
	const jobDescription = executiveOffices[user.office];
	if ((user.office in filledPositions) || (user.rank !== jobDescription.rank)) {
	    user.setOffice(null);
	    return;
	}
	filledPositions[user.office] = true;
    });
    // Attempt to fill all empty executive roles.
    Object.keys(executiveOffices).forEach((jobID) => {
	const jobDescription = executiveOffices[jobID];
	if (jobID in filledPositions) {
	    return;
	}
	const appointee = FindUnassignedUser(jobDescription.rank, chainOfCommand, userCache);
	if (appointee) {
	    appointee.setOffice(jobID);
	}
    });
}

module.exports = {
    CommissarUser,
    CreateNewDatabaseUser,
    FindUnassignedUser,
    GetAllNicknames,
    GetCachedUserByCommissarId,
    GetCachedUserByDiscordId,
    GetUserWithHighestParticipationPoints,
    LoadAllUsersFromDatabase,
    UpdateClanExecutives,
    WriteAllUsersToDatabase,
    WriteDirtyUsersToDatabase,
};
