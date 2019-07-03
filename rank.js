
function RangeRepeat(n, trials) {
  const r = [];
  for (let i = 1; i <= trials; ++i) {
    for (let j = 1; j <= n; ++j) {
      r.push(j);
    }
  }
  return r;
}

function GenerateIdealRanks(n) {
  // The first few dozen ranks are hard coded.
  const ranks = [
    1, 2, 3, 4, 5, 6, 7, 8,
    1, 2, 3, 4, 5, 6, 7, 9, 8,
    1, 2, 3, 4, 5, 6, 7, 10, 9, 8,
    1, 2, 3, 4, 5, 6, 7, 11, 10, 9, 8,
    1, 2, 3, 4, 5, 6, 7, 9, 8,
  ];
  if (n < ranks.length) {
    return ranks.slice(0, n);
  }
  ranks.push(...RangeRepeat(8, 3));
  // Keep adding ranks logarithmically.
  ranks.push(...RangeRepeat(7, 8));
  ranks.push(...RangeRepeat(6, 16));
  ranks.push(...RangeRepeat(5, 32));
  ranks.push(...RangeRepeat(4, 64));
  ranks.push(...RangeRepeat(3, 128));
  ranks.push(...RangeRepeat(2, 256));
  if (n < ranks.length) {
    return ranks.slice(0, n);
  }
  // When we run out of ranks, everyone extra is the lowest rank.
  while (ranks.length < n) {
    ranks.push(1);
  }
  return ranks;
}

function GenerateIdealRanksSorted(n) {
  const ranks = GenerateIdealRanks(n);
  return ranks.sort(function (a, b) { return a - b; });
}

module.exports = {
  GenerateIdealRanks,
  GenerateIdealRanksSorted,
  RangeRepeat,
};
