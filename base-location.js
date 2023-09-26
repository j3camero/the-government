const fs = require('fs');

const dataFilename = 'base-locations.csv';
let baseLocationCache = {};

function GetBaseLocationStringBySteamId(steamId) {
    if (steamId in baseLocationCache) {
	return baseLocationCache[steamId];
    } else {
	return null;
    }
}

function ReloadFromFile() {
    const newCache = {};
    const fileContents = fs.readFileSync(dataFilename).toString();
    const lines = fileContents.split('\n');
    for (const line of lines) {
	const tokens = line.split(',');
	const steamId = tokens[0];
	const baseLocationString = tokens[5];
	const before = newCache[steamId] || '';
	const after = before + baseLocationString + '\n';
	newCache[steamId] = after;
    }
    baseLocationCache = newCache;
}

// Call once to make the data load by default.
ReloadFromFile();

module.exports = {
    GetBaseLocationStringBySteamId,
    ReloadFromFile,
};
