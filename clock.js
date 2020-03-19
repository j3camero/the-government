// A simple clock class for getting the current time. Mockable for unit testing.
class Clock {
    currentTimeMillis() {
	const d = new Date();
	return d.getTime();
    }

    currentTimeSeconds() {
	return this.currentTimeMillis() / 1000;
    }
};

module.exports = Clock;
