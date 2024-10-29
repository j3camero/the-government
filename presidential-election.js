const DiscordUtil = require('./discord-util');
const RustCalendar = require('./rust-calendar');
const UserCache = require('./user-cache');

// The ID of the #president-vote chat channel.
const channelId = '1299963218265116753';

// The most important feature of the Presidential Election is that it is a cycle.
// The cycle has 3 phases: presidency, vacant, and election. Rinse repeat.
// The cycle and the phases are tied to the Thursdays at 18:00 UTC because
// that is the moment of the "wipe" in Rust.
function CalculateCurrentPhaseOfElectionCycle() {
    const weekOfMonth = RustCalendar.CalculateCurrentWeekOfTheMonth();
    const weeksThisMonth = RustCalendar.CalculateHowManyThursdaysThisMonth();
    if (weeksThisMonth === 4) {
	if (weekOfMonth === 0) return 'presidency';
	if (weekOfMonth === 1) return 'presidency';
	if (weekOfMonth === 2) return 'vacant';
	if (weekOfMonth === 3) return 'election';
	if (weekOfMonth === 4) return 'presidency';
    }
    if (weeksThisMonth === 5) {
	if (weekOfMonth === 0) return 'presidency';
	if (weekOfMonth === 1) return 'presidency';
	if (weekOfMonth === 2) return 'vacant';
	if (weekOfMonth === 3) return 'vacant';
	if (weekOfMonth === 4) return 'election';
	if (weekOfMonth === 5) return 'presidency';
    }
    throw 'Something went wrong with a Rust calendar calculation';
}

// This function is polled as often as once per minute.
async function UpdatePresidentialElection() {
    const phase = CalculateCurrentPhaseOfElectionCycle();
    console.log('Presidential election phase:', phase);
    if (phase === 'presidency') {
	return UpdatePresidencyPhase();
    }
    if (phase === 'vacant') {
	return UpdateVacantPhase();
    }
    if (phase === 'election') {
	return UpdateElectionPhase();
    }
    throw `Invalid election phase`;
}

// During the presidency phase of the cycle, no vote state changes.
// We still have to count the votes and award the presidency once just
// in case the bot was down during the final moments of the election phase
// and some last-minute votes arrived. After covering that edge case, there
// is no further reason to count the votes a second or third time because
// the result will not change. We use this flag to keep track. NB: the flag
// has to be set to true once the presidency phase has been updated once,
// but also don't forget that it has to be flipped back to false during
// another phase. Otherwise the bot may run for months at a time but this
// flag needs to get reset at some point during the election cycle.
let presidencyPhaseUpdated = false;

// Handle routine updates during the presidency phase of the cycle.
async function UpdatePresidencyPhase() {
    if (presidencyPhaseUpdated) {
	return;
    }
    presidencyPhaseUpdated = true;
    return CountVotesAndAwardPresidency();
}

// Handle routine updates during the vacant phase of the cycle.
// TODO: only do this update once, like the presidency phase does.
async function UpdateVacantPhase() {
    presidencyPhaseUpdated = false;
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	// Fire Mr. President and Mr. Vice President.
	cu.setOffice(null);
	// Delete votes.
	cu.setPresidentialElectionVote(null);
	// Delete candidates.
	cu.setPresidentialElectionMessageId(null);
    }
}

// Handle routine updates during the election phase of the cycle.
async function UpdateElectionPhase() {
    console.log('UpdateElectionPhase');
    presidencyPhaseUpdated = false;
    if (IsElectionStarted()) {
	return ProcessLostVotes();
    } else {
	return InitElection();
    }
}

// Determines whether an election is already underway by peeking into the database
// to look for votes, candidates, or a winner. If none are found then no election is
// underway.
function IsElectionStarted() {
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	if (user.office || user.presidential_election_vote || user.presidential_election_message_id) {
	    return true;
	}
    }
    return false;
}

// Collect and process lost votes (reactions) that were cast while the bot was down.
async function ProcessLostVotes() {
    console.log('ProcessLostVotes');
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
	console.log('Failed to find the president-vote channel.');
	return;
    }
    const lostVotes = [];
    const messages = await channel.messages.fetch();
    for (const [messageId, message] of messages) {
	await message.fetch();
	for (const [reactionId, reaction] of message.reactions.cache) {
	    let reactions;
	    try {
		reactions = await reaction.users.fetch();
	    } catch (error) {
		console.log('Warning: problem fetching votes!');
		reactions = [];
	    }
	    for (const [voterId, voter] of reactions) {
		if (!voter.bot) {
		    lostVotes.push({ reaction, voter });
		}
	    }
	}
    }
    for (const vote of lostVotes) {
	await CheckReactionForPresidentialVote(vote.reaction, vote.voter, false);
	break;  // Stop after processing 1 vote for now in case there's a lot of lost votes.
    }
}

