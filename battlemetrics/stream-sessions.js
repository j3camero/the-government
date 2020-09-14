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
    console.log(`Fetching URL: ${url}`);
    request.get(options, HandleSessionsResponse);
}

function HandleHttpErrors(error, response) {
    if (error) {
	console.error('error:', error);
	console.log('HTTP', response ? response.statusCode : 'status code unknown.');
	throw 'Error while fetching from Battlemetrics API.';
    }
}

function HandleSessionsResponse(error, response, body) {
    HandleHttpErrors(error, response);
    const rateLimit = response.headers['x-rate-limit-limit'];
    const remaining = response.headers['x-rate-limit-remaining'];
    const parsed = JSON.parse(body);
    const sessions = parsed.data;
    db.writeBattlemetricsSessions(sessions);
    EnforceRateLimit(rateLimit, remaining, () => {
	if (parsed.links && parsed.links.next) {
	    FetchUrl(parsed.links.next);
	} else {
	    StartNewCrawl();
	}
    });
}

// Implements a delay to respect the Battlemetrics API rate limit.
// The callback is called after the delay.
function EnforceRateLimit(rateLimit, remaining, callback) {
    // The crawler won't crawl faster than this maximum rate limit per minute.
    const maxRateLimit = 300;
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

function StartNewCrawl() {
    console.log('Start a new crawl.');
}

FetchUrl('https://api.battlemetrics.com/sessions?filter%5Bgames%5D=rust&filter%5Bat%5D=2020-08-04T01%3A45%3A00Z&page%5Bsize%5D=100');
