const commissar = require('./commissar');
const Discord = require('discord.js');
const DiscordStrategy = require('passport-discord').Strategy;

// Set up Discord events and login the Commissar bot.
const client = new Discord.Client();
client.on('ready', commissar.ready);
client.on('guildMemberAdd', commissar.guildMemberAdd);
client.on('guildMemberRemove', commissar.guildMemberRemove);
client.on('voiceStateUpdate', commissar.voiceStateUpdate);
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
  scope: scopes,
}, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));
