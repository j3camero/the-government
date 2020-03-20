// Streams time together to the database.
class TimeTogetherStream {

    // Initialize a new stream.
    constructor(clock) {
	// A clock used for getting the current time. Can be mocked for unit testing.
	this.clock = clock;
	// The timestamp from the latest observation.
	this.lastTimeMillis = clock.currentTimeMillis();
	// A list of records of accumulated time spent together, waiting to be
	// sent to the database.
	this.outputBuffer = [];
    }

    // The given lists of Commissar IDs were seen online and active together.
    // The input is a list of lists, representing the members of several rooms.
    seenTogether(listOfLists) {
	const currentTime = this.clock.currentTimeMillis();
	const deltaT = currentTime - this.lastTimeMillis;
	this.lastTimeMillis = currentTime;
	const maxDelta = 6 * 3600 * 1000;
	if (deltaT > maxDelta || deltaT <= 0) {
	    // Don't add huge chunks of time at once. It should be added a
	    // few minutes at a time max. This is a safety measure to
	    // prevent epic timespans being added suddenly by accident and
	    // wrecking the records.
	    return;
	}
	listOfLists.forEach((roomMembers) => {
	    const n = roomMembers.length;
	    for (let i = 0; i < n; ++i) {
		for (let j = i + 1; j < n; ++j) {
		    const a = roomMembers[i];
		    const b = roomMembers[j];
		    this.bufferTimeTogether(a, b, deltaT, n);
		}
	    }
        });
    }

    // Add some time to the output buffer.
    // a: a Commissar ID.
    // b: another Commissar ID.
    // deltaT in milliseconds (ms). Gets converted to seconds internally.
    // n: number of people present, including a and b. Used to calculate
    //    diluted time.
    bufferTimeTogether(a, b, deltaT, n) {
	if (n < 2 || deltaT <= 0) {
	    return;
	}
	const durationSeconds = deltaT / 1000;
	const dilutedSeconds = durationSeconds / (n - 1);
	const loUserId = a < b ? a : b;
	const hiUserId = a < b ? b : a;
	let found = false;
	this.outputBuffer.forEach((x) => {
	    if (x.loUserId === loUserId && x.hiUserId === hiUserId && !found) {
		x.durationSeconds += durationSeconds;
		x.dilutedSeconds += dilutedSeconds;
		found = true;
	    }
	});
	if (!found) {
	    this.outputBuffer.push({ loUserId, hiUserId, durationSeconds, dilutedSeconds });
	}
    }

    // Remove and return n records from the output buffer.
    popTimeTogether(n) {
	this.outputBuffer.sort((a, b) => {
	    return a.dilutedSeconds - b.dilutedSeconds;
	});
	const output = [];
	for (let i = 0; i < n && this.outputBuffer.length > 0; ++i) {
	    const item = this.outputBuffer.pop();
	    output.push(item);
	}
	return output;
    }
};

module.exports = TimeTogetherStream;
