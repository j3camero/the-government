const Fetch = require('./fetch');

// Store the previously detected SHA, if any. This is compared against new SHAs to detect code changes.
let previousSha;

async function AutoUpdate() {
    const options = {
	headers: {
	    'User-Agent': 'j3camero',
	},
	url: 'https://api.github.com/repos/j3camero/the-government/branches/main',
    };
    let response;
    try {
	response = await Fetch(options);
    } catch (err) {
	console.log('Problem calling Github API. Auto update canceled.');
	return;
    }
    if (!response) {
	console.log('Invalid response from Github API. Auto update canceled.');
	return;
    }
    let data;
    try {
	data = JSON.parse(response);
    } catch (err) {
	console.log('Problem parsing Github API response. Auto update canceled.');
    }
    if (!data) {
	console.log('Problem parsing Github API response. Auto update canceled.');
	return;
    }
    if (!data.commit) {
	console.log('No latest commit from Github API. Auto update canceled.');
	return;
    }
    const sha = data.commit.sha;
    if (!sha) {
	console.log('No SHA received from Github API. Auto update canceled.');
	return;
    }
    if (sha.length !== 40) {
	console.log('SHA has', sha.length, 'characters instead of 40. Auto update canceled.');
	return;
    }
    if (sha === previousSha) {
	console.log('No code change detected. No auto update.');
	return;
    }
    if (!previousSha) {
	previousSha = sha;
	console.log('Code SHA detected', sha);
	return;
    }
    // If we get here it means there is a previous SHA and a current
    // SHA that are both valid but don't match. The bot should halt now.
    // The auto deployer will activate, deploying the latest version of
    // the code.
    console.log('Code change detected. Exiting process for auto update.');
    process.exit();
}

module.exports = AutoUpdate;
