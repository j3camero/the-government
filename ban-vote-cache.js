const db = require('./database');
const UserCache = require('./user-cache');

const voteCache = {};

async function DeleteVotesForDefendant(defendantId) {
    if (defendantId in voteCache) {
	delete voteCache[defendantId];
    }
    await db.Query('DELETE FROM ban_votes WHERE defendant_id = ?', [defendantId]);
}

function CountVotesForDefendant(defendantId) {
    const totals = {
	0: 0,
	1: 0,
	2: 0,
    };
    const votes = voteCache[defendantId] || {};
    for (const voterId in votes) {
	const vote = votes[voterId];
	totals[vote]++;
    }
    return totals;
}

async function ExpungeVotesWithNoOngoingTrial() {
    for (const defendantId in voteCache) {
	const cu = UserCache.GetCachedUserByCommissarId(defendantId);
	if (cu) {
	    if (!cu.ban_vote_start_time) {
		await DeleteVotesForDefendant(defendantId);
		// Bail after updating one defendant to avoid race conditions.
		return;
	    }
	}
    }
}

async function LoadVotesFromDatabase() {
    const votes = await db.Query('SELECT * FROM ban_votes');
    for (const vote of votes) {
	if (!(vote.defendant_id in voteCache)) {
	    voteCache[vote.defendant_id] = {};
	}
	voteCache[vote.defendant_id][vote.voter_id] = vote.vote;
    }
}

async function RecordVoteIfChanged(defendantId, voterId, vote) {
    const cu = UserCache.GetCachedUserByCommissarId(defendantId);
    if (!cu) {
	// Don't record votes for non-existent users or bots and the like.
	return;
    }
    if (!cu.ban_vote_start_time) {
	// Don't record votes unless a trial is under way.
	return;
    }
    if (!(defendantId in voteCache)) {
	voteCache[defendantId] = {};
    }
    const cachedVote = voteCache[defendantId][voterId];
    if (vote === cachedVote) {
	return;
    }
    voteCache[defendantId][voterId] = vote;
    const sql = 'INSERT INTO ban_votes (defendant_id, voter_id, vote) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vote = VALUES(vote)';
    const values = [defendantId, voterId, vote];
    await db.Query(sql, values);
}

module.exports = {
    CountVotesForDefendant,
    DeleteVotesForDefendant,
    ExpungeVotesWithNoOngoingTrial,
    LoadVotesFromDatabase,
    RecordVoteIfChanged,
};