// Returns the unix timestamp of the end of the election phase.
function CalculateUnixTimestampOfElectionEndForThisMonth() {
    const thursdays = RustCalendar.CalculateArrayOfAllThursdayEpochsThisMonth();
    const n = thursdays.length;
    return thursdays[n - 1];
}

// Start the election phase of the cycle. Print the ballot and wire up all the buttons for voting.
async function InitElection() {
    console.log('InitElection');
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
	console.log('Failed to find the president-vote channel.');
	return;
    }
    const electionEndTimestamp = CalculateUnixTimestampOfElectionEndForThisMonth();
    await channel.send(`**Presidential Election**\nThe vote ends <t:${electionEndTimestamp}:R>`);
    const generalRankUsers = await UserCache.GetTopRankedUsers(20);
    for (const user of generalRankUsers) {
	if (user.commissar_id === 7) {
	    continue;
	}
	const name = user.getNickname();
	const message = await channel.send(`**${name}**`);
	await message.react('✅');
	await user.setPresidentialElectionMessageId(message.id);
    }
}

// Returns a commissar user for an election candidate by message ID.
// Context: voting buttons in discord are reactions that hang off of
// a discord message. When a reaction comes in, we look up the candidate
// using the message ID. Returns null of the message is not a voting button.
function GetCandidateByMessageId(messageId) {
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	if (user.presidential_election_message_id === messageId) {
	    return user;
	}
    }
    return null;
}

// Checks to see if a reaction is an incoming vote in the presidential election.
// Not all reactions are votes. They can be any reaction to any message. If it
// is a vote, then record it in the database so that it can be counted and the
// standings updated.
async function CheckReactionForPresidentialVote(reaction, discordUser, notifyVoter) {
    if (discordUser.bot) {
	return;
    }
    if (reaction.message.channelId !== channelId) {
	return;
    }
    console.log('President vote detected');
    const candidate = GetCandidateByMessageId(reaction.message.id);
    if (!candidate) {
	console.log('Vote detected but could not determine for which candidate.');
	return;
    }
    const voter = await UserCache.GetCachedUserByDiscordId(discordUser.id);
    if (!voter) {
	console.log('Vote detected but could not identify the voter who cast it.');
	return;
    }
    await reaction.users.remove(discordUser);
    const firstVote = voter.presidential_election_vote ? false : true;
    await voter.setPresidentialElectionVote(candidate.commissar_id);
    await CountVotesAndAwardPresidency();
    if (!notifyVoter) {
	return;
    }
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const voterMember = await guild.members.fetch(voter.discord_id);
    if (voterMember) {
	if (firstVote) {
	    await voterMember.send('Your vote has been counted');
	} else {
	    await voterMember.send('Your vote has been updated');
	}
    }
}

// Count the votes that are recorded in the database, award the top
// titles, and update the vote tally visualization.
async function CountVotesAndAwardPresidency() {
    console.log('CountVotesAndAwardPresidency');
    const voteList = {};
    const voteSum = {};
    let voteCount = 0;
    let maxSum = 0;
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	const v = user.presidential_election_vote;
	if (v) {
	    const r = user.rank;
	    const color = user.getRankColor();
	    const weight = user.getVoteWeight();
	    if (!(v in voteSum)) {
		voteSum[v] = 0;
		voteList[v] = [];
	    }
	    voteSum[v] += weight;
	    voteList[v].push({ color, weight });
	    voteCount++;
	    maxSum = Math.max(voteSum[v], maxSum);
	}
    }
    if (!voteCount) {
	return;
    }
    const sortableCandidates = [];
    for (const candidate in voteList) {
	voteList[candidate].sort((a, b) => (a.weight - b.weight));
	const s = voteSum[candidate] || 0;
	if (!s) {
	    continue;
	}
	const cu = UserCache.GetCachedUserByCommissarId(candidate);
	sortableCandidates.push({
	    label: cu.getNickname(),
	    tiebreaker: cu.rank_index,
	    totalVoteWeight: s,
	    votes: voteList[candidate],
	});
    }
    sortableCandidates.sort((a, b) => {
	const dw = a.totalVoteWeight - b.totalVoteWeight;
	if (Math.abs(dw) > 0.000001) {
	    return dw;
	}
	return b.tiebreaker - a.tiebreaker;  // rank index is the tiebreaker.
    });
    console.log(sortableCandidates);
    console.log(sortableCandidates[0].votes);
}

module.exports = {
    CheckReactionForPresidentialVote,
    UpdatePresidentialElection,
};
