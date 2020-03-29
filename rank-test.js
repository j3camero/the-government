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
    it('Chain of command with zero users', () => {
	const presidentID = 0;
	const candidates = [];
	const relationships = [];
	assert.throws(() => {
	    rank.CalculateChainOfCommand(presidentID, candidates, relationships)
	});
    });
    it('1 person chain of command', () => {
	const presidentID = 7;
	const candidates = [7];
	const relationships = [];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    7: { id: 7, rank: 0 },  // President.
	});
    });
    it('2 person chain of command', () => {
	const presidentID = 2;
	const candidates = [1, 2];
	const relationships = [
	    {lo_user_id: 1, hi_user_id: 2, discounted_diluted_seconds: 7},
	];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    2: { id: 2, children: [1], rank: 0 },  // President.
	    1: { id: 1, boss: 2, rank: 1, },  // Vice President.
	});
    });
    it('3 person chain of command', () => {
	const presidentID = 2;
	const candidates = [1, 2, 3];
	const relationships = [];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    2: { id: 2, children: [1], rank: 0 },  // President.
	    1: { id: 1, boss: 2, children: [3], rank: 1, },  // Vice President.
	    3: { id: 3, boss: 1, rank: 2, },  // General 4.
	});
    });
    it('Remove element from array by value', () => {
	// Zero case.
	assert.deepEqual(rank.RemoveByValue([], 1), []);
	// Remove one item.
	assert.deepEqual(rank.RemoveByValue([2], 2), []);
	// Typical case.
	assert.deepEqual(rank.RemoveByValue([3, 5, 7, 9], 7), [3, 5, 9]);
	// Only remove the first occurrence.
	assert.deepEqual(rank.RemoveByValue([1, 2, 3, 1, 2, 3], 3), [1, 2, 1, 2, 3]);
	// Don't remove missing items.
	assert.deepEqual(rank.RemoveByValue([7, 8, 9], 6), [7, 8, 9]);
	// Different types.
	assert.deepEqual(rank.RemoveByValue(['abc', 'def', 'xyz'], 'def'), ['abc', 'xyz']);
	assert.deepEqual(rank.RemoveByValue(['abc', 15, false], false), ['abc', 15]);
	// Modify the original array in-place.
	const arr = [1, 2, 3];
	rank.RemoveByValue(arr, 2);
	assert.deepEqual(arr, [1, 3]);
    });
});
