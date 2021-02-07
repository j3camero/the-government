// A rate limit mechanism for Discord.
//
// Implements a simple fixed delay rate limit. A better way would be to
// listen to the x-rate-limit headers returned by the Discord API.
//
// Ex:
//   const RateLimit = require('./rate-limit');
//   RateLimit(() => {
//       console.log('Space out this call.');
//   });

// The number of milliseconds to wait between processing items from the queue.
const fixedRateMs = 1007;

// Callbacks are queued in this array for later execution.
const rateLimitQueue = [];

// Returns true is the queue has pending tasks.
// Return false if the queue is empty.
function Busy() {
    return rateLimitQueue.length > 0;
}

// Adds a task to the queue for later execution.
// Returns a promise that resolves once the task is completed. This is useful
// for await-ing rate-limited tasks.
function Run(callback) {
    return new Promise((resolve, reject) => {
	rateLimitQueue.push(async () => {
	    const result = await callback();
	    resolve(result);
	});
    });
}

// Start a "thread" that wakes up at routine intervals to process an item
// from the queue.
setInterval(() => {
    if (rateLimitQueue.length > 0) {
	const nextTask = rateLimitQueue.shift();
	nextTask();
    }
}, fixedRateMs);

// Expose only the AddTask function, as a "callable module".
module.exports = {
    Busy,
    Run,
};
