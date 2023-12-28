const moment = require('./moment');

const chatroomId = '1188932067359211550';

async function Update() {
    const t = moment();
    if (t.isAfter('2024-01-03')) {
	// This code is in development and needs to be updated before the next election.
	return;
    }
    if (t.isAfter('2024-01-02')) {
	// Delete election results message and hide the chatroom, if not already.
	return;
    }
    if (t.isAfter('2024-01-01')) {
	// Post election results and delete ballots, if not already.
	return;
    }
    if (t.isAfter('2023-12-28')) {
	// Start election. Post ballots and unhide the chatroom, if not already.
	return;
    }
}

module.exports = {
    CheckReactionForPresidentialElectionVote,
    Update,
};
