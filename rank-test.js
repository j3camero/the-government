const assert = require('assert');
const rank = require('./rank');

describe('Rank', function() {
    it('Generate ideal ranks', () => {
	assert.deepEqual([], rank.GenerateIdealRanksSorted(0));
	assert.deepEqual([1], rank.GenerateIdealRanksSorted(1));
	assert.deepEqual([1, 2], rank.GenerateIdealRanksSorted(2));
	assert.deepEqual([1, 2, 3], rank.GenerateIdealRanksSorted(3));
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	    rank.GenerateIdealRanksSorted(12));
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(13));
	assert.deepEqual(
	    [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(14));
	assert.deepEqual(
	    [1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(15));
	assert.deepEqual(
	    [1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(16));
    });
    it('Generate ideal ranks (3000 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(3000);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[1]);
	assert.equal(1, ranks[658]);
	assert.equal(2, ranks[659]);
	assert.equal(2, ranks[660]);
	assert.equal(11, ranks[2996]);
	assert.equal(12, ranks[2997]);
	assert.equal(12, ranks[2998]);
	assert.equal(13, ranks[2999]);
    });
    it('Generate ideal ranks (100 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(100);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[9]);
	assert.equal(2, ranks[10]);
	assert.equal(4, ranks[39]);
	assert.equal(5, ranks[40]);
	assert.equal(5, ranks[48]);
	assert.equal(6, ranks[49]); // This case is a great test due to the rounding error switchoff.
	assert.equal(6, ranks[57]);
	assert.equal(7, ranks[58]);
	assert.equal(10, ranks[92]);
	assert.equal(11, ranks[93]);
	assert.equal(11, ranks[96]);
	assert.equal(12, ranks[97]);
	assert.equal(12, ranks[98]);
	assert.equal(13, ranks[99]);
  });
});
