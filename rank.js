
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

const metadata = [
    {index: 0, title: 'n00b', insignia: '(n00b)', role: null},
    {index: 1, title: 'Recruit', insignia: '●', role: 'Grunts'},
    {index: 2, title: 'Corporal', insignia: '●●', role: 'Grunts'},
    {index: 3, title: 'Sergeant', insignia: '●●●', role: 'Grunts'},
    {index: 4, title: 'Lieutenant', insignia: '●', role: 'Officers'},
    {index: 5, title: 'Captain', insignia: '●●', role: 'Officers'},
    {index: 6, title: 'Major', insignia: '●●●', role: 'Officers'},
    {index: 7, title: 'Colonel', insignia: '●●●●', role: 'Officers'},
    {index: 8, title: 'General', insignia: '★', role: 'Generals'},
    {index: 9, title: 'General', insignia: '★★', role: 'Generals'},
    {index: 10, title: 'General', insignia: '★★★', role: 'Generals'},
    {index: 11, title: 'General', insignia: '★★★★', role: 'Generals'},
];

module.exports = {
    GenerateIdealRanks,
    GenerateIdealRanksSorted,
    metadata,
    RangeRepeat,
};
