var AWS = require('aws-sdk');
const Discord = require('discord.js');
var express = require('express');
var session = require('express-session');
var passport = require('passport');
var path = require('path');
var DiscordStrategy = require('passport-discord').Strategy;
var util = require('util');

AWS.config.update({
    region: 'us-west-2',
    endpoint: 'https://dynamodb.us-west-2.amazonaws.com'
});
var dynamo = new AWS.DynamoDB.DocumentClient();
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

function DefaultDynamoDbErrorHandler(err, data) {
    if (err) {
	console.error("DynamoDB Error:", JSON.stringify(err, null, 2));
    }
}

function AddNewMemberToDynamoDb(member, rankIndex) {
    var params = {
	TableName: 'commissar-members',
	Item:{
	    'guildid': member.guild.id,
	    'userid': member.user.id,
	    'username': member.user.username,
	    'totalvotes': 0,
	    'rankindex': rankIndex,
	}
    };
    dynamo.put(params, DefaultDynamoDbErrorHandler);
}

function ApplyRankToMember(rank, member, guild) {
    console.log('Rank ' + member.user.username + ' ' + rank.title + ' ' + rank.insignia);
    member.setNickname(member.user.username + ' ' + rank.insignia);
    const role = GetRoleByName(guild, rank.role);
    member.setRoles([role]);
    AddNewMemberToDynamoDb(member, rank.index);
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
    clientID: '318947673388613632',
    clientSecret: 'ryPdC5BChVaFO6q4Jk7QEOtXqzA3Jomq',
    callbackURL: 'http://secretclan.net/callback',
    scope: scopes
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
        return done(null, profile);
    });
}));

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
	    dynamo.put(params, DefaultDynamoDbErrorHandler);
	    res.redirect('/info');
	});
app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
});
app.get('/info', checkAuth, function(req, res) {
    res.send('Welcome, ' + req.user.username + '! <a href=\"/logout\">Logout</a>');
});
app.get('/style.css', function(req, res) {
    res.sendFile(path.join(__dirname, '/style.css'));
});
app.get('/secret-style.css', checkAuth, function(req, res) {
    res.sendFile(path.join(__dirname, '/secret-style.css'));
});
app.get('*', function(req, res){
    res.redirect('/');
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
	return next();
    } else {
	res.redirect('/');
    }
}

app.listen(80, function (err) {
    if (err) {
	return console.log(err);
    }
    console.log('Webserver started.');
})
