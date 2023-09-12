const BaseLocation = require('./base-location');
const DiscordUtil = require('./discord-util');
const fetch = require('./fetch');

const resultsPerPage = 100;
let nextPageToCrawl = 0;
const leaderboardCacheBySteamId = {};
let sessionsBySteamId = {};
const raidAlertChannelId = '1149850708582088704';
let guild;
let channel;

async function FetchPageOfLeaderboardEntries(pageNumber) {
    const limit = resultsPerPage;
    const offset = pageNumber * resultsPerPage;
    const url = `https://rusticated.com/api/v2/servers/us-2x-monthly-large/leaderboard?limit=${limit}&offset=${offset}&since=wipe&statGroup=boom&showIcons=false&statType=kills&type=leaderboards&serverId=us-2x-monthly-large&sortBy=shot_ammo.rocket.basic&sortDir=desc&orgId=2&isClans=false`;
    const responseText = await fetch(url);
    const responseJson = JSON.parse(responseText);
    return responseJson.results;
}

function SimplifyLeaderboardResult(result) {
    const s = {
	beancan: result['thrown_grenade.beancan'],
	c4: result['thrown_explosive.timed'],
	eammo: result['shot_ammo.rifle.explosive'],
	f1: result['thrown_grenade.f1'],
	he: result['shot_ammo.grenadelauncher.he'],
	hv: result['shot_ammo.rocket.hv'],
	incend: result['shot_ammo.rocket.fire'],
	molotov: result['thrown_grenade.molotov'],
	name: result.user.name,
	rocket: result['shot_ammo.rocket.basic'],
	satchel: result['thrown_explosive.satchel'],
	steamId: result.user.steamId,
    };
    s['totalrocketequivalent'] = s.rocket + 2 * s.c4 + (s.eammo / 63) + (s.he / 4) + (s.hv / 10) + (s.incend / 10) + (s.molotov / 10) + (s.satchel / 4) + (s.beancan / 15) + (s.f1 / 45);
    return s;
}

function DiffTwoLeaderboardRecords(before, after) {
    return {
	beancan: after.beancan - before.beancan,
	c4: after.c4 - before.c4,
	eammo: after.eammo - before.eammo,
	f1: after.f1 - before.f1,
	he: after.he - before.he,
	hv: after.hv - before.hv,
	incend: after.incend - before.incend,
	molotov: after.molotov - before.molotov,
	name: after.name,
	rocket: after.rocket - before.rocket,
	satchel: after.satchel - before.satchel,
	steamId: after.steamId,
	totalrocketequivalent: after.totalrocketequivalent - before.totalrocketequivalent,
    };
}

function AddTwoLeaderboardRecords(before, after) {
    return {
	beancan: after.beancan + before.beancan,
	c4: after.c4 + before.c4,
	eammo: after.eammo + before.eammo,
	f1: after.f1 + before.f1,
	he: after.he + before.he,
	hv: after.hv + before.hv,
	incend: after.incend + before.incend,
	molotov: after.molotov + before.molotov,
	name: after.name,
	rocket: after.rocket + before.rocket,
	satchel: after.satchel + before.satchel,
	steamId: after.steamId,
	totalrocketequivalent: after.totalrocketequivalent + before.totalrocketequivalent,
    };
}

async function ExpiredSessionDetected(session) {
    if (session.sessionBoom.totalrocketequivalent > 1.9) {
        return;
    }
    if (session.message) {
	await session.message.delete();
    }
}

async function RemoveExpiredSessions() {
    const currentTime = new Date().getTime();
    const activeSessions = {};
    for (const steamId in sessionsBySteamId) {
	const session = sessionsBySteamId[steamId];
	if (session.endTime + 3600 * 1000 > currentTime) {
	    activeSessions[steamId] = session;
	} else {
	    await ExpiredSessionDetected(session);
	}
    }
    sessionsBySteamId = activeSessions;
}

function UpdateSession(steamId, after, diff) {
    const currentTime = new Date().getTime();
    if (steamId in sessionsBySteamId) {
	const session = sessionsBySteamId[steamId];
	session.endTime = currentTime;
	session.duration = currentTime - session.startTime;
	session.wipeBoom = after;
	session.sessionBoom = AddTwoLeaderboardRecords(session.sessionBoom, diff);
	sessionsBySteamId[steamId] = session;
    } else {
	sessionsBySteamId[steamId] = {
	    steamId,
	    name: after.name,
	    startTime: currentTime,
	    endTime: currentTime,
	    duration: 0,
	    wipeBoom: after,
	    sessionBoom: diff,
	};
    }
}

