const RankMetadata = require('./rank-definitions');
const UserCache = require('./user-cache');

async function UpdateUserRanks() {
    const users = UserCache.GetMostCentralUsers();
    let rank = 0;
    let usersAtRank = 0;
    for (const user of users) {
	// When we run out of ranks, this line defaults to the last/least rank.
	rank = Math.max(0, Math.min(RankMetadata.length - 1, rank));
	console.log(`Rank ${rank} ${user.nickname}`);
	//await user.setRank(rank);
	usersAtRank++;
	if (usersAtRank >= RankMetadata[rank].count) {
	    rank++;
	    usersAtRank = 0;
	}
    }
}

module.exports = {
    UpdateUserRanks,
};
