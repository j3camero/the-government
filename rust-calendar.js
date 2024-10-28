const moment = require('moment');

function CalculateCurrentWeekOfTheMonth() {
    const currentTime = moment();
    const year = currentTime.year();
    const monthNumberZeroIndexed = currentTime.month();
    let d = moment([year, monthNumberZeroIndexed, 1, 18, 0, 0]);
    let thursdayCount = 0;
    while (d.isBefore(currentTime)) {
	const dayOfWeek = d.day();
	const thursday = 4;
	if (dayOfWeek === thursday) {
	    thursdayCount++;
	}
	d.add(24, 'hours');
    }
    return thursdayCount;
}

function CalculateHowManyThursdaysThisMonth() {
    const currentTime = moment();
    const year = currentTime.year();
    const monthNumberZeroIndexed = currentTime.month();
    let d = moment([year, monthNumberZeroIndexed, 1, 18, 0, 0]);
    let thursdayCount = 0;
    while (d.month() === monthNumberZeroIndexed) {
	const dayOfWeek = d.day();
	const thursday = 4;
	if (dayOfWeek === thursday) {
	    thursdayCount++;
	}
	d.add(24, 'hours');
    }
    return thursdayCount;
}

// Gives the timestamp of every Thursday this month at 18:00 UTC.
function CalculateArrayOfAllThursdayEpochsThisMonth() {
    const currentTime = moment();
    const year = currentTime.year();
    const monthNumberZeroIndexed = currentTime.month();
    let d = moment([year, monthNumberZeroIndexed, 1, 18, 0, 0]);
    const thursdays = [];
    while (d.month() === monthNumberZeroIndexed) {
	const dayOfWeek = d.day();
	const thursday = 4;
	if (dayOfWeek === thursday) {
	    const epoch = d.unix();
	    thursdays.push(epoch);
	}
	d.add(24, 'hours');
    }
    return thursdays;
}

module.exports = {
    CalculateArrayOfAllThursdayEpochsThisMonth,
    CalculateCurrentWeekOfTheMonth,
    CalculateHowManyThursdaysThisMonth,
};
