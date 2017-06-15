var AWS = require('aws-sdk');
const Discord = require('discord.js');
var express = require('express');
var session = require('express-session');
var passport = require('passport');
var DiscordStrategy = require('passport-discord').Strategy;
var util = require('util');

const token = '***REMOVED***';

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
    console.log('Chatbot started.');
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

passport.serializeUser(function(user, done) {
  done(null, user);
});
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var scopes = ['identify', 'email', 'connections', 'guilds', 'guilds.join'];

passport.use(new DiscordStrategy({
    clientID: '***REMOVED***',
    clientSecret: '***REMOVED***',
    callbackURL: 'http://secretclan.net/callback',
    scope: scopes
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
        return done(null, profile);
    });
}));

AWS.config.update({
    region: 'us-west-2',
    endpoint: 'https://dynamodb.us-west-2.amazonaws.com'
});

var dynamo = new AWS.DynamoDB.DocumentClient();

var app = express();

app.use(session({
    secret: '5bhr6agyuh7gmyu8btfbz1h0ju',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.get('/', function (req, res) {
    if (req.isAuthenticated()) {
	res.redirect('/info');
    } else {
	res.send('<a href=\"/login\">Login with Discord</a>');
    }
});
app.get('/login', passport.authenticate('discord', { scope: scopes }),
	function(req, res) {});
app.get('/callback',
	passport.authenticate('discord', {
	    failureRedirect: '/'
	}), function(req, res) {
	    let currentTime = new Date();
	    var params = {
		TableName: 'commissar-login-log',
		Item:{
		    'year': currentTime.getFullYear().toString(),
		    'timestamp': currentTime.toISOString(),
		    'username': req.user.username
		}
	    };
	    dynamo.put(params, function(err, data) {
		if (err) {
		    console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
		} else {
		    //console.log("Added item:", JSON.stringify(data, null, 2));
		}
	    });
	    res.redirect('/info')
	});
app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
});
app.get('/info', checkAuth, function(req, res) {
    res.send('Welcome, ' + req.user.username + '! <a href=\"/logout\">Logout</a>');
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.send('not logged in :(');
}

app.listen(80, function (err) {
    if (err) return console.log(err)
    console.log('Webserver started.')
})
