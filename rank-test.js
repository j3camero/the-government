const assert = require('assert');
const rank = require('./rank');

describe('Rank', function() {
    it('Generate ideal ranks', () => {
	assert.deepEqual([], rank.GenerateIdealRanksSorted(0));
	assert.deepEqual([13], rank.GenerateIdealRanksSorted(1));
	assert.deepEqual([12, 13], rank.GenerateIdealRanksSorted(2));
	assert.deepEqual([11, 12, 13], rank.GenerateIdealRanksSorted(3));
	assert.deepEqual(
	    [8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(14));
	// All Generals.
	assert.deepEqual(
	    [8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(19));
	// Lowest officer/grunt ranks appear first.
	assert.deepEqual(
	    [1,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(20));
	assert.deepEqual(
	    [1, 2,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(21));
	// First the ranks go up to 7.
	assert.deepEqual(
	    [1, 2, 3, 4, 5, 6, 7,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(26));
	// Next, they wrap around to 1 again.
	assert.deepEqual(
	    [1, 1, 2, 3, 4, 5, 6, 7,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(27));
	assert.deepEqual(
	    [1, 1, 2, 2, 3, 4, 5, 6, 7,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(28));
	// Equal numbers at each Officer/Grunt rank.
	assert.deepEqual(
	    [1, 1, 1, 1, 1,
	     2, 2, 2, 2, 2,
	     3, 3, 3, 3, 3,
	     4, 4, 4, 4, 4,
	     5, 5, 5, 5,
	     6, 6, 6, 6,
	     7, 7, 7, 7,
	     8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 13],
	    rank.GenerateIdealRanksSorted(51));
    });
    it('Generate ideal ranks (3000 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(3000);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[1]);
	assert.equal(1, ranks[980]);
	assert.equal(2, ranks[981]);
	assert.equal(10, ranks[2994]);
	assert.equal(10, ranks[2995]);
	assert.equal(11, ranks[2996]);
	assert.equal(11, ranks[2997]);
	assert.equal(12, ranks[2998]);
	assert.equal(13, ranks[2999]);
    });
    it('Generate ideal ranks (100 case)', () => {
	const ranks = rank.GenerateIdealRanksSorted(100);
	assert.equal(1, ranks[0]);
	assert.equal(1, ranks[13]);
	assert.equal(2, ranks[14]);
	assert.equal(2, ranks[27]);
	assert.equal(3, ranks[28]);
	assert.equal(10, ranks[94]);
	assert.equal(10, ranks[95]);
	assert.equal(11, ranks[96]);
	assert.equal(11, ranks[97]);
	assert.equal(12, ranks[98]);
	assert.equal(13, ranks[99]);
  });
});
