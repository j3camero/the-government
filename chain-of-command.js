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
    console.log('Chain of command');
    // Populate vertex data from discord.
    const members = UserCache.GetAllUsersAsFlatList();
    members.sort((a, b) => {
	let aScore = a.harmonic_centrality || 0;
	let bScore = b.harmonic_centrality || 0;
	if (a.ban_conviction_time && a.ban_pardon_time) {
	    aScore = 0;
	}
	if (b.ban_conviction_time && b.ban_pardon_time) {
	    bScore = 0;
	}
	if (!a.citizen) {
	    aScore = 0;
	}
	if (!b.citizen) {
	    bScore = 0;
	}
	return bScore - aScore;
    });
    // TODO: bring back the new guy demotion with daily and monthly activity counters
    // linked to discord activity instead of Rust+ activity.
    // Assign discrete ranks to each player.
    let rank = 0;
    let usersAtRank = 0;
    let rankIndex = 1;
    const recruitRank = RankMetadata.length - 1;
    console.log('members.length', members.length);
    for (const m of members) {
	if (!m.citizen) {
	    await m.setRank(recruitRank);
	    await m.setRankScore(0);
	    await m.setRankIndex(999);
	    continue;
	}
	while (usersAtRank >= RankMetadata[rank].count) {
	    rank++;
	    usersAtRank = 0;
	}
	// When we run out of ranks, this line defaults to the last/least rank.
	rank = Math.max(0, Math.min(RankMetadata.length - 1, rank));
	// Write the rank to the vertex record.
	m.rank = rank;
	// Do not await the promotion announcement. Fire and forget.
	AnnounceIfPromotion(m, m.rank, rank);
	await m.setRank(rank);
	await m.setRankScore(m.harmonic_centrality);
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
    const name = user.getNicknameOrTitleWithInsignia();
    const oldMeta = RankMetadata[oldRank];
    const newMeta = RankMetadata[newRank];
    const message = `${name} is promoted from ${oldMeta.title} ${oldMeta.insignia} to ${newMeta.title} ${newMeta.insignia}`;
    console.log(message);
    await DiscordUtil.MessagePublicChatChannel(message);
}

module.exports = {
    CalculateChainOfCommand,
};
