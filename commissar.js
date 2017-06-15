const Discord = require('discord.js');

const token = 'MzE4OTQ3NjczMzg4NjEzNjMy.DBUn5A.ur1A_fONyluMUTx4iRJCGDm2JfE';

const rankMetaData = [
    {title: 'n00b', insignia: '(n00b)', role: null},
    {title: 'Recruit', insignia: '●', role: 'Grunts'},
    {title: 'Corporal', insignia: '●●', role: 'Grunts'},
    {title: 'Sergeant', insignia: '●●●', role: 'Grunts'},
    {title: 'Lieutenant', insignia: '●', role: 'Officers'},
    {title: 'Captain', insignia: '●●', role: 'Officers'},
    {title: 'Major', insignia: '●●●', role: 'Officers'},
    {title: 'Colonel', insignia: '●●●●', role: 'Officers'},
    {title: 'General', insignia: '★', role: 'Generals'},
    {title: 'General', insignia: '★★', role: 'Generals'},
    {title: 'General', insignia: '★★★', role: 'Generals'},
    {title: 'General', insignia: '★★★★', role: 'Generals'},
];

const client = new Discord.Client();

function GetRoleByName(guild, roleName) {
    for (let role of guild.roles.values()) {
	if (role.name === roleName) {
	    return role.id;
	}
    }
}

function ApplyRankToMember(rank, member, guild) {
    console.log('Rank ' + member.user.username + ' ' + rank.title + ' ' + rank.insignia);
    member.setNickname(member.user.username + ' ' + rank.insignia);
    const role = GetRoleByName(guild, rank.role);
    member.setRoles([role]);
}

// Returns an array with numMembers elements, each an integer rank index.
function CalculateRanks(numMembers) {
    let ranks = [];
    let numGenerals = numMembers;
    for (let rankIndex = 1; rankIndex <= 7; ++rankIndex) {
	const count = Math.floor(numMembers / 8) + ((rankIndex <= (numMembers % 8)) ? 1 : 0);
	numGenerals -= count;
	for (let i = 0; i < count; ++i) {
	    ranks.push(rankIndex);
	}
    }
    // Produces the series 8, 9, 8, 10, 9, 8, 11, 10, 9, 8, 12, ...
    for (let topRank = 8; numGenerals > 0; ++topRank) {
	for (let r = topRank; numGenerals > 0 && r >= 8; --r) {
	    ranks.push(r);
	    --numGenerals;
	}
    }
    return ranks.sort(function (a, b) { return a - b; });
}

function RankGuildMembers(guild) {
    let candidates = [];
    for (let member of guild.members.values()) {
	if (!member.user.bot) {
	    candidates.push(member);
	}
    }
    candidates.sort(function(a, b) {
	if (a.user.id == guild.ownerID && b.user.id == guild.ownerID) {
	    return 0;
	}
	if (a.user.id == guild.ownerID) {
	    return -1;
	}
	if (b.user.id == guild.ownerID) {
	    return 1;
	}
	return b.joinedTimestamp - a.joinedTimestamp;
    });
    const ranks = CalculateRanks(candidates.length);
    for (let i = 0; i < candidates.length; ++i) {
	ApplyRankToMember(rankMetaData[ranks[i]], candidates[i], guild);
    }
}

client.on('ready', () => {
    console.log('ready');
    for (let guild of client.guilds.values()) {
	RankGuildMembers(guild);
    }
});

client.on('guildMemberAdd', member => {
    const greeting = 'Everybody welcome ' + member.user.username + ' to the server!';
    member.guild.defaultChannel.send(greeting);
    RankGuildMembers(member.guild);
});

client.on('guildMemberRemove', member => {
    RankGuildMembers(member.guild);
});

client.login(token);
