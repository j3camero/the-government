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
    //console.log(`Fetching URL: ${url}`);
    request.get(options, HandleSessionsResponse);
}

function HandleHttpErrors(error, response) {
    if (error) {
	console.error('error:', error);
	console.error('HTTP', response ? response.statusCode : 'status code unknown.');
	throw 'Error while fetching from Battlemetrics API.';
    }
}

function HandleSessionsResponse(error, response, body) {
    HandleHttpErrors(error, response);
    const rateLimit = response.headers['x-rate-limit-limit'];
    const remaining = response.headers['x-rate-limit-remaining'];
    let parsed;
    try {
	parsed = JSON.parse(body);
    } catch (e) {
	parsed = null;
    }
    if (parsed) {
	const sessions = parsed.data;
	db.writeBattlemetricsSessions(sessions);
	EnforceRateLimit(rateLimit, remaining, () => {
	    if (parsed.links && parsed.links.next) {
		FetchUrl(parsed.links.next);
	    } else {
		StartNewCrawl();
	    }
	});
    } else {
	console.log('Failed to parse response. Waiting a bit then try again.');
	const retryDelay = 61 * 1000;
	const retryUrl = response.request.uri.href;
	console.log('retry URL:', retryUrl);
	console.log('Waiting', retryDelay, 'ms.');
	setTimeout(() => {
	    console.log('Done waiting. Retrying.');
	    FetchUrl(retryUrl);
	}, retryDelay);
    }
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

// The timestamp to start crawling historical data.
let crawlingTimestamp = new Date('2020-09-17T00:00:00.000Z');

// Crawl data in chunks of this size.
const intervalHours = 4;

// This flag is used to switch between "range" queries and "at" queries.
let isIntervalQuery = true;

function StartNewCrawl() {
    let url = 'https://api.battlemetrics.com/sessions?filter[games]=rust&page[size]=100';
    isIntervalQuery = !isIntervalQuery;
    if (isIntervalQuery) {
	const nextTimestamp = new Date(crawlingTimestamp.getTime() + intervalHours * 3600 * 1000);
	const now = new Date();
	// Stop the crawl when it reaches the present.
	if (nextTimestamp > now) {
	    return;
	}
	const from = crawlingTimestamp.toISOString();
	const to = nextTimestamp.toISOString();
	crawlingTimestamp = nextTimestamp;
	url += `&filter[range]=${from}:${to}`;
    } else {
	url += '&filter[at]=' + crawlingTimestamp.toISOString();
    }
    console.log('Starting a new crawl:', url);
    FetchUrl(url);
}

StartNewCrawl();
