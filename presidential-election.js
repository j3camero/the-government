const DiscordUtil = require('./discord-util');
const RustCalendar = require('./rust-calendar');
const UserCache = require('./user-cache');

const channelId = '1299963218265116753';

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

async function UpdatePresidentialElection() {
    const phase = CalculateCurrentPhaseOfElectionCycle();
    console.log('election phase:', phase);
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

let presidencyPhaseUpdated = false;

async function UpdatePresidencyPhase() {
    if (presidencyPhaseUpdated) {
	return;
    }
    presidencyPhaseUpdated = true;
    return CountVotesAndAwardPresidency();
}

async function UpdateVacantPhase() {
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

async function UpdateElectionPhase() {
    console.log('UpdateElectionPhase');
    const users = UserCache.GetAllUsersAsFlatList();
    const started = IsElectionStarted(users);
    if (started) {
	return ProcessLostVotes();
    } else {
	return InitElection();
    }
}

function IsElectionStarted(users) {
    for (const user of users) {
	if (user.office || user.presidential_election_vote || user.presidential_election_message_id) {
	    return true;
	}
    }
    return false;
}

async function ProcessLostVotes() {
    console.log('ProcessLostVotes');
}

function CalculateUnixTimestampOfElectionEndForThisMonth() {
    const thursdays = RustCalendar.CalculateArrayOfAllThursdayEpochsThisMonth();
    const n = thursdays.length;
    return thursdays[n - 1];
}

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

async function CheckReactionForPresidentialVote(reaction, discordUser) {
    if (discordUser.bot) {
	return;
    }
    if (reaction.message.channelId !== channelId) {
	return;
    }
    console.log('President vote detected');
}

async function CountVotesAndAwardPresidency() {
    console.log('CountVotesAndAwardPresidency');
}

module.exports = {
    CheckReactionForPresidentialVote,
    UpdatePresidentialElection,
};
