const config = require('./config');
const mysql = require('mysql');
const UserCache = require('./commissar-user');

const sqlConnection = mysql.createConnection(config.sqlConfig);
sqlConnection.connect((err) => {
    if (err) {
	throw err;
    }
    UserCache.CreateNewDatabaseUser(
	sqlConnection,
	'123discordID123',
	null,
	'Jeff',
	11,
	0.03784470965565152,
	'20191103',
	undefined,
	undefined,
	() => {
	    console.log('Successfully added user to database.');
	});
});
