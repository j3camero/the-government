
function GenerateIdealRanksSorted(n) {
    // President, VP, and Generals.
    const ranks = [
	13, 12,
	11, 11,
	10, 10, 10,
	9, 9, 9, 9,
	8, 8, 8, 8, 8
    ];
    if (n <= ranks.length) {
	return ranks.slice(0, n).reverse();
    }
    // Officers and Grunts: same number at each rank.
    let remaining = n - ranks.length;
    for (let r = 7; r > 0; --r) {
	const equalSlice = Math.floor(remaining / r);
	for (let j = 0; j < equalSlice; ++j) {
	    ranks.push(r);
	}
	remaining -= equalSlice;
    }
    return ranks.reverse();
}

const metadata = [
    {index: 0, title: 'n00b', insignia: '(n00b)', role: null},
    {index: 1, title: 'Recruit', insignia: '●', role: 'Grunt'},
    {index: 2, title: 'Corporal', insignia: '●●', role: 'Grunt'},
    {index: 3, title: 'Sergeant', insignia: '●●●', role: 'Grunt'},
    {index: 4, title: 'Lieutenant', insignia: '●', role: 'Officer'},
    {index: 5, title: 'Captain', insignia: '●●', role: 'Officer'},
    {index: 6, title: 'Major', insignia: '●●●', role: 'Officer'},
    {index: 7, title: 'Colonel', insignia: '●●●●', role: 'Officer'},
    {index: 8, title: 'General', insignia: '★', role: 'General'},
    {index: 9, title: 'General', insignia: '★★', role: 'General'},
    {index: 10, title: 'General', insignia: '★★★', role: 'General'},
    {index: 11, title: 'General', insignia: '★★★★', role: 'General'},
    {index: 12, title: 'Mr. Vice President', insignia: '⚑', role: 'Marshal', nicknameOverride: 'Mr. Vice President'},
    {index: 13, title: 'Mr. President', insignia: '⚑', role: 'Marshal', nicknameOverride: 'Mr. President'},
];

module.exports = {
    GenerateIdealRanksSorted,
    metadata,
};
