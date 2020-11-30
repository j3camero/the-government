const config = require('./config');
const fs = require('fs');
const mysql = require('mysql');
var SqlString = require('sqlstring');

let connected = false;
let connection;
let failedAttempts = 0;

function isConnected() {
    return connected;
}

function getConnection() {
    return connection;
}

function handleDisconnect() {
    console.log('Connecting to database.');
    connection = mysql.createConnection(config.sqlConfig);

    connection.connect(function(err) {
	if (err) {
	    console.log('error when connecting to db:', err);
	    failedAttempts += 1;
	    if (failedAttempts > 100) {
		throw 'Could not connect to the DB after many tries.';
	    } else {
		setTimeout(handleDisconnect, 5000);
	    }
	    return;
	}
	console.log('Database connected.');
	connected = true;
	failedAttempts = 0;
    });

    connection.on('error', function(err) {
	connected = false;
	console.log('db error:', err);
	if (err.code === 'PROTOCOL_CONNECTION_LOST') {
	    handleDisconnect();
	} else {
	    throw err;
	}
    });
}

handleDisconnect();

// Send a simple query periodically to keep the connection alive.
setInterval(function () {
    if (connected) {
	connection.query('SELECT 1');
    }
}, 8 * 60 * 1000);

// Write these records to the database immediately without buffering.
// Each record represents time spent together between a pair of
// Commissar users.
function writeTimeTogetherRecords(records) {
    if (!connected) {
	throw 'ERROR: tried to write to database while not connected.';
    }
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
    connection.query(sql, (err, result) => {
	if (err) {
	    throw err;
	}
	console.log(`Wrote ${records.length} records to the time matrix.`);
    });
}

// Query the database for the latest time matrix.
// On success, calls the given callback with a list of entries from the time matrix.
function getTimeMatrix(callback) {
    const sqlFilename = 'discounted-time-matrix.sql';
    fs.readFile(sqlFilename, 'utf8', function(err, sqlQuery) {
	if (err) {
	    throw err;
	}
	connection.query(sqlQuery, (err, results, fields) => {
	    if (err) {
		throw err;
	    }
	    callback(results);
	});
    });
}

// Write some Battlemetrics session records to the database.
//
// The records are sent out immediately without buffering.
// If any sessions already exist in the database (according to the
// Battlemetrics session id) then their fields are updated. Duplicate
// records are not created in the database.
function writeBattlemetricsSessions(sessions) {
    if (!connected) {
	throw 'ERROR: tried to write to database while not connected.';
    }
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
    connection.query(sql, (err, result) => {
	if (err) {
	    throw err;
	}
	const elapsed = Date.now() - startTime;
	console.log(`Wrote ${sessions.length} Battlemetrics sessions to the DB. [${elapsed} ms]`);
    });
}

module.exports = {
    getConnection,
    getTimeMatrix,
    isConnected,
    writeBattlemetricsSessions,
    writeTimeTogetherRecords,
};
