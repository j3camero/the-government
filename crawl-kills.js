const fetch = require('./fetch');

const recentlySeenKillIds = [];
let delayBetweenCrawls = 7777;
const targetNewKillsPerCrawl = 20;
let isFirstCrawl = true;

function NewKillDetected(kill) {
    const columns = [
	kill.id,
	kill.attacker.id,
	kill.attacker.position.x.toString(),
	kill.attacker.position.y.toString(),
	kill.attacker.position.z.toString(),
	kill.victim.id,
	kill.victim.position.x.toString(),
	kill.victim.position.y.toString(),
	kill.victim.position.z.toString(),
    ];
    const csv = columns.join(',');
    console.log(csv);
}

async function DoOneCrawlIteration() {
    const url = 'https://rusticated.com/api/v2/kills?serverId=us-2x-monthly-large&limit=100';
    const textResponse = await fetch(url);
    const jsonResponse = JSON.parse(textResponse);
    const results = jsonResponse.results;
    let newKillCount = 0;
    for (const result of results) {
	if (!recentlySeenKillIds.includes(result.id)) {
	    recentlySeenKillIds.push(result.id);
	    NewKillDetected(result);
	    newKillCount++;
	}
    }
    //console.log('detected', newKillCount, 'kills in', delayBetweenCrawls, 'ms');
    if (newKillCount === 0) {
	newKillCount++;
    }
    while (recentlySeenKillIds.length > 200) {
	recentlySeenKillIds.shift();
    }
    // Controller for the pace of the crawl.
    if (!isFirstCrawl) {
	const extrapolatedDelayTarget = targetNewKillsPerCrawl * delayBetweenCrawls / newKillCount;
	const fullDiff = extrapolatedDelayTarget - delayBetweenCrawls;
	const carefulDiff = 0.1 * fullDiff;
	const maxDiff = 0.1 * delayBetweenCrawls;
	const minDiff = -0.5 * delayBetweenCrawls;
	const clippedDiff = Math.min(maxDiff, Math.max(minDiff, carefulDiff));
	delayBetweenCrawls += clippedDiff;
	const maxDelay = 600 * 1000;
	const minDelay = 1000;
	delayBetweenCrawls = Math.min(maxDelay, Math.max(minDelay, Math.round(delayBetweenCrawls)));
    }
    isFirstCrawl = false;
    setTimeout(DoOneCrawlIteration, delayBetweenCrawls);
}

async function Main() {
    await DoOneCrawlIteration();
}

Main();
