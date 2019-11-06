
function GenerateIdealRanksSorted(n) {
    const ranks = [];
    let remaining = n;
    let maxOccupants = 1;
    for (let r = 13; r > 0; --r) {
	const equalSlice = Math.floor(remaining / r);
	const howMany = Math.min(equalSlice, maxOccupants);
	for (let j = 0; j < howMany; ++j) {
	    ranks.push(r);
	}
	maxOccupants *= 2;
	remaining -= howMany;
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
    {index: 12, title: 'Marshal', insignia: '★★★★★', role: 'Marshal'},
    {index: 13, title: 'Mr. President', insignia: '★★★★★★★', role: 'Marshal'},
];

module.exports = {
    GenerateIdealRanksSorted,
    metadata,
};
