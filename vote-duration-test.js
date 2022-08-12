const ApproximatelyEquals = require('./approximately-equals');
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
	// Simple Majority.
	assert.equal(VoteDuration.VoteMargin(0, 0, VoteDuration.SimpleMajority), 1);
	assert.equal(VoteDuration.VoteMargin(1, 0, VoteDuration.SimpleMajority), 1);
	assert.equal(VoteDuration.VoteMargin(0, 1, VoteDuration.SimpleMajority), 2);
	assert.equal(VoteDuration.VoteMargin(1, 1, VoteDuration.SimpleMajority), 1);
	assert.equal(VoteDuration.VoteMargin(3, 3, VoteDuration.SimpleMajority), 1);
	assert.equal(VoteDuration.VoteMargin(7, 4, VoteDuration.SimpleMajority), 3);
	assert.equal(VoteDuration.VoteMargin(5, 9, VoteDuration.SimpleMajority), 5);
	assert.equal(VoteDuration.VoteMargin(5, 6, VoteDuration.SimpleMajority), 2);
	assert.equal(VoteDuration.VoteMargin(3, 2, VoteDuration.SimpleMajority), 1);
	// SuperMajority.
	assert.equal(VoteDuration.VoteMargin(0, 0, VoteDuration.SuperMajority), 1);
	assert.equal(VoteDuration.VoteMargin(1, 0, VoteDuration.SuperMajority), 1);
	assert.equal(VoteDuration.VoteMargin(0, 1, VoteDuration.SuperMajority), 2);
	assert.equal(VoteDuration.VoteMargin(1, 1, VoteDuration.SuperMajority), 1);
	assert.equal(VoteDuration.VoteMargin(2, 1, VoteDuration.SuperMajority), 1);
	assert.equal(VoteDuration.VoteMargin(3, 3, VoteDuration.SuperMajority), 3);
	assert.equal(VoteDuration.VoteMargin(5, 2, VoteDuration.SuperMajority), 1);
	assert.equal(VoteDuration.VoteMargin(10, 3, VoteDuration.SuperMajority), 3);
    });
    it('27-1 supermajority vote', () => {
	const p = VoteDuration.ProbabilityOfVoteOutcomeChange(50, 27, 1, 3, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(p, 0.01));
	const t = VoteDuration.EstimateVoteDuration(50, 27, 1, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(t, 2.75));
    });
    it('5-3 supermajority vote', () => {
	const p = VoteDuration.ProbabilityOfVoteOutcomeChange(50, 5, 3, 6, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(p, 0.21));
	const t = VoteDuration.EstimateVoteDuration(50, 5, 3, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(t, 6.58));
    });
    it('11-1 simple majority vote', () => {
	const p = VoteDuration.ProbabilityOfVoteOutcomeChange(100, 11, 1, 5, VoteDuration.SimpleMajority);
	assert(ApproximatelyEquals(p, 0.1));
	const t = VoteDuration.EstimateVoteDuration(100, 11, 1, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(t, 5.99));
    });
    it('5-3 simple majority vote', () => {
	const p = VoteDuration.ProbabilityOfVoteOutcomeChange(15, 5, 3, 4, VoteDuration.SimpleMajority);
	assert(ApproximatelyEquals(p, 0.12));
	const t = VoteDuration.EstimateVoteDuration(15, 5, 3, VoteDuration.SuperMajority);
	assert(ApproximatelyEquals(t, 5.95));
    });
    it('Past the deadline', () => {
	const p = VoteDuration.ProbabilityOfVoteOutcomeChange(15, 5, 3, 8, VoteDuration.SimpleMajority);
	assert(ApproximatelyEquals(p, 0));
    });
    // Add cache test where the same parameters are calculated a huge number of times.
});