const assert = require('assert');
const rank = require('./rank');

describe('Rank', function() {
  it('Generate ideal ranks', () => {
    assert.deepEqual([], rank.GenerateIdealRanks(0));
    assert.deepEqual([1], rank.GenerateIdealRanks(1));
    assert.deepEqual([1, 2], rank.GenerateIdealRanks(2));
    const ranks = rank.GenerateIdealRanks(3000);
    assert.equal(1, ranks[0]);
    assert.equal(2, ranks[1]);
    assert.deepEqual([2, 1, 1, 1, 1, 1], ranks.slice(1534, 1540));
  });
  it('Generate ideal ranks (sorted)', () => {
    const ranks = rank.GenerateIdealRanksSorted(100);
    assert.equal(1, ranks[0]);
    assert.equal(11, ranks[99]);
  });
  it('RangeRepeat', () => {
    assert.deepEqual([], rank.RangeRepeat(0, 0));
    assert.deepEqual([], rank.RangeRepeat(0, 1));
    assert.deepEqual([], rank.RangeRepeat(1, 0));
    assert.deepEqual([1], rank.RangeRepeat(1, 1));
    assert.deepEqual([1, 1], rank.RangeRepeat(1, 2));
    assert.deepEqual([1, 1, 1], rank.RangeRepeat(1, 3));
    assert.deepEqual([1, 2], rank.RangeRepeat(2, 1));
    assert.deepEqual([1, 2, 1, 2], rank.RangeRepeat(2, 2));
    assert.deepEqual([1, 2, 1, 2, 1, 2, 1, 2, 1, 2], rank.RangeRepeat(2, 5));
    assert.deepEqual([1, 2, 3, 1, 2, 3], rank.RangeRepeat(3, 2));
  });
});
