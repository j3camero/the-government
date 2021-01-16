const FilterUsername = require('./filter-username');
const moment = require('moment');

// Represents a member of the guild.
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

module.exports = CommissarUser;
