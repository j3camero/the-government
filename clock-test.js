const assert = require('assert');
const Clock = require('./clock');

describe('Clock', function() {
    it('Timestamps are valid', () => {
	const c = new Clock();
	assert(c.currentTimeMillis() > 0);
	assert(c.currentTimeSeconds() > 0);
    });
});
