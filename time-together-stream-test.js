const assert = require('assert');
const MockClock = require('./mock-clock');
const TimeTogetherStream = require('./time-together-stream');

describe('TimeTogetherStream', function() {
    it('Zero case', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	const output = s.popTimeTogether(10);
	assert.equal(output.length, 0);
    });
    it('One event with 2 users', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(420);
	s.seenTogether([[3, 7]]);
	const output = s.popTimeTogether(2);
	assert.equal(output.length, 1);
	assert.deepEqual(output[0], {
	    loUserId: 3,
	    hiUserId: 7,
	    durationSeconds: 0.42,
	    dilutedSeconds: 0.42,
	});
    });
    it('One event with 3 users', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(420);
	s.seenTogether([['xyz', 'abc', 'def']]);
	const output = s.popTimeTogether(999);
	assert.equal(output.length, 3);
	output.forEach((out) => {
	    assert.equal(out.durationSeconds, 0.42);
	    assert.equal(out.dilutedSeconds, 0.21);
	    assert(out.loUserId < out.hiUserId);
	});
    });
    it('Two events with 2 users', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(420);
	s.seenTogether([[3, 7]]);
	clock.addTime(360);
	s.seenTogether([[7, 3]]);
	const output = s.popTimeTogether(2);
	assert.equal(output.length, 1);
	assert.deepEqual(output[0], {
	    loUserId: 3,
	    hiUserId: 7,
	    durationSeconds: 0.78,
	    dilutedSeconds: 0.78,
	});
    });
    it('Two events with 3 users', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(420);
	s.seenTogether([['xyz', 'abc', 'def']]);
	clock.addTime(360);
	s.seenTogether([['def', 'xyz', 'abc']]);
	const output = s.popTimeTogether(999);
	assert.equal(output.length, 3);
	output.forEach((out) => {
	    assert.equal(out.durationSeconds, 0.78);
	    assert.equal(out.dilutedSeconds, 0.39);
	    assert(out.loUserId < out.hiUserId);
	});
    });
    it('Two events with overlapping users', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(360);
	s.seenTogether([['abc', 'def']]);
	clock.addTime(420);
	s.seenTogether([['xyz', 'abc']]);
	const output = s.popTimeTogether(999);
	assert.equal(output.length, 2);
	assert.deepEqual(output, [
	    {
		loUserId: 'abc',
		hiUserId: 'xyz',
		durationSeconds: 0.42,
		dilutedSeconds: 0.42,
	    },
	    {
		loUserId: 'abc',
		hiUserId: 'def',
		durationSeconds: 0.36,
		dilutedSeconds: 0.36,
	    },
	]);
    });
    it('Subset of users leave a group', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(360);
	s.seenTogether([[1, 2, 3]]);
	clock.addTime(420);
	s.seenTogether([[1, 2]]);
	const output = s.popTimeTogether(999);
	assert.equal(output.length, 3);
	assert.deepEqual(output[0], {
		loUserId: 1,
		hiUserId: 2,
		durationSeconds: 0.78,
		dilutedSeconds: 0.6,
	});
	assert.equal(output[1].hiUserId, 3);
	assert.equal(output[1].durationSeconds, 0.36);
	assert.equal(output[1].dilutedSeconds, 0.18);
	assert.equal(output[2].hiUserId, 3);
	assert.equal(output[2].durationSeconds, 0.36);
	assert.equal(output[2].dilutedSeconds, 0.18);
    });
    it('Tracking multiple groups concurrently', () => {
	const clock = new MockClock();
	const s = new TimeTogetherStream(clock);
	clock.addTime(200);
	s.seenTogether([[1, 2], [3, 4, 5]]);
	clock.addTime(300);
	s.seenTogether([[1, 2, 5], [3, 4]]);
	const output = s.popTimeTogether(999);
	assert.equal(output.length, 6);
	assert.deepEqual(output[0], {
		loUserId: 3,
		hiUserId: 4,
		durationSeconds: 0.5,
		dilutedSeconds: 0.4,
	});
	assert.deepEqual(output[1], {
		loUserId: 1,
		hiUserId: 2,
		durationSeconds: 0.5,
		dilutedSeconds: 0.35,
	});
	assert.equal(output[2].hiUserId, 5);
	assert.equal(output[2].durationSeconds, 0.3);
	assert.equal(output[2].dilutedSeconds, 0.15);
	assert.equal(output[3].hiUserId, 5);
	assert.equal(output[3].durationSeconds, 0.3);
	assert.equal(output[3].dilutedSeconds, 0.15);
	assert.equal(output[4].hiUserId, 5);
	assert.equal(output[4].durationSeconds, 0.2);
	assert.equal(output[4].dilutedSeconds, 0.1);
	assert.equal(output[5].hiUserId, 5);
	assert.equal(output[5].durationSeconds, 0.2);
	assert.equal(output[5].dilutedSeconds, 0.1);
    });
});
