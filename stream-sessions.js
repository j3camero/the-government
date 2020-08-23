const bearerToken = require('./bearer-token');
const request = require('request');

function FetchUrlAndFollowNextPage(url) {
    const options = {
	auth: {
	    bearer: bearerToken,
	},
	headers: {
	    'User-Agent': 'Jeff Cameron <cameron.jp@gmail.com> (Reach out with any questions or concerns)'
	},
	url,
    };
    console.log(`Fetching URL: ${url}`)
    request.get(options, (error, response, body) => {
	if (error) {
	    console.error('error:', error);
	    console.log('statusCode:', response && response.statusCode);
	    return;
	}
	const parsed = JSON.parse(body);
	const sessions = parsed.data;
	console.log(`Parsed sessions: ${sessions.length}`);
	if (parsed.links) {
	    if (parsed.links.next) {
		const nextPageUrl = parsed.links.next;
		console.log(`Next page: ${nextPageUrl}`);
		setTimeout(() => {
		    FetchUrlAndFollowNextPage(nextPageUrl);
		}, 1100);
	    }
	}
    });
}

FetchUrlAndFollowNextPage('https://api.battlemetrics.com/sessions?filter%5Bgames%5D=rust&filter%5Bat%5D=2020-08-04T01%3A45%3A00Z&page%5Bsize%5D=100');
