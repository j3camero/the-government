const assert = require('assert');
const fs = require('fs');
const rank = require('./rank');
const sampleChainOfCommand = require('./sample-chain-of-command');

describe('Rank', function() {
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
	    1: { id: 1, boss: 2, rank: 1 },  // Vice President.
	});
    });
    it('3 person chain of command', () => {
	const presidentID = 2;
	const candidates = [1, 2, 3];
	const relationships = [
	    {lo_user_id: 2, hi_user_id: 3, discounted_diluted_seconds: 7},
	];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    2: { id: 2, children: [3], rank: 0 },  // President.
	    3: { id: 3, boss: 2, children: [1], rank: 1 },  // Vice President.
	    1: { id: 1, boss: 3, rank: 2 },  // General 4.
	});
    });
    it('4 person chain of command', () => {
	const presidentID = 4;
	const candidates = [1, 2, 3, 4];
	const relationships = [
	    {lo_user_id: 3, hi_user_id: 4, discounted_diluted_seconds: 7},
	];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    4: { id: 4, children: [3], rank: 0 },  // President.
	    3: { id: 3, boss: 4, children: [1, 2], rank: 1 },  // Vice President.
	    1: { id: 1, boss: 3, rank: 2 },  // General 4.
	    2: { id: 2, boss: 3, rank: 2 },  // General 4.
	});
    });
    it('9 person chain of command', () => {
	const presidentID = 3;
	const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9];
	const relationships = [
	    {lo_user_id: 2, hi_user_id: 3, discounted_diluted_seconds: 1},
	    {lo_user_id: 1, hi_user_id: 2, discounted_diluted_seconds: 1},
	    {lo_user_id: 2, hi_user_id: 4, discounted_diluted_seconds: 1},
	];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	assert.deepEqual(chain, {
	    3: { id: 3, children: [2], rank: 0 },  // President.
	    2: { id: 2, boss: 3, children: [1, 4], rank: 1 },  // Vice President.
	    1: { id: 1, boss: 2, children: [7, 8], rank: 2 },  // General 4.
	    4: { id: 4, boss: 2, children: [5, 6], rank: 2 },  // General 4.
	    5: { id: 5, boss: 4, rank: 3 },  // General 3.
	    6: { id: 6, boss: 4, rank: 3 },  // General 3.
	    7: { id: 7, boss: 1, rank: 3 },  // General 3.
	    8: { id: 8, boss: 1, children: [9], rank: 3 },  // General 3.
	    9: { id: 9, boss: 8, rank: 4 },  // General 2.
	});
    });
    it('Chain of command with real data snapshot', () => {
	// List of users from the dataset, minus a few characters who are now banned.
	const candidates = [
	    6, 42, 38, 7, 77, 60, 32, 8, 97, 56, 4, 9, 55, 80, 147, 148, 47, 86,
	    126, 35, 117, 31, 193, 135, 143, 83, 92, 44, 14, 18, 5, 91, 113, 45, 53,
	    26, 187, 95, 119, 136, 28, 25, 183, 192, 133, 68, 195, 78, 220, 46, 39, 203,
	    198, 34, 101, 157, 138, 223, 23, 145, 87, 66, 137, 210, 10, 213, 224, 226,
	    114, 202, 134, 20, 215, 58, 104, 98, 201, 196, 19, 194, 188, 76, 207, 211,
	    227, 132, 199, 36, 89, 204, 96, 11, 191, 85, 205, 225, 52, 212, 40, 141, 62,
	    59, 142, 94, 29, 206,
	];
	// Dear Leader #6!
	const presidentID = 6;
	// Read 1000+ relationship records from a file. These are a real snapshot of
	// the time matrix.
	const relationships = [];
	const fileText = fs.readFileSync('sample-time-matrix.csv', 'UTF-8');
	const lines = fileText.split(/\r?\n/);
	lines.forEach((line) => {
	    const tokens = line.split(',');
	    if (tokens.length !== 3) {
		return;
	    }
	    relationships.push({
		lo_user_id: parseInt(tokens[0]),
		hi_user_id: parseInt(tokens[1]),
		discounted_diluted_seconds: parseFloat(tokens[2]),
	    });
	});
	// Make sure we read the expected amount of data.
	assert.equal(relationships.length, 1181);
	// Calculate the chain of command.
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships);
	// Compare the chain of command to one stored in a file. This tests that
	// the algorithm is deterministic.
	assert.deepEqual(chain, sampleChainOfCommand);
    });
    it('Render the chain of command as an image', () => {
	const nicknames = {
	    6: 'Brobob',
	    7: 'Jeff',
	    32: 'Ssulfur',
	    38: 'watergate',
	    42: 'Cheatx',
	    77: 'Zomboscott',
	};
	const canvas = rank.RenderChainOfCommand(sampleChainOfCommand, nicknames);
	const buf = canvas.toBuffer();
	fs.writeFileSync('sample-chain-of-command-tmp.png', buf);
	// Compare the image data to the expected output file.
	//const expected = fs.readFileSync('sample-chain-of-command.png');
	//assert(buf.equals(expected));
    });
    it('Term limits', () => {
	const presidentID = 2;
	const candidates = [1, 2, 3];
	const relationships = [
	    {lo_user_id: 2, hi_user_id: 3, discounted_diluted_seconds: 7},
	];
	const termLimited = [3];
	const chain = rank.CalculateChainOfCommand(presidentID, candidates, relationships, termLimited);
	assert.deepEqual(chain, {
	    2: { id: 2, children: [1], rank: 0 },  // President.
	    1: { id: 1, boss: 2, children: [3], rank: 1 },  // Vice President.
	    3: { id: 3, boss: 1, rank: 2 },  // General 4.
	});
    });
    it('Relationships to time matrix', () => {
	const candidates = [1, 2, 3];
	const relationships = [
	    {lo_user_id: 1, hi_user_id: 2, discounted_diluted_seconds: 7},
	];
	const matrix = rank.ConvertRelationshipsToTimeMatrix(relationships, candidates);
	// Users 1 and 2 have the same relationships as in the input.
	assert.equal(matrix[1][2], 7);
	// The other 2 relationships get tiny subsidies.
	assert(matrix[1][3] > 0);
	assert(matrix[2][3] > 0);
	// The subsidies should all be different, to break symmetries.
	assert(matrix[1][3] !== matrix[2][3]);
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
    it('Copy and filter', () => {
	assert.deepEqual(rank.CopyAndFilter([], []), []);
	assert.deepEqual(rank.CopyAndFilter([], [1]), []);
	assert.deepEqual(rank.CopyAndFilter([1], []), [1]);
	assert.deepEqual(rank.CopyAndFilter([1, 2, 3], []), [1, 2, 3]);
	assert.deepEqual(rank.CopyAndFilter([1, 2, 3], [1]), [2, 3]);
	assert.deepEqual(rank.CopyAndFilter([1, 2, 3], [2]), [1, 3]);
	assert.deepEqual(rank.CopyAndFilter([1, 2, 3], [3]), [1, 2]);
	assert.deepEqual(rank.CopyAndFilter(['a', 'b', 'c'], ['b']), ['a', 'c']);
	assert.deepEqual(rank.CopyAndFilter([2, 4, 6, 8], [4, 6]), [2, 8]);
	assert.deepEqual(rank.CopyAndFilter([2, 4, 6, 8], [4, 6, 2, 8, 1, 3]), []);
	assert.deepEqual(rank.CopyAndFilter([2, 4, 6, 8], [2, 6, 8]), [4]);
    });
    it('Superiors null case', () => {
	assert.deepEqual(rank.GetSuperiorIDs(null, null), []);
    });
    it('Superiors minimal case', () => {
	const chain = {
	    4: { id: 4 },
	};
	assert.deepEqual(rank.GetSuperiorIDs(4, chain), [4]);
    });
    it('Superiors one boss', () => {
	const chain = {
	    4: { id: 4 },
	    7: { id: 7, boss: 4 },
	};
	assert.deepEqual(rank.GetSuperiorIDs(7, chain), [4, 7]);
	assert.deepEqual(rank.GetSuperiorIDs(4, chain), [4]);
    });
    it('Superiors two bosses', () => {
	const chain = {
	    4: { id: 4, boss: 5 },
	    5: { id: 5 },
	    7: { id: 7, boss: 4 },
	};
	assert.deepEqual(rank.GetSuperiorIDs(7, chain), [5, 4, 7]);
	assert.deepEqual(rank.GetSuperiorIDs(4, chain), [5, 4]);
	assert.deepEqual(rank.GetSuperiorIDs(5, chain), [5]);
    });
    it('Superiors branch', () => {
	const chain = {
	    4: { id: 4, boss: 7 },
	    5: { id: 5, boss: 7 },
	    7: { id: 7 },
	};
	assert.deepEqual(rank.GetSuperiorIDs(7, chain), [7]);
	assert.deepEqual(rank.GetSuperiorIDs(4, chain), [7, 4]);
	assert.deepEqual(rank.GetSuperiorIDs(5, chain), [7, 5]);
    });
    it('Matchmaking choose the only option', () => {
	const chain = {
	    4: { id: 4 },
	};
	const bosses = [chain[4]];
	const candidates = [7];
	const timeMatrix = {
	    4: {
		7: 1,
	    },
	};
	const match = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 2);
	assert.equal(match.bossID, 4);
	assert.equal(match.minionID, 7);
    });
    it('Matchmaking choose the best boss', () => {
	const chain = {
	    4: { id: 4 },
	    5: { id: 5 },
	};
	const bosses = [chain[4], chain[5]];
	const candidates = [7];
	const timeMatrix = {
	    4: {
		7: 1,
	    },
	    5: {
		7: 2,  // Strongest relationship.
	    },
	};
	const match = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 2);
	assert.equal(match.bossID, 5);
	assert.equal(match.minionID, 7);
    });
    it('Matchmaking choose the best minion', () => {
	const chain = {
	    5: { id: 5 },
	};
	const bosses = [chain[5]];
	const candidates = [7, 8];
	const timeMatrix = {
	    5: {
		7: 2,
		8: 3,  // Strongest relationship.
	    },
	};
	const match = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 2);
	assert.equal(match.bossID, 5);
	assert.equal(match.minionID, 8);
    });
    it('Matchmaking skip level override', () => {
	const chain = {
	    5: { id: 5 },
	    6: { id: 6, boss: 5 },
	    7: { id: 7, boss: 5 },
	    8: { id: 8, boss: 6 },
	    9: { id: 9, boss: 7 },
	};
	const bosses = [chain[8], chain[9]];
	const candidates = [2];
	const timeMatrix = {
	    2: {
		5: 1,
		6: 2,
		7: 4,
		8: 6,  // Strongest single relationship, but gets overridden by #7 + #9.
		9: 5,  // Choose this because #7 + #9 > #6 + #8 despite weaker direct bond.
	    },
	};
	const match = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 2);
	assert.equal(match.bossID, 9);
	assert.equal(match.minionID, 2);
    });
    it('Matchmaking full boss', () => {
	const chain = {
	    1: { id: 1, children: [2] },
	    2: { id: 2, boss: 1 },
	    3: { id: 3 },
	};
	const bosses = [chain[1], chain[3]];
	const candidates = [4];
	const timeMatrix = {
	    1: {
		4: 2,  // Strongest relationship, but boss 1 already has too many children.
	    },
	    3: {
		4: 1,  // Weaker relationship, but this is the only available boss.
	    },
	};
	// When constrained, we fall back to the second choice.
	const a = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 1);
	assert.equal(a.bossID, 3);
	assert.equal(a.minionID, 4);
	// When unconstrained, the first choice is picked.
	const b = rank.SelectBestMatch(bosses, candidates, timeMatrix, chain, 2);
	assert.equal(b.bossID, 1);
	assert.equal(b.minionID, 4);
    });
    it('Limit max children 1:1', () => {
	const bosses = [
	    { children: [] },
	];
	const limit = rank.LimitMaxChildren(1, bosses);
	assert.equal(limit, 1);
    });
    it('Limit max children 2:1 with zero children', () => {
	const bosses = [
	    { children: [] },
	];
	const limit = rank.LimitMaxChildren(2, bosses);
	assert.equal(limit, 2);
    });
    it('Limit max children 2:1 with 1 child', () => {
	const bosses = [
	    { children: [1] },
	];
	const limit = rank.LimitMaxChildren(2, bosses);
	assert.equal(limit, 3);
    });
    it('Limit max children 2 bosses', () => {
	const bosses = [
	    { children: [] },
	    { children: [] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses), 1);
	assert.equal(rank.LimitMaxChildren(2, bosses), 1);
	assert.equal(rank.LimitMaxChildren(3, bosses), 2);
	assert.equal(rank.LimitMaxChildren(4, bosses), 2);
	assert.equal(rank.LimitMaxChildren(5, bosses), 3);
    });
    it('Limit max children 2 bosses and 1 existing child', () => {
	const bosses = [
	    { children: [1] },
	    { children: [] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses), 1);
	assert.equal(rank.LimitMaxChildren(2, bosses), 2);
	assert.equal(rank.LimitMaxChildren(3, bosses), 2);
	assert.equal(rank.LimitMaxChildren(4, bosses), 3);
	assert.equal(rank.LimitMaxChildren(5, bosses), 3);
    });
    it('Limit max children 2 bosses with 2 children', () => {
	const bosses = [
	    { children: [1, 2] },
	    { children: [] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses), 1);
	assert.equal(rank.LimitMaxChildren(2, bosses), 2);
	assert.equal(rank.LimitMaxChildren(3, bosses), 3);
	assert.equal(rank.LimitMaxChildren(4, bosses), 3);
	assert.equal(rank.LimitMaxChildren(5, bosses), 4);
    });
    it('Limit max children 2 bosses with 1 child each', () => {
	const bosses = [
	    { children: [1] },
	    { children: [2] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses), 2);
	assert.equal(rank.LimitMaxChildren(2, bosses), 2);
	assert.equal(rank.LimitMaxChildren(3, bosses), 3);
	assert.equal(rank.LimitMaxChildren(4, bosses), 3);
	assert.equal(rank.LimitMaxChildren(5, bosses), 4);
    });
    it('Limit max children 2 bosses 3 children', () => {
	const bosses30 = [
	    { children: [1, 2, 3] },
	    { children: [] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses30), 1);
	assert.equal(rank.LimitMaxChildren(2, bosses30), 2);
	assert.equal(rank.LimitMaxChildren(3, bosses30), 3);
	assert.equal(rank.LimitMaxChildren(4, bosses30), 4);
	assert.equal(rank.LimitMaxChildren(5, bosses30), 4);
	const bosses21 = [
	    { children: [1, 2] },
	    { children: [3] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses21), 2);
	assert.equal(rank.LimitMaxChildren(2, bosses21), 3);
	assert.equal(rank.LimitMaxChildren(3, bosses21), 3);
	assert.equal(rank.LimitMaxChildren(4, bosses21), 4);
	assert.equal(rank.LimitMaxChildren(5, bosses21), 4);
    });
    it('Limit max children 3 bosses', () => {
	const bosses = [
	    { children: [1, 2, 3] },
	    { children: [4] },
	    { children: [] },
	];
	assert.equal(rank.LimitMaxChildren(1, bosses), 1);
	assert.equal(rank.LimitMaxChildren(2, bosses), 2);
	assert.equal(rank.LimitMaxChildren(3, bosses), 2);
	assert.equal(rank.LimitMaxChildren(4, bosses), 3);
	assert.equal(rank.LimitMaxChildren(5, bosses), 3);
	assert.equal(rank.LimitMaxChildren(6, bosses), 4);
	assert.equal(rank.LimitMaxChildren(7, bosses), 4);
	assert.equal(rank.LimitMaxChildren(8, bosses), 4);
	assert.equal(rank.LimitMaxChildren(9, bosses), 5);
    });
    it('Calculate subordinates', () => {
	const chain = {
	    1: { id: 1, children: [2] },
	    2: { id: 2, children: [3, 4] },
	    3: { id: 3 },
	    4: { id: 4 },
	};
	assert.equal(rank.GetSubordinates(chain, 1).length, 4);
	assert.equal(rank.GetSubordinates(chain, 2).length, 3);
	assert.equal(rank.GetSubordinates(chain, 3).length, 1);
	assert.equal(rank.GetSubordinates(chain, 4).length, 1);
    });
});
