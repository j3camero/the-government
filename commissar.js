const Discord = require('discord.js');
var passport = require('passport');
var path = require('path');
var DiscordStrategy = require('passport-discord').Strategy;
var util = require('util');

const token = 'MzE4OTQ3NjczMzg4NjEzNjMy.DBUn5A.ur1A_fONyluMUTx4iRJCGDm2JfE';

const rankMetaData = [
  {index: 0, title: 'n00b', insignia: '(n00b)', role: null},
  {index: 1, title: 'Recruit', insignia: '●', role: 'Grunts'},
  {index: 2, title: 'Corporal', insignia: '●●', role: 'Grunts'},
  {index: 3, title: 'Sergeant', insignia: '●●●', role: 'Grunts'},
  {index: 4, title: 'Lieutenant', insignia: '●', role: 'Officers'},
  {index: 5, title: 'Captain', insignia: '●●', role: 'Officers'},
  {index: 6, title: 'Major', insignia: '●●●', role: 'Officers'},
  {index: 7, title: 'Colonel', insignia: '●●●●', role: 'Officers'},
  {index: 8, title: 'General', insignia: '★', role: 'Generals'},
  {index: 9, title: 'General', insignia: '★★', role: 'Generals'},
  {index: 10, title: 'General', insignia: '★★★', role: 'Generals'},
  {index: 11, title: 'General', insignia: '★★★★', role: 'Generals'},
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
  if (member.user.id == guild.ownerID) {
    // Don't rank the owner because it causes permission issues with the bot.
    return;
  }
  //console.log('Rank ' + member.user.username + ' ' + rank.title + ' ' + rank.insignia);
  const nickname = member.user.username + ' ' + rank.insignia;
  if (member.nickname != nickname) {
    console.log('Update', nickname);
    member.setNickname(nickname);
  }
  const role = GetRoleByName(guild, rank.role);
  if (member._roles.indexOf(role) < 0) {
    member.setRoles([role]);
  }
}

// Returns an array with numMembers elements, each an integer rank index.
function CalculateRanks(numMembers) {
  let ranks = [];
  let numGenerals = numMembers;
  for (let rankIndex = 1; rankIndex <= 7; ++rankIndex) {
  	let count = Math.floor(numMembers / 8)
    if (rankIndex <= (numMembers % 8)) {
      count += 1;
    }
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
  console.log('Ranking', candidates.length, 'members.');
  const ranks = CalculateRanks(candidates.length);
  for (let i = 0; i < candidates.length; ++i) {
    ApplyRankToMember(rankMetaData[ranks[i]], candidates[i], guild);
  }
}

client.on('ready', () => {
  console.log('Chatbot started.');
  for (let guild of client.guilds.values()) {
    RankGuildMembers(guild);
  }
});

client.on('guildMemberAdd', member => {
  console.log('New member joined the server.');
  const greeting = 'Everybody welcome ' + member.user.username + ' to the server!';
  member.guild.defaultChannel.send(greeting);
  RankGuildMembers(member.guild);
});

client.on('guildMemberRemove', member => {
  console.log('Someone quit the server.');
  RankGuildMembers(member.guild);
});

client.login(token);

passport.serializeUser(function(user, done) {
  done(null, user);
});
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var scopes = ['identify', 'email', 'connections', 'guilds', 'guilds.join'];

passport.use(new DiscordStrategy({
  clientID: '318947673388613632',
  clientSecret: 'ryPdC5BChVaFO6q4Jk7QEOtXqzA3Jomq',
  callbackURL: 'http://secretclan.net/callback',
  scope: scopes
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));
