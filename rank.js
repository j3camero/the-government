const DiscordUtil = require('./discord-util');
const moment = require('moment');
const RankMetadata = require('./rank-definitions');
const Sleep = require('./sleep');
const UserCache = require('./user-cache');

// Update the ranks of all users.
async function UpdateUserRanks() {
    const users = UserCache.GetMostCentralUsers();
    let rank = 2;  // Start at 4-star General (rank 2) as a cheap hack to disable the Marshal ranks (ranks 0 and 1).
    let usersAtRank = 0;
    for (const user of users) {
	// When we run out of ranks, this line defaults to the last/least rank.
	rank = Math.max(0, Math.min(RankMetadata.length - 1, rank));
	await AnnounceIfPromotion(user, rank);
	await user.setRank(rank);
	usersAtRank++;
	if (usersAtRank >= RankMetadata[rank].count) {
	    rank++;
	    usersAtRank = 0;
	}
    }
}

// Announce a promotion in #public chat, if applicable.
//
// user - a commissar user.
// newRank - integer rank index of the user's new rank.
async function AnnounceIfPromotion(user, newRank) {
    if (!user ||
	user.rank === undefined || user.rank === null ||
	newRank === undefined || newRank === null ||
	!Number.isInteger(user.rank) || !Number.isInteger(newRank) ||
	newRank >= user.rank) {
	// No promotion detected. Bail.
	return;
    }
    if (!user.last_seen) {
	return;
    }
    const lastSeen = moment(user.last_seen);
    if (moment().subtract(24, 'hours').isAfter(lastSeen)) {
	// No announcements for people who are invactive the last 24 hours.
	return;
    }
    // If we get past here, a promotion has been detected.
    // Announce it in #public chat.
    const oldMeta = RankMetadata[user.rank];
    const newMeta = RankMetadata[newRank];
    const message = (
	`${user.nickname} ${newMeta.insignia} is promoted from ` +
        `${oldMeta.title} ${oldMeta.insignia} to ` +
	`${newMeta.title} ${newMeta.insignia}`
    );
    console.log(message);
    // Delay for a few seconds to spread out the promotion messages and
    // also achieve a crude non-guaranteed sorting by rank.
    const delayMillis = 1000 * (newRank + Math.random() / 2) + 100;
    await Sleep(delayMillis);
    await DiscordUtil.MessagePublicChatChannel(message);
}

module.exports = {
    UpdateUserRanks,
};
