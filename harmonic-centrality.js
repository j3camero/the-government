const DB = require('./database');

function GetDistance(d, i, j) {
    if (i === j) {
	return 0;
    }
    if (i > j) {
	const tmp = i;
	i = j;
	j = tmp;
    }
    if (!(i in d)) {
	return Infinity;
    }
    if (!(j in d[i])) {
	return Infinity;
    }
    return d[i][j];
}

function SetDistance(d, i, j, value) {
    if (i === j) {
	return;
    }
    if (i > j) {
	const tmp = i;
	i = j;
	j = tmp;
    }
    if (!(i in d)) {
	d[i] = {};
    }
    d[i][j] = value;
}

function FloydWarshall(relationships, candidates) {
    const d = {};
    relationships.forEach((r) => {
	SetDistance(d, r.lo_user_id, r.hi_user_id, 1 / r.discounted_diluted_seconds);
    });
    candidates.forEach((k) => {
	candidates.forEach((i) => {
	    candidates.forEach((j) => {
		const a = GetDistance(d, i, j);
		const b = GetDistance(d, i, k);
		const c = GetDistance(d, k, j);
		if (a > b + c) {
		    SetDistance(d, i, j, b + c);
		}
	    });
	});
    });
    return d;
}

function ConvertDistanceMatrixToHarmonicCentrality(d, candidates) {
    const h = {};
    candidates.forEach((i) => {
	let c = 0;
	candidates.forEach((j) => {
	    if (i !== j) {
		c += 1 / GetDistance(d, i, j);
	    }
	});
	h[i] = c;
    });
    return h;
}

async function HarmonicCentrality(candidates) {
    const relationships = await DB.GetTimeMatrix();
    const d = FloydWarshall(relationships, candidates);
    const h = ConvertDistanceMatrixToHarmonicCentrality(d, candidates);
    return h;
}

module.exports = HarmonicCentrality;
