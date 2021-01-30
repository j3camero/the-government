// Code for calculating the Chain of Command.
const metadata = [
    {
	count: 1,
	insignia: '⚑',
	role: 'Marshal',
	title: 'President',
	titleOverride: true,
    },
    {
	count: 1,
	insignia: '⚑',
	role: 'Marshal',
	title: 'Vice President',
	titleOverride: true,
    },
    {
	count: 2,
	insignia: '★★★★',
	role: 'General',
	title: 'General',
    },
    {
	count: 4,
	insignia: '★★★',
	role: 'General',
	title: 'General',
    },
    {
	count: 5,
	insignia: '★★',
	role: 'General',
	title: 'General',
    },
    {
	count: 6,
	insignia: '★',
	role: 'General',
	title: 'General',
    },
    {
	count: 7,
	insignia: '●●●●',
	role: 'Officer',
	title: 'Colonel',
    },
    {
	count: 9,
	insignia: '●●●',
	role: 'Officer',
	title: 'Major',
    },
    {
	count: 11,
	insignia: '●●',
	role: 'Officer',
	title: 'Captain',
    },
    {
	count: 13,
	insignia: '●',
	role: 'Officer',
	title: 'Lieutenant',
    },
    {
	count: 26,
	insignia: '●●●',
	role: 'Grunt',
	title: 'Sergeant',
    },
    {
	count: 52,
	insignia: '●●',
	role: 'Grunt',
	title: 'Corporal',
    },
    {
	count: 9999,
	insignia: '●',
	role: 'Grunt',
	title: 'Recruit',
    },
];

// Remove a value from an array by value.
// Modifies the original array in-place and also returns it.
// Only removes the first occurrence of the value.
function RemoveByValue(arr, valueToRemove) {
    const index = arr.indexOf(valueToRemove);
    if (index !== -1) {
	arr.splice(index, 1);
    }
    return arr;
}

// Return a copy of an array, with a list of values removed.
function CopyAndFilter(arr, valuesToRemove) {
    const c = arr.slice();
    valuesToRemove = valuesToRemove || [];
    valuesToRemove.forEach((v) => {
	RemoveByValue(c, v);
    });
    return c;
}

// Convert a flat list of relationship records into a matrix format
// keyed for efficient access by user ID.
//
// Pairs of candidates that have no recorded relationship are
// assigned a fraction of a second of credit depending on the
// closeness of their user IDs. This is done for symmetry-breaking
// and stability reasons. New or inactive users will attach to
// users who originally joined around the same time they did.
function ConvertRelationshipsToTimeMatrix(relationships, candidates) {
    const matrix = {};
    // First initialize every element of the matrix with a very small
    // subsidy for stability & symmetry-breaking.
    candidates.forEach((i) => {
	const row = {};
	candidates.forEach((j) => {
	    // The matrix is symmetric so only process the entries where i < j.
	    if (i >= j) {
		return;
	    }
	    // The maximum number of imaginary seconds that could
	    // theoretically be handed out by this formula. The
	    // subsidy is tiny, just enough to break the symmetries.
	    const maxSubsidy = 0.01;
	    // How close together are the two user IDs. This is a rough
	    // proxy for finding users that joined around the same date.
	    const howCloseTogether = 1 / (j - i);
	    // How senior is the most senior of the two users. This
	    // breaks the symmetry that would otherwise exist between
	    // different pairs of users whose IDs are separated by the
	    // same amount. The system will favor relationships between
	    // older users to ones between newer users.
	    const howSenior = Math.exp(-0.0000007 * i - 0.00000011 * j);
	    row[j] = maxSubsidy * howCloseTogether * howSenior;
	});
	if (Object.keys(row).length > 0) {
	    matrix[i] = row;
	}
    });
    // Overwrite the small subsidies with real data.
    relationships.forEach((r) => {
	if (candidates.includes(r.lo_user_id) && candidates.includes(r.hi_user_id)) {
	    matrix[r.lo_user_id][r.hi_user_id] = r.discounted_diluted_seconds;
	}
    });
    return matrix;
}

// Return a list of all this user's superiors' IDs, including their own.
function GetSuperiorIDs(userID, chain) {
    if (!userID) {
	return [];
    }
    const bossID = chain[userID].boss;
    const ids = GetSuperiorIDs(bossID, chain);
    ids.push(userID);
    return ids;
}

// Find the best match between a boss and a candidate.
//
// The matchmaker! This algorithm chooses everyone's boss.
// Chooses the boss and candidate with the maximum total
// time spent between the candidate and their new boss,
// the boss' boss, and so on up the chain. Maximizes the
// time spent between the candidate and the boss' entire
// "chain of command". Imagine that the whole chain of
// command gets a vote on who to choose next in line, not
// just the immediate boss.
//
// bosses - a list of objects with details of the bosses.
// candidates - a flat list of integer IDs.
// timeMatrix - a matrix of the time spent between each
//              pair of players.
// chain - the chain of command so far.
// maxChildren - ignore bosses with too many children.
//
// Returns the best match as an object like:
//   { bossID: 6, minionID: 7 }
function SelectBestMatch(bosses, candidates, timeMatrix, chain, maxChildren) {
    let hiScore;
    let bossID;
    let minionID;
    bosses.forEach((boss) => {
	if (boss.children && boss.children.length >= maxChildren) {
	    return;
	}
	const chainOfCommandIDs = GetSuperiorIDs(boss.id, chain);
	candidates.forEach((candID) => {
	    let score = 0;
	    chainOfCommandIDs.forEach((b) => {
		const lo = b < candID ? b : candID;
		const hi = b < candID ? candID : b;
		score += timeMatrix[lo][hi];
	    });
	    if (!hiScore || score > hiScore) {
		hiScore = score;
		bossID = boss.id;
		minionID = candID;
	    }
	});
    });
    return {
	bossID,
	minionID,
    };
}