function BoomStatsToString(s) {
    const terms = [
	{ text: `${s.beancan} beancan`, weight: s.beancan / 15 },
	{ text: `${s.c4} C4`, weight: 2 * s.c4 },
	{ text: `${s.eammo} eammo`, weight: s.eammo / 63 },
	{ text: `${s.f1} f1`, weight: s.f1 / 45 },
	{ text: `${s.he} he`, weight: s.he / 4 },
	{ text: `${s.hv} hv`, weight: s.hv / 10 },
	{ text: `${s.incend} incend`, weight: s.incend / 10 },
	{ text: `${s.molotov} molotov`, weight: s.molotov / 10 },
	{ text: `${s.rocket} rocket`, weight: s.rocket },
	{ text: `${s.satchel} satchel`, weight: s.satchel / 4 },
    ];
    const nonZero = [];
    for (const term of terms) {
	if (term.weight > 0) {
	    nonZero.push(term);
	}
    }
    nonZero.sort((a, b) => {
	if (a.weight < b.weight) {
	    return 1;
	}
	if (a.weight > b.weight) {
	    return -1;
	}
	return 0;
    });
    const textOnly = [];
    for (const term of nonZero) {
	textOnly.push(term.text);
    }
    return textOnly.join(' + ');
}

function MakeDurationString(ms) {
    if (ms < 0) {
	return '0s';
    }
    const hours = Math.round(ms / (3600 * 1000));
    if (hours > 0) {
	return `${hours}h`;
    }
    const min = Math.round(ms / (60 * 1000));
    if (min > 0) {
	return `${min}m`;
    }
    const sec = Math.round(ms / 3600);
    return `${sec}s`;
}

async function UpdateSessionMessage(session) {
    if (session.message) {
	await session.message.delete();
    }
    const raidEquiv = Math.round(session.sessionBoom.totalrocketequivalent);
    const wipeEquiv = Math.round(session.wipeBoom.totalrocketequivalent);
    const threeBackticks = '```';
    let content = threeBackticks + '\n' + session.name + '\n';
    content += BoomStatsToString(session.sessionBoom) + '\n';
    content += 'Duration ' + MakeDurationString(session.duration) + '\n';
    content += `Wipe total rocket equiv ${wipeEquiv}\n`;
    const baseLocationString = BaseLocation.GetBaseLocationStringBySteamId(session.steamId);
    if (baseLocationString) {
	content += 'Attacker Base Location:\n' + baseLocationString;
    }
    content += threeBackticks;
    session.message = await channel.send(content);
}

async function ProcessLeaderboardEntry(result) {
    const steamId = result.user.steamId;
    if (!steamId) {
	return;
    }
    const simplified = SimplifyLeaderboardResult(result);
    if (steamId in leaderboardCacheBySteamId) {
	const before = leaderboardCacheBySteamId[steamId];
	const after = simplified;
	const diff = DiffTwoLeaderboardRecords(before, after);
	if (diff.totalrocketequivalent > 0) {
	    UpdateSession(steamId, after, diff);
	    const session = sessionsBySteamId[steamId];
	    if (session.sessionBoom.totalrocketequivalent > 1) {
		await UpdateSessionMessage(session);
	    }
	}
    }
    leaderboardCacheBySteamId[steamId] = simplified;
}

async function DoOneCrawlIteration() {
    console.log('Crawl leaderboard page', nextPageToCrawl);
    const results = await FetchPageOfLeaderboardEntries(nextPageToCrawl);
    if (results) {
	for (const result of results) {
	    await ProcessLeaderboardEntry(result);
	}
	if (results.length < resultsPerPage) {
	    nextPageToCrawl = 0;
	} else {
	    nextPageToCrawl++;
	}
    }
    await RemoveExpiredSessions();
    const humanizedDelay = 1007 + Math.random() * 1111;
    setTimeout(DoOneCrawlIteration, humanizedDelay);
}

async function Init() {
    guild = await DiscordUtil.GetMainDiscordGuild();
    channel = await guild.channels.fetch(raidAlertChannelId);
    await DoOneCrawlIteration();
}

module.exports = {
    Init,
};
