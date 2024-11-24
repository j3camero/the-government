const Canvas = require('canvas');
const DiscordUtil = require('./discord-util');
const moment = require('moment');
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
    //await CountVotesAndAwardPresidency();
}

// Handle routine updates during the vacant phase of the cycle.
// TODO: only do this update once, like the presidency phase does.
async function UpdateVacantPhase() {
    presidencyPhaseUpdated = false;
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	// Fire Mr. President and Mr. Vice President.
	user.setOffice(null);
	// Delete votes.
	user.setPresidentialElectionVote(null);
	// Delete candidates.
	user.setPresidentialElectionMessageId(null);
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
    // TODO: remove the 4 extra days after the first election cycle.
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
    const phase = CalculateCurrentPhaseOfElectionCycle();
    if (phase !== 'election') {
	// Ignore votes received outside the designated election phase.
	return;
    }
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

// Get the header message from the chat channel. Contains the title and vote tally.
async function FetchHeaderMessage() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const channel = await guild.channels.fetch(channelId);
    const messages = await channel.messages.fetch();
    for (const [messageId, message] of messages) {
	if (message.content.startsWith('**Presidential Election**')) {
	    return message;
	}
    }
    return null;
}

// Count the votes that are recorded in the database, award the top
// titles, and update the vote tally visualization.
async function CountVotesAndAwardPresidency() {
    console.log('CountVotesAndAwardPresidency');
    const voteList = {};
    const voteSum = {};
    let voteCount = 0;
    let validVoteCount = 0;
    let maxSum = 0;
    const users = UserCache.GetAllUsersAsFlatList();
    for (const user of users) {
	const v = user.presidential_election_vote;
	if (v) {
	    const r = user.rank;
	    let color = user.getRankColor();
	    if (color === '#189b17') {
		color = '#F4B400';
	    }
	    const weight = user.getVoteWeight();
	    if (!(v in voteSum)) {
		voteSum[v] = 0;
		voteList[v] = [];
	    }
	    voteCount++;
	    if (!user.ban_conviction_time) {
		validVoteCount++;
		voteSum[v] += weight;
		voteList[v].push({ color, weight });
		maxSum = Math.max(voteSum[v], maxSum);
	    }
	}
    }
    if (!validVoteCount) {
	return;
    }
    const sortableCandidates = [];
    for (const candidate in voteList) {
	voteList[candidate].sort((a, b) => (b.weight - a.weight));
	const s = voteSum[candidate] || 0;
	if (!s) {
	    continue;
	}
	const cu = UserCache.GetCachedUserByCommissarId(candidate);
	sortableCandidates.push({
	    commissar_id: cu.commissar_id,
	    label: cu.getNickname(),
	    tiebreaker: cu.rank_index,
	    totalVoteWeight: s,
	    votes: voteList[candidate],
	});
    }
    sortableCandidates.sort((a, b) => {
	const dw = b.totalVoteWeight - a.totalVoteWeight;
	if (Math.abs(dw) > 0.000001) {
	    return dw;
	}
	return a.tiebreaker - b.tiebreaker;  // rank index is the tiebreaker.
    });
    const headerMessage = await FetchHeaderMessage();
    if (!headerMessage) {
	console.log('Warning: missing header message for presidential election.');
	return;
    }
    const verticalMargin = 16;
    const horizontalMargin = 4;
    const barHeight = 32;
    const barGap = 2;
    const voteGap = 2;
    const n = sortableCandidates.length;
    const width = 360;
    const height = n * (barHeight) + (n - 1) * barGap + 2 * verticalMargin;
    const canvas = new Canvas.Canvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#313338';  // Discord grey.
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'white';
    context.font = '18px gg sans';
    let maxLabelWidth = 0;
    for (const candidate of sortableCandidates) {
	const labelWidth = Math.ceil(context.measureText(candidate.label).width);
	maxLabelWidth = Math.max(labelWidth, maxLabelWidth);
    }
    const chartWidth = width - (3 * horizontalMargin) - maxLabelWidth;
    let rowNumber = 0;
    for (const candidate of sortableCandidates) {
	let x = 2 * horizontalMargin + maxLabelWidth;
	const y = verticalMargin + rowNumber * (barHeight + barGap);
	const candidateTotalPixels = Math.ceil(chartWidth * candidate.totalVoteWeight / maxSum);
	const rightX = 2 * horizontalMargin + maxLabelWidth + candidateTotalPixels;
	console.log('Votes for', candidate.label);
	for (const vote of candidate.votes) {
	    console.log(vote);
	    context.fillStyle = vote.color;
	    const voteWidth = chartWidth * vote.weight / maxSum;
	    if (voteWidth - voteGap < 1) {
		const votePixels = Math.max(rightX - x, 1);
		context.fillRect(x, y, votePixels, barHeight);
		break;
	    } else {
		const votePixels = Math.floor(voteWidth);
		context.fillRect(x, y, votePixels - voteGap, barHeight);
		x += votePixels;
	    }
	}
	context.fillStyle = '#FFFFFF';
	const labelWidth = Math.ceil(context.measureText(candidate.label).width);
	const labelX = horizontalMargin + maxLabelWidth - labelWidth;
	const labelY = y + barHeight - 10;
	context.fillText(candidate.label, labelX, labelY);
	rowNumber++;
    }
    const voteTallyAttachment = {
	attachment: canvas.toBuffer(),
	name: 'president-vote.png',
    };
    const electionEndTimestamp = CalculateUnixTimestampOfElectionEndForThisMonth();
    await headerMessage.edit({
	content: `**Presidential Election**\n${voteCount} voters. The vote ends <t:${electionEndTimestamp}:R>`,
	files: [voteTallyAttachment],
    });
    let mrPresidentId;
    if (n > 0) {
	mrPresidentId = sortableCandidates[0].commissar_id;
	const mrPresident = UserCache.GetCachedUserByCommissarId(mrPresidentId);
	if (mrPresident) {
	    await mrPresident.setOffice('PREZ');
	}
    }
    let mrVicePresidentId;
    if (n > 1) {
	mrVicePresidentId = sortableCandidates[1].commissar_id;
	const mrVicePresident = UserCache.GetCachedUserByCommissarId(mrVicePresidentId);
	if (mrVicePresident) {
	    await mrVicePresident.setOffice('VEEP');
	}
    }
    for (const user of users) {
	if (user.commissar_id !== mrPresidentId && user.commissar_id !== mrVicePresidentId) {
	    await user.setOffice(null);
	}
    }
}

module.exports = {
    CheckReactionForPresidentialVote,
    UpdatePresidentialElection,
};
