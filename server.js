const commissar = require('./commissar');
const Discord = require('discord.js');
const DiscordStrategy = require('passport-discord').Strategy;
const passport = require('passport');

// Set up Discord events.
const client = new Discord.Client();
client.on('ready', () => commissar.ready(client));
client.on('guildMemberAdd', commissar.guildMemberAdd);
client.on('guildMemberRemove', commissar.guildMemberRemove);
client.on('voiceStateUpdate', commissar.voiceStateUpdate);

// Login the Commissar bot to Discord.
const token = 'MzE4OTQ3NjczMzg4NjEzNjMy.DBUn5A.ur1A_fONyluMUTx4iRJCGDm2JfE';
client.login(token);

// Set up heartbeat events for the bot.
setInterval(() => commissar.hourHeartbeat(client), 60 * 60 * 1000);
setInterval(() => commissar.minuteHeartbeat(client), 60 * 1000);

// Make the Discord bot invitable by web link.
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
  scope: scopes,
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));
