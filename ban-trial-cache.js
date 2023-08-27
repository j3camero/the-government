const DB = require('./database');
const moment = require('moment');
const UserCache = require('./user-cache');

// Represents a cached ban trial record.
class BanTrial {
    constructor(
	trial_id,
	defendant_id,
        ) {
	this.trial_id = trial_id;
	this.defendant_id = defendant_id;
	// ...
    }

    async set() {
	if ( === this.) {
	    return;
	}
	this. = ;
	await this.updateFieldInDatabase('discord_id', this.discord_id);
    }

    // Other getters and setters go here.
}

// Below is a cache of active ban trials that is kept in-memory.
// The key is defendant_id (commissar_id) even though each trial has its own trial_id.
let banTrialCache = {};

// Read all the trials from the database, then swap the cache.
async function LoadAllTrialsFromDatabase() {
    const results = await DB.Query('SELECT * FROM ban_trials');
    const newCache = {};
    results.forEach((row) => {
	const trial = new BanTrial(
	    row.trial_id,
	    row.defendant_id,
	    row.vote_start_time,
	    row.chatroom_id,
	    row.message_id,
	);
	newCache[row.defendant_id] = trial;
    });
    banTrialCache = newCache;
    const n = Object.keys(banTrialCache).length;
    console.log(`Loaded ${n} ban trials from the database.`);
}

// Get a cached ban trial record by defedant's Commissar ID.
function GetCachedBanTrialByDefendantId(defendant_id) {
    if (defendant_id in banTrialCache) {
	return banTrialCache[defendant_id];
    } else {
	throw `Could not find cached ban trial with defendant_id = ${defendant_id}.`;
    }
}

async function GetOrCreateCachedBanTrialByDefendantId(defendant_id) {
    if (defendant_id in banTrialCache) {
	return banTrialCache[defendant_id];
    } else {
	return await CreateNewBanTrialInDatabase(defendant_id);
    }
}

// Creates a new user in the database. On success, the new user is added to the cache.
async function CreateNewBanTrialInDatabase(defendant_id) {
    const currentIsoTimestamp = moment().format();
    const fields = {
	defendant_id,
	vote_start_time: currentIsoTimestamp,
	chatroom_id: null,
	message_id: null,
    };
    const result = await DB.Query('INSERT INTO ban_trials SET ?', fields);
    const trial_id = result.insertId;
    const trial = new BanTrial(
	trial_id,
	defendant_id,
	vote_start_time,
	chatroom_id,
	message_id,
    );
    banTrialCache[defendant_id] = trial;
    return trial;
}

module.exports = {
    GetCachedBanTrialByDefendantId,
    GetOrCreateCachedBanTrialByDefendantId,
    LoadAllTrialsFromDatabase,
};
