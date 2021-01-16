// Returns a Promise that delays for the given number of milliseconds.
// It does nothing else. Just delays. This is a Promise-oriented way of
// making code wait for a certain amount of time to pass without blocking
// the thread.
//
// Example use:
//   const Sleep = require('./sleep');
//   await Sleep(200);
function Sleep(delayMillis) {
    return new Promise((resolve, reject) => {
	setTimeout(() => {
	    resolve();
	}, delayMillis);
    });
}

module.exports = Sleep;
