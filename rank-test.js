const assert = require('assert');
const rank = require('./rank');

describe('Rank', function() {
    it('Generate ideal ranks', () => {
	assert.deepEqual([], rank.GenerateIdealRanksSorted(0));
	assert.deepEqual([14], rank.GenerateIdealRanksSorted(1));
	assert.deepEqual([13, 14], rank.GenerateIdealRanksSorted(2));
	assert.deepEqual([1, 13, 14], rank.GenerateIdealRanksSorted(3));
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14],
	    rank.GenerateIdealRanksSorted(12));
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14],
	    rank.GenerateIdealRanksSorted(13));
	// First the ranks go up to 14.
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
	    rank.GenerateIdealRanksSorted(14));
	// Next, they wrap around to 1 again.
	assert.deepEqual(
	    [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
	    rank.GenerateIdealRanksSorted(15));
	assert.deepEqual(
	    [1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
	    rank.GenerateIdealRanksSorted(16));
	// The rank counts back up to 12, but not to 13.
	assert.deepEqual(
	    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
	     8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14],
	    rank.GenerateIdealRanksSorted(25));
	// Then wraps back around to 1 again.
	assert.deepEqual(
	    [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
	     8, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14],
	    rank.GenerateIdealRanksSorted(26));
    });
    it('Generate ideal ranks (3000 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(3000);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[1]);
	assert.equal(1, ranks[987]);
	assert.equal(2, ranks[988]);
	assert.equal(2, ranks[1974]);
	assert.equal(3, ranks[1975]);
	assert.equal(10, ranks[2994]);
	assert.equal(11, ranks[2995]);
	assert.equal(11, ranks[2996]);
	assert.equal(12, ranks[2997]);
	assert.equal(13, ranks[2998]);
	assert.equal(14, ranks[2999]);
    });
    it('Generate ideal ranks (100 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(100);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[10]);
	assert.equal(2, ranks[11]);
	assert.equal(3, ranks[32]);
	assert.equal(4, ranks[33]);
	assert.equal(4, ranks[42]);
	assert.equal(5, ranks[43]); // This case is a great test due to the rounding error switchoff.
	assert.equal(10, ranks[94]);
	assert.equal(11, ranks[95]);
	assert.equal(11, ranks[96]);
	assert.equal(12, ranks[97]);
	assert.equal(13, ranks[98]);
	assert.equal(14, ranks[99]);
  });
});
