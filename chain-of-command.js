const db = require('./database');
const { PermissionFlagsBits } = require('discord.js');
const DiscordUtil = require('./discord-util');
const fs = require('fs');
const moment = require('moment');
const RankMetadata = require('./rank-definitions');
const RoleID = require('./role-id');
const Sleep = require('./sleep');
const UserCache = require('./user-cache');

async function CalculateChainOfCommand() {
    const recruitRank = RankMetadata.length - 1;
    const members = UserCache.GetAllUsersAsFlatList();
    for (const m of members) {
	if (!m.citizen || m.ban_conviction_time || m.ban_pardon_time) {
	    await m.setRank(recruitRank);
	    await m.setRankScore(0);
	    await m.setRankIndex(999);
	    await m.setHarmonicCentrality(0);
	    continue;
	}
	//console.log(`${m.getNicknameOrTitleWithInsignia()},${m.harmonic_centrality},${m.calendar_day_count},${m.calendar_month_count}`);
	const hc = m.harmonic_centrality || 0;
	const dc = m.calendar_day_count || 1;
	const mc = m.calendar_month_count || 1;
	const r = hc * Math.sqrt(dc * mc);
	await m.setRankScore(r);
    }
    members.sort((a, b) => {
	return b.rank_score - a.rank_score;
    });
    // Assign discrete ranks to each player.
    let rank = 0;
    let usersAtRank = 0;
    let rankIndex = 0;
    for (const m of members) {
	if (!m.citizen) {
	    continue;
	}
	while (usersAtRank >= RankMetadata[rank].count) {
	    rank++;
	    usersAtRank = 0;
	}
	// When we run out of ranks, this line defaults to the last/least rank.
	rank = Math.max(0, Math.min(RankMetadata.length - 1, rank));
	// Write the rank to the vertex record.
	await AnnounceIfPromotion(m, m.rank, rank);
	await m.setRank(rank);
	await m.setRankIndex(rankIndex);
	rankIndex++;
	usersAtRank++;
    }
}

// A temporary in-memory cache of the highest rank seen per user.
// This is used to avoid spamming promotion notices if a user's
// rank oscilates up and down rapidly.
let maxRankByCommissarId = {};

// Clear the recent max rank cache every few hours.
setInterval(() => {
    console.log('Clearing maxRankByCommissarId');
    maxRankByCommissarId = {};
}, 8 * 60 * 60 * 1000);

// Announce a promotion in #public chat, if applicable.
//
// user - a commissar user.
// newRank - integer rank index of the user's new rank.
async function AnnounceIfPromotion(user, oldRank, newRank) {
    if (!user ||
	user.rank === undefined || user.rank === null ||
	oldRank === undefined || oldRank === null ||
	newRank === undefined || newRank === null ||
	!Number.isInteger(user.rank) ||
	!Number.isInteger(newRank) ||
	!Number.isInteger(oldRank) ||
	newRank >= oldRank) {
	// No promotion detected. Bail.
	return;
    }
    if (!user.last_seen) {
	return;
    }
    const lastSeen = moment(user.last_seen);
    if (moment().subtract(72, 'hours').isAfter(lastSeen)) {
	// No announcements for people who are invactive the last 24 hours.
	return;
    }
    const lowestPossibleRank = RankMetadata.length - 1;
    const maxRecentRank = maxRankByCommissarId[user.commissar_id] || lowestPossibleRank;
    // Lower rank index represents a higher-status rank.
    // If could do it again I would. But that's how it is.
    const newMaxRank = Math.min(newRank, maxRecentRank);
    if (newMaxRank >= maxRecentRank) {
	return;
    }
    maxRankByCommissarId[user.commissar_id] = newMaxRank;
    // If we get past here, a promotion has been detected.
    // Announce it in #public chat.
    const name = user.nick || user.nickname || 'John Doe';
    const oldMeta = RankMetadata[oldRank];
    const newMeta = RankMetadata[newRank];
    let oldInsignia;
    if (oldMeta.insignia) {
	oldInsignia = oldMeta.insignia + ' ';
    } else {
	oldInsignia = '';
    }
    const message = `${name} is promoted from ${oldMeta.title} ${oldInsignia}to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    await DiscordUtil.MessagePublicChatChannel(message);
}

module.exports = {
    CalculateChainOfCommand,
};
