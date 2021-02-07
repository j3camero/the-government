const DB = require('./database');
const FilterUsername = require('./filter-username');
const moment = require('moment');

// Represents a member of the guild.
class CommissarUser {
    constructor(
	commissar_id,
	discord_id,
	nickname,
	rank,
	last_seen,
	office,
	harmonic_centrality,
	peak_rank,
	gender,
	citizen) {
	this.commissar_id = commissar_id;
	this.discord_id = discord_id;
	this.nickname = nickname;
	this.rank = rank;
	this.last_seen = last_seen;
	this.office = office;
	this.harmonic_centrality = harmonic_centrality;
	this.peak_rank = peak_rank;
	this.gender = gender;
	this.citizen = citizen;
    }

    async setDiscordId(discord_id) {
	if (discord_id === this.discord_id) {
	    return;
	}
	this.discord_id = discord_id;
	await this.updateFieldInDatabase('discord_id', this.discord_id);
    }

    async setNickname(nickname) {
	nickname = FilterUsername(nickname);
	if (nickname === this.nickname) {
	    return;
	}
	this.nickname = nickname;
	await this.updateFieldInDatabase('nickname', this.nickname);
    }

    async setRank(rank) {
	if (rank === this.rank) {
	    return;
	}
	this.rank = rank;
	await this.updateFieldInDatabase('rank', this.rank);
	await this.setPeakRank(this.rank);
    }

    async seenNow() {
	this.last_seen = moment().format();
	await this.updateFieldInDatabase('last_seen', this.last_seen);
    }

    async setOffice(office) {
	if (office === this.office) {
	    return;
	}
	this.office = office;
	await this.updateFieldInDatabase('office', this.office);
    }

    async setHarmonicCentrality(new_centrality) {
	if (new_centrality === this.harmonic_centrality) {
	    return;
	}
	this.harmonic_centrality = new_centrality;
	await this.updateFieldInDatabase('harmonic_centrality', this.harmonic_centrality);
    }

    async setPeakRank(peak_rank) {
	// Lower ranks are more senior, in the database.
	if (!this.peak_rank || peak_rank < this.peak_rank) {
	    this.peak_rank = peak_rank;
	    await this.updateFieldInDatabase('peak_rank', this.peak_rank);
	}
    }

    async setGender(gender) {
	// Gender is any capital ASCII letter in the database. M, F, L, G, B, T, Q...
	if (!gender) {
	    throw `Invalid gender value: ${gender}`;
	}
	if (gender === this.gender) {
	    // Bail because the same value is already in the cache. Not an error.
	    return;
	}
	if (typeof gender !== 'string' || gender.length !== 1) {
	    throw 'Gender has to be a string of length 1. It says so in the Bible!';
	}
	this.gender = gender;
	await this.updateFieldInDatabase('gender', this.gender);
    }

    // True or false value. Represents whether or not this user is a member of the
    // Discord guild. Members who have left or been banned will have the value false.
    async setCitizen(is_citizen) {
	if (is_citizen === this.citizen) {
	    return;
	}
	this.citizen = is_citizen;
	await this.updateFieldInDatabase('citizen', this.citizen);
    }

    async updateFieldInDatabase(fieldName, fieldValue) {
	console.log(`DB update ${fieldName} = ${fieldValue} for ${this.nickname} (ID:${this.commissar_id}).`);
	const sql = `UPDATE users SET ${fieldName} = ? WHERE commissar_id = ?`;
	const values = [fieldValue, this.commissar_id];
	const result = await DB.Query(sql, values);
	if (result.affectedRows !== 1) {
	    throw `Updated wrong number of records. Should only update 1 (${result.affectedRows}).`;
	}
    }
}

module.exports = CommissarUser;
