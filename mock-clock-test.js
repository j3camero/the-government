const assert = require('assert');
const MockClock = require('./mock-clock');

describe('MockClock', function() {
    it('Mocks the clock', () => {
	const c = new MockClock();
	assert.equal(c.currentTimeMillis(), 0);
	assert.equal(c.currentTimeSeconds(), 0);
	c.addTime(750);
	assert.equal(c.currentTimeMillis(), 750);
	assert.equal(c.currentTimeSeconds(), 0.75);
	c.addTime(200);
	assert.equal(c.currentTimeMillis(), 950);
	assert.equal(c.currentTimeSeconds(), 0.95);
	c.setTime(999);
	assert.equal(c.currentTimeMillis(), 999);
	assert.equal(c.currentTimeSeconds(), 0.999);
    });
});
