
// Decision rule for simple majority.
function SimpleMajority(y, n) {
    if (y < 0 || n < 0) {
	throw 'Negative number of votes is not allowed.';
    }
    return y > n;
}

// Decision rule for supermajority.
function SuperMajority(y, n) {
    if (y < 0 || n < 0) {
	throw 'Negative number of votes is not allowed.';
    }
    if (y === 0 && n === 0) {
	return false;
    }
    return y >= 2 * n;
}

// Calculate how many more YES votes are needed to change the outcome.
function HowManyMoreYesVotes(y, n, DecisionRule) {
    if (DecisionRule(y, n)) {
	// Vote is already passing. Zero extra votes needed.
	return 0;
    }
    const maxExtraVotes = 2 * (y + n) + 2;
    for (let i = 0; i < maxExtraVotes; i++) {
	const outcome = DecisionRule(y + i, n);
	if (outcome) {
	    return i;
	}
    }
    return 0;
}

// Calculate how many more NO votes are needed to change the outcome.
function HowManyMoreNoVotes(y, n, DecisionRule) {
    if (!DecisionRule(y, n)) {
	// Vote is already rejected. Zero extra votes needed.
	return 0;
    }
    const maxExtraVotes = y + n + 1;
    for (let i = 0; i < maxExtraVotes; i++) {
	const outcome = DecisionRule(y, n + i);
	if (!outcome) {
	    return i;
	}
    }
    return 0;
}

// Calculate the minimum number of votes needed to change the outcome.
function VoteMargin(y, n, DecisionRule) {
    if (DecisionRule(y, n)) {
	return HowManyMoreNoVotes(y, n, DecisionRule);
    } else {
	return HowManyMoreYesVotes(y, n, DecisionRule);
    }
}

function ProbabilityOfVoteOutcomeChange(numVoters, yesVotes, noVotes, secondsSinceLastChange, DecisionRule) {

}

module.exports = {
    ProbabilityOfVoteOutcomeChange,
    SimpleMajority,
    SuperMajority,
    VoteMargin,
};
