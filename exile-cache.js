const db = require('./database');

let exileCache = [];

async function LoadExilesFromDatabase() {
    let newCache = [];
    const results = await db.Query('SELECT * FROM exiles');
    for (const row of results) {
	newCache.push({
	    exiler: row.exiler,
	    exilee: row.exilee,
	    is_friend: row.is_friend,
	});
    }
    exileCache = newCache;
}

async function AddExile(exiler, exilee) {
    if (IsExiled(exiler, exilee)) {
	return;
    }
    exileCache.push({ exiler, exilee, is_friend: false });
    await db.Query('INSERT INTO exiles (exiler, exilee, is_friend) VALUES (?, ?, FALSE)', [exiler, exilee]);
}

async function AddFriend(exiler, exilee) {
    if (IsFriend(exiler, exilee)) {
	return;
    }
    exileCache.push({ exiler, exilee, is_friend: true });
    await db.Query('INSERT INTO exiles (exiler, exilee, is_friend) VALUES (?, ?, TRUE)', [exiler, exilee]);
}

function GetAllExilesAsList() {
    // Return a copy of the cache to avoid any shenanigans.
    const result = [];
    for (const ex of exileCache) {
	result.push({
	    exiler: ex.exiler,
	    exilee: ex.exilee,
	    is_friend: ex.is_friend,
	});
    }
    return result;
}

function IsExiled(exiler, exilee) {
    for (const ex of exileCache) {
	if (ex.exiler === exiler && ex.exilee === exilee && !ex.is_friend) {
	    return true;
	}
    }
    return false;
}

function IsFriend(exiler, exilee) {
    for (const ex of exileCache) {
	if (ex.exiler === exiler && ex.exilee === exilee && ex.is_friend) {
	    return true;
	}
    }
    return false;
}

async function Unexile(exiler, exilee) {
    let newCache = [];
    let found = false;
    for (const ex of exileCache) {
	if (ex.exiler === exiler && ex.exilee === exilee) {
	    found = true;
	} else {
	    newCache.push(ex);
	}
    }
    if (!found) {
	return;
    }
    exileCache = newCache;
    await db.Query('DELETE FROM exiles WHERE exiler = ? AND exilee = ?', [exiler, exilee]);
}

async function SetIsFriend(exiler, exilee, is_friend) {
    await Unexile(exiler, exilee);
    if (is_friend) {
	await AddFriend(exiler, exilee);
    } else {
	await AddExile(exiler, exilee);
    }
}

module.exports = {
    AddExile,
    AddFriend,
    GetAllExilesAsList,
    IsExiled,
    IsFriend,
    LoadExilesFromDatabase,
    SetIsFriend,
    Unexile,
};