// Calculate a maximum children limit for the bosses.
//
// This function's job is to stop the highest ranking bosses
// from filling up on all the minions, leaving none to the
// lower ranking bosses. It makes sure that the minions start
// spreading out to more bosses before they run critically
// short in supply.
function LimitMaxChildren(numMinionsLeftToChoose, bosses) {
    if (bosses.length <= 0) {
	return 0;
    }
    // Tally up a histogram of bosses by number of children.
    const histogram = {};
    bosses.forEach((boss) => {
	const numChildren = boss.children ? boss.children.length : 0;
	histogram[numChildren] = (histogram[numChildren] || 0) + 1;
    });
    // Fill the bosses from least children to most, stopping when there
    // are no minions left to choose. This is not really how the
    // selection process works - it's just how we calculate the max
    // number of children that the "fullest" boss should have.
    let cumulative = 0;
    let n = 0;
    while (numMinionsLeftToChoose > 0) {
	cumulative += histogram[n] || 0;
	numMinionsLeftToChoose -= cumulative;
	++n;
    }
    return n;
}

// Calculate chain of command.
//
//   - presidentID: the Commissar ID of the chosen President to head
//                  the chain of command.
//   - candidates: a list of integer user IDs to include in the ranking.
//   - relationships: a list of relationship records. Each record
//                    represents a relationship between a pair of
//                    people. Fields:
//                      - lo_user_id, hi_user_id: integer Commissar IDs
//                      - discounted_diluted_seconds: float (sec)
//   - termLimited: a list of Commissar IDs that are not allowed to be
//                  President or VP.
//
// Returns a dict of dicts representing the calculated chain of command.
// The outer dict is keyed by integer user ID. The inner records have
// these fields:
//   - id: integer Commissar ID.
//   - boss: integer Commissar ID of boss. undefined for Mr. President
//           to indicate that Mr. President has no boss.
//   - children: list of Commmisar IDs of direct children.
//   - rank: integer depth in the tree = rank assigned. Lower number
//           means higher rank.
//
// This function is pure ranking logic, with no connection to database
// calls or other external dependencies. It is unit-testable offline.
function CalculateChainOfCommand(presidentID, candidates, relationships, termLimited) {
    if (!candidates.includes(presidentID)) {
	throw new Error('Invalid Presidential candidate.');
    }
    const timeMatrix = ConvertRelationshipsToTimeMatrix(relationships, candidates);
    const chain = {};
    candidates.forEach((id) => {
	chain[id] = { id };
    });
    // Mr. President is the first boss.
    const mrPresident = chain[presidentID];
    mrPresident.rank = 0;
    RemoveByValue(candidates, presidentID);
    // Fill the ranks from top to bottom, choosing minions one by one.
    // When the minion rank fills up, the minions become the new bosses.
    // Then the selection process continues, filling up the next rank.
    let bosses = [mrPresident];
    let minions = [];
    let minionRank = 1;
    while (candidates.length > 0) {
	// Choose the next minion to add to the Chain of Command.
	const numMinionsLeftToChoose = Math.min(
	    metadata[minionRank].count - minions.length,
	    candidates.length);
	const maxChildren = LimitMaxChildren(numMinionsLeftToChoose, bosses);
	let eligibleCandidates = candidates;
	if (minionRank < 2) {
	    eligibleCandidates = CopyAndFilter(candidates, termLimited);
	}
	const pair = SelectBestMatch(bosses, eligibleCandidates, timeMatrix, chain, maxChildren);
	const boss = chain[pair.bossID];
	const minion = chain[pair.minionID];
	if (!minion) {
	    console.log('Eligible candidates:', eligibleCandidates, candidates);
	}
	minion.rank = minionRank;
	minions.push(minion);
	RemoveByValue(candidates, minion.id);
	// Associate the new minion with their chosen boss.
	minion.boss = boss.id;
	if (!boss.children) {
	    boss.children = [];
	}
	boss.children.push(minion.id);
	boss.children.sort();
	// If the minion rank has been filled, then the minions become the new bosses.
	if (minions.length >= metadata[minionRank].count) {
	    bosses = minions;
	    minions = [];
	    minionRank += 1;
	    if (minionRank >= metadata.length) {
		throw new Error('Not enough ranks for everyone! ' +
				'Add more space in the rank structure.');
	    }
	}
    }
    return chain;
}

// Get all subordinates of the user, including the user themselves, as a flat list.
function GetSubordinates(chain, userID) {
    const user = chain[userID];
    let subordinates = [user];
    const children = user.children || [];
    children.forEach((childID) => {
	const childSubordinates = GetSubordinates(chain, childID);
	subordinates = subordinates.concat(childSubordinates);
    });
    return subordinates;
}

module.exports = {
    CalculateChainOfCommand,
    ConvertRelationshipsToTimeMatrix,
    CopyAndFilter,
    GetSubordinates,
    GetSuperiorIDs,
    LimitMaxChildren,
    metadata,
    RemoveByValue,
    SelectBestMatch,
};
