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

module.exports = {
    CalculateCurrentWeekOfTheMonth,
    CalculateHowManyThursdaysThisMonth,
};
