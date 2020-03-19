// A mock clock for unit testing.
class MockClock {
    constructor() {
	this.t = 0;
    }

    currentTimeMillis() {
	return this.t;
    }

    currentTimeSeconds() {
	return this.t / 1000;
    }

    setTime(newTime) {
	this.t = newTime;
    }

    addTime(delta) {
	this.t += delta;
    }
};

module.exports = MockClock;
