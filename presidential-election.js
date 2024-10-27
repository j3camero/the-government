const RustCalendar = require('./rust-calendar');

function CalculateCurrentStageOfElectionCycle() {
    const weekOfMonth = RustCalendar.CalculateCurrentWeekOfTheMonth();
    const weeksThisMonth = RustCalendar.CalculateHowManyThursdaysThisMonth();
    if (weeksThisMonth === 4) {
	if (weekOfMonth === 0) return 'presidency';
	if (weekOfMonth === 1) return 'presidency';
	if (weekOfMonth === 2) return 'vacant';
	if (weekOfMonth === 3) return 'election';
	if (weekOfMonth === 4) return 'presidency';
    }
    if (weeksThisMonth === 5) {
	if (weekOfMonth === 0) return 'presidency';
	if (weekOfMonth === 1) return 'presidency';
	if (weekOfMonth === 2) return 'vacant';
	if (weekOfMonth === 3) return 'vacant';
	if (weekOfMonth === 4) return 'election';
	if (weekOfMonth === 5) return 'presidency';
    }
    throw 'Something went wrong with a Rust calendar calculation';
}

function Main() {
    const stage = CalculateCurrentStageOfElectionCycle();
    console.log(stage);
}

Main();
