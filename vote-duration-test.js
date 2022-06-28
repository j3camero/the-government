const assert = require('assert');
const VoteDuration = require('./vote-duration');

describe('Vote Duration', () => {
    it('Simple Majority', () => {
	assert(VoteDuration.SimpleMajority(2, 1));  // Pass by one vote.
	assert(!VoteDuration.SimpleMajority(4, 4));  // Tied vote.
	assert(!VoteDuration.SimpleMajority(6, 7));  // Fail by one vote.
	assert(VoteDuration.SimpleMajority(1, 0));  // Pass with a single vote.
	assert(VoteDuration.SimpleMajority(99, 1));  // Pass overwhelmingly.
	assert(!VoteDuration.SimpleMajority(1, 99));  // Fail overwhelmingly.
	assert(VoteDuration.SimpleMajority(5, 0));  // Pass by consensus.
	assert(!VoteDuration.SimpleMajority(0, 7));  // Reject by consensus.
	assert(!VoteDuration.SimpleMajority(0, 0));  // No votes cast.
    });
    it('SuperMajority', () => {
	assert(VoteDuration.SuperMajority(2, 1));
	assert(!VoteDuration.SuperMajority(4, 4));
	assert(!VoteDuration.SuperMajority(6, 7));
	assert(VoteDuration.SuperMajority(1, 0));
	assert(VoteDuration.SuperMajority(99, 1));
	assert(!VoteDuration.SuperMajority(1, 99));
	assert(VoteDuration.SuperMajority(5, 0));
	assert(!VoteDuration.SuperMajority(0, 7));
	assert(!VoteDuration.SuperMajority(17, 9));
	assert(VoteDuration.SuperMajority(18, 9));
	assert(VoteDuration.SuperMajority(19, 9));
	assert(!VoteDuration.SuperMajority(0, 0));
    });
    it('VoteMargin', () => {
	assert.equal(VoteDuration.VoteMargin(0, 0, VoteDuration.SimpleMajority), 1);
	assert.equal(VoteDuration.VoteMargin(7, 4, VoteDuration.SimpleMajority), 3);
    });
});
