const request = require('request');

async function Fetch(urlOrOptions) {
    return new Promise((resolve, reject) => {
	request(urlOrOptions, (error, response, body) => {
	    if (error) {
		reject(error);
		return;
	    }
	    if (!response) {
		reject('No response');
		return;
	    }
	    if (response.statusCode !== 200) {
		reject('Response status code is ' + response.statusCode);
		return;
	    }
	    resolve(body);
	});
    });
}

module.exports = Fetch;
