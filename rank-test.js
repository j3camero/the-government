const assert = require('assert');
const rank = require('./rank');

describe('Rank', function() {
  it('Generate ideal rank counts', () => {
    //assert.deepEqual([], rank.GenerateIdealRankCounts(0));
    assert.deepEqual([1], rank.GenerateIdealRankCounts(1));
  });
});
