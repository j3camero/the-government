const config = require('./config');
const fs = require('fs');
const mysql = require('mysql');
const SqlString = require('sqlstring');

const connection = mysql.createConnection(config.sqlConfig);
let connectionPromise;

async function Connect() {
    // Check to see if a connection request is already ongoing.
    if (connectionPromise) {
	return connectionPromise;
    }
    connectionPromise = new Promise((resolve, reject) => {
	connection.connect(function(err) {
	    if (err) {
		reject(err);
	    } else {
		resolve(connection);
	    }
	});
    });
    return connectionPromise;
}

Connect();

async function Query(sql, values) {
    return new Promise((resolve, reject) => {
	connection.query(sql, values, (err, results) => {
	    if (err) {
		reject(err);
	    } else {
		resolve(results);
	    }
	});
    });
}

connection.on('error', async (err) => {
    console.log('Database error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
	await Connect();
    } else {
	throw err;
    }
});

// Send a simple query periodically to keep the connection alive.
setInterval(function () {
    Query('SELECT 1');
}, 8 * 60 * 1000);

// Write these records to the database immediately without buffering.
// Each record represents time spent together between a pair of
// Commissar users.
async function WriteTimeTogetherRecords(records) {
    if (records.length === 0) {
	return;
    }
    const sqlParts = [];
    records.forEach((r) => {
	if (!r.durationSeconds || r.durationSeconds <= 0 || !r.dilutedSeconds || r.dilutedSeconds <= 0) {
	    return;
	}
	sqlParts.push(`(${r.loUserId},${r.hiUserId},${r.durationSeconds},${r.dilutedSeconds})`);
    });
    const sql = (
	'INSERT INTO time_together ' +
	'(lo_user_id, hi_user_id, duration_seconds, diluted_seconds) ' +
	    'VALUES ' + sqlParts.join(', '));
    console.log('About to write records to the time matrix.');
    await Query(sql);
    console.log(`Wrote ${records.length} records to the time matrix.`);
}

// Query the database for the latest time matrix.
async function GetTimeMatrix() {
    return new Promise((resolve, reject) => {
	const sqlFilename = 'discounted-time-matrix.sql';
	fs.readFile(sqlFilename, 'utf8', async (err, sqlQuery) => {
	    if (err) {
		reject(err);
	    }
	    const results = await Query(sqlQuery);
	    resolve(results);
	});
    });
}

// Write some Battlemetrics session records to the database.
//
// The records are sent out immediately without buffering.
// If any sessions already exist in the database (according to the
// Battlemetrics session id) then their fields are updated. Duplicate
// records are not created in the database.
async function WriteBattlemetricsSessions(sessions) {
    if (!sessions || sessions.length === 0) {
	return;
    }
    const formattedSessions = [];
    sessions.forEach((s) => {
	const sessionId = SqlString.escape(s.id);
	const startTime = SqlString.escape(s.attributes.start);
	const stopTime = SqlString.escape(s.attributes.stop);
	const firstTime = s.attributes.firstTime ? 'TRUE' : 'FALSE';
	const inGameName = SqlString.escape(s.attributes.name);
	const serverId = parseInt(s.relationships.server.data.id);
	const playerId = parseInt(s.relationships.player.data.id);
	const identifierId = parseInt(s.relationships.identifiers.data[0].id);
	formattedSessions.push(`(${sessionId},${startTime},${stopTime},${firstTime},${inGameName},${serverId},${playerId},${identifierId})`);
    });
    const sql = (
	'INSERT INTO battlemetrics_sessions (' +
	'    battlemetrics_sessions.battlemetrics_id, ' +
	'    battlemetrics_sessions.start_time, ' +
	'    battlemetrics_sessions.stop_time, ' +
	'    battlemetrics_sessions.first_time, ' +
	'    battlemetrics_sessions.in_game_name, ' +
	'    battlemetrics_sessions.server_id, ' +
	'    battlemetrics_sessions.player_id, ' +
	'    battlemetrics_sessions.identifier_id ' +
        ') VALUES ' + formattedSessions.join(', ') +
	'ON DUPLICATE KEY UPDATE ' +
	'    battlemetrics_sessions.start_time = VALUES(battlemetrics_sessions.start_time), ' +
	'    battlemetrics_sessions.stop_time = VALUES(battlemetrics_sessions.stop_time), ' +
	'    battlemetrics_sessions.first_time = VALUES(battlemetrics_sessions.first_time), ' +
	'    battlemetrics_sessions.in_game_name = VALUES(battlemetrics_sessions.in_game_name), ' +
	'    battlemetrics_sessions.server_id = VALUES(battlemetrics_sessions.server_id), ' +
	'    battlemetrics_sessions.player_id = VALUES(battlemetrics_sessions.player_id), ' +
	    '    battlemetrics_sessions.identifier_id = VALUES(battlemetrics_sessions.identifier_id)');
    // Time the database operation.
    const startTime = Date.now();
    await Query(sql);
    const elapsed = Date.now() - startTime;
    console.log(`Wrote ${sessions.length} Battlemetrics sessions to the DB. [${elapsed} ms]`);
}

module.exports = {
    Connect,
    GetTimeMatrix,
    Query,
    WriteBattlemetricsSessions,
    WriteTimeTogetherRecords,
};
