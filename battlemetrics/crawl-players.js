const bearerToken = require('./bearer-token');
const db = require('../database');
const request = require('request');

function FetchUrl(url) {
    const options = {
	auth: {
	    bearer: bearerToken,
	},
	headers: {
	    'User-Agent': 'Jeff Cameron <cameron.jp@gmail.com> (Reach out with any questions or concerns)'
	},
	url,
    };
    return new Promise((resolve, reject) => {
	request.get(options, (error, response, body) => {
	    if (error) {
		reject(error);
	    } else {
		resolve(response);
	    }
	});
    });
}

function HandleSessionsResponse(response) {
    const rateLimit = response.headers['x-rate-limit-limit'];
    const remaining = response.headers['x-rate-limit-remaining'];
    let parsed;
    try {
	parsed = JSON.parse(response.body);
    } catch (e) {
	parsed = null;
    }
    if (parsed) {
	const sessions = parsed.data;
	console.log(sessions);
	db.writeBattlemetricsSessions(sessions);
    } else {
	console.log('response.body:', response.body);
	throw 'Failed to parse response. Waiting a bit then try again.';
    }
}

// Return a Promise that sleeps for the given number of milliseconds (ms).
function Sleep(ms) {
    return new Promise((resolve, reject) => {
	setTimeout(() => {
	    resolve();
	}, ms);
    });
}

// Implements a delay to respect the Battlemetrics API rate limit.
// The callback is called after the delay.
function EnforceRateLimit(rateLimit, remaining, callback) {
    // The crawler won't crawl faster than this maximum rate limit per minute.
    const maxRateLimit = 500;
    // The minimum rate limit is a safe setting to use for backing off.
    const minRateLimit = 5;
    // Parse the number of requests remaining. It might be a string.
    remaining = parseInt(remaining) || 0;
    // Parse the rate limit. It might be a string.
    rateLimit = parseInt(rateLimit);
    if (!rateLimit || remaining < 1 || rateLimit < minRateLimit) {
	rateLimit = minRateLimit;
    }
    if (rateLimit > maxRateLimit) {
	rateLimit = maxRateLimit;
    }
    // Undershoot the rate limit to be courteous.
    if (rateLimit > minRateLimit) {
	rateLimit -= 3;
    }
    const delayMs = 60 * 1000 / rateLimit;
    setTimeout(callback, delayMs);
}

const playerIds = [
    '335165891',  // Jeff
];

function Main() {
    let baseUrl = 'https://api.battlemetrics.com/sessions?filter[games]=rust&page[size]=100&filter[players]=';
    playerIds.forEach(async playerId => {
	\const playerUrl = baseUrl + playerId;
	const response = await FetchUrl(playerUrl);
	HandleSessionsResponse(response);
    });
}

Main();
