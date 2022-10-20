const RankMetadata = require('./rank-definitions');
const DB = require('./database');
const FilterUsername = require('./filter-username');
const moment = require('moment');

// Represents a member of the guild.
class CommissarUser {
    constructor(
	commissar_id,
	discord_id,
	nickname,
	nick,
	rank,
	last_seen,
	office,
	harmonic_centrality,
	peak_rank,
	gender,
	citizen,
	good_standing,
        friend_category_id,
        friend_text_chat_id,
        friend_voice_room_id,
        ban_vote_start_time,
        ban_vote_chatroom,
        ban_vote_message,
        yen,
        inactivity_tax_paid_until,
        ban_conviction_time) {
	this.commissar_id = commissar_id;
	this.discord_id = discord_id;
	this.nickname = nickname;
	this.nick = nick;
	this.rank = rank;
	this.last_seen = last_seen;
	this.office = office;
	this.harmonic_centrality = harmonic_centrality;
	this.peak_rank = peak_rank;
	this.gender = gender;
	this.citizen = citizen;
	this.good_standing = good_standing;
	this.friend_category_id = friend_category_id;
	this.friend_text_chat_id = friend_text_chat_id;
	this.friend_voice_room_id = friend_voice_room_id;
	this.ban_vote_start_time = ban_vote_start_time;
	this.ban_vote_chatroom = ban_vote_chatroom;
	this.ban_vote_message = ban_vote_message;
	this.yen = parseInt(yen);
	this.inactivity_tax_paid_until = inactivity_tax_paid_until;
	this.ban_conviction_time = ban_conviction_time;
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

    async setNick(nick) {
	nick = FilterUsername(nick);
	if (nick === this.nick) {
	    return;
	}
	this.nick = nick;
	await this.updateFieldInDatabase('nick', this.nick);
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
	if ((is_citizen && this.citizen) || (!is_citizen && !this.citizen)) {
	    return;
	}
	this.citizen = is_citizen;
	await this.updateFieldInDatabase('citizen', this.citizen);
    }

    // True or false value. Represents whether or not this user is in good standing.
    // Most users are in good standing. Bad standing means the user is losing a
    // pending ban-vote. They are quanrantined while the ban-vote is ongoing and
    // not going their way.
    async setGoodStanding(good_standing) {
	if ((good_standing && this.good_standing) || (!good_standing && !this.good_standing)) {
	    return;
	}
	this.good_standing = good_standing;
	await this.updateFieldInDatabase('good_standing', this.good_standing);
    }

    async setFriendCategorityId(friend_category_id) {
	if (friend_category_id === this.friend_category_id) {
	    return;
	}
	this.friend_category_id = friend_category_id;
	await this.updateFieldInDatabase('friend_category_id', this.friend_category_id);
    }

    async setFriendTextChatId(friend_text_chat_id) {
	if (friend_text_chat_id === this.friend_text_chat_id) {
	    return;
	}
	this.friend_text_chat_id = friend_text_chat_id;
	await this.updateFieldInDatabase('friend_text_chat_id', this.friend_text_chat_id);
    }

    async setFriendVoiceRoomId(friend_voice_room_id) {
	if (friend_voice_room_id === this.friend_voice_room_id) {
	    return;
	}
	this.friend_voice_room_id = friend_voice_room_id;
	await this.updateFieldInDatabase('friend_voice_room_id', this.friend_voice_room_id);
    }

    async setBanVoteStartTime(ban_vote_start_time) {
	if (ban_vote_start_time === this.ban_vote_start_time) {
	    return;
	}
	this.ban_vote_start_time = ban_vote_start_time;
	await this.updateFieldInDatabase('ban_vote_start_time', this.ban_vote_start_time);
    }

    async setBanVoteChatroom(ban_vote_chatroom) {
	if (ban_vote_chatroom === this.ban_vote_chatroom) {
	    return;
	}
	this.ban_vote_chatroom = ban_vote_chatroom;
	await this.updateFieldInDatabase('ban_vote_chatroom', this.ban_vote_chatroom);
    }

    async setBanVoteMessage(ban_vote_message) {
	if (ban_vote_message === this.ban_vote_message) {
	    return;
	}
	this.ban_vote_message = ban_vote_message;
	await this.updateFieldInDatabase('ban_vote_message', this.ban_vote_message);
    }

    async setYen(yen) {
	if (yen === this.yen) {
	    return;
	}
	this.yen = parseInt(yen);
	await this.updateFieldInDatabase('yen', this.yen);
    }

    async setInactivityTaxPaidUntil(inactivity_tax_paid_until) {
	if (inactivity_tax_paid_until === this.inactivity_tax_paid_until) {
	    return;
	}
	this.inactivity_tax_paid_until = inactivity_tax_paid_until;
	await this.updateFieldInDatabase('inactivity_tax_paid_until', this.inactivity_tax_paid_until);
    }

    async setBanConvictionTime(ban_conviction_time) {
	if (ban_conviction_time === this.ban_conviction_time) {
	    return;
	}
	this.ban_conviction_time = ban_conviction_time;
	await this.updateFieldInDatabase('ban_conviction_time', this.ban_conviction_time);
    }

    async updateFieldInDatabase(fieldName, fieldValue) {
	//console.log(`DB update ${fieldName} = ${fieldValue} for ${this.nickname} (ID:${this.commissar_id}).`);
	const sql = `UPDATE users SET ${fieldName} = ? WHERE commissar_id = ?`;
	const values = [fieldValue, this.commissar_id];
	const result = await DB.Query(sql, values);
	if (result.affectedRows !== 1) {
	    throw `Updated wrong number of records. Should only update 1 (${result.affectedRows}).`;
	}
    }

    getRank() {
	if (this.office === 'PREZ') {
	    return 0;
	}
	if (this.office === 'VEEP') {
	    return 1;
	}
	return this.rank;
    }
    
    getGenderPrefix() {
	if (this.gender === 'F') {
	    return 'Madam';
	} else if (this.gender === 'A') {
	    return 'The';
	} else {
	    return 'Mr.';
	}
    }

    getNicknameOrTitle() {
	const rank = this.getRank();
	const job = RankMetadata[rank];
	if (job.titleOverride) {
	    const prefix = this.getGenderPrefix();
	    return `${prefix} ${job.title}`;
	} else {
	    // User-supplied nickname overrides their Discord-wide nickname.
	    return this.nick || this.nickname;
	}
    }

    getInsignia() {
	if (!this.citizen) {
	    return '●';
	}
	const rank = this.getRank();
	const rankData = RankMetadata[rank];
	return rankData.insignia;
    }

    getNicknameWithInsignia() {
	const insignia = this.getInsignia();
	return `${this.nickname} ${insignia}`;
    }

    getNicknameOrTitleWithInsignia() {
	const name = this.getNicknameOrTitle();
	const insignia = this.getInsignia();
	return `${name} ${insignia}`;
    }

    getRankNameAndInsignia() {
	const rank = this.getRank();
	const job = RankMetadata[rank];
	const nameAndInsignia = this.getNicknameOrTitleWithInsignia();
	return `${job.title} ${nameAndInsignia}`;
    }

    getPossessivePronoun() {
	if (this.gender === 'M') {
	    return 'his';
	} else if (this.gender === 'F') {
	    return 'her';
	} else {
	    return 'their';
	}
    }
}

module.exports = CommissarUser;
