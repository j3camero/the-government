const level = require('level');

async function Main() {
    var db = level('my-db');
    await db.put('name', JSON.stringify({
	one: 1,
	two: 2,
	three: 3,
	votes: {
	    234: 1,
	    345: 0,
	    456: 1,
	    567: 0,
	},
    }));
    const value = await db.get('name');
    console.log('value:', value);
}

Main();
