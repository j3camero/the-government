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
    if (value === Infinity) {
	return;
    }
    d[i][j] = value;
}

function FloydWarshall(relationships, candidates) {
    const d = {};
    console.log('Number of candidates', candidates.length);
    console.log('Initializing matrix');
    const minCoplayTimeToBotherWith = 1;
    const maxDistanceToCalculate = 1 / minCoplayTimeToBotherWith;
    relationships.forEach((r) => {
	const initialDistance = 1 / r.discounted_diluted_seconds;
	if (initialDistance < maxDistanceToCalculate) {
	    SetDistance(d, r.lo_user_id, r.hi_user_id, initialDistance);
	}
    });
    console.log('Starting cubic loop');
    const n = candidates.length;
    let complexity = 0;
    for (let k = 0; k < n; k++) {
	for (const i in d) {
	    for (const j in d[i]) {
		complexity++;
		const a = GetDistance(d, i, j);
		const b = GetDistance(d, i, k);
		const c = GetDistance(d, k, j);
		if (b + c !== Infinity && b + c < a && b + c < maxDistanceToCalculate) {
		    SetDistance(d, i, j, b + c);
		}
	    }
	}
    }
    console.log('Finished cubic loop with', complexity, 'iterations.');
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
	h[i] = c * 1.33;
    });
    return h;
}

async function HarmonicCentrality(candidates) {
    console.log('Getting time matrix');
    startTime = new Date().getTime();
    const relationships = await DB.GetTimeMatrix();
    endTime = new Date().getTime();
    elapsed = endTime - startTime;
    console.log(`DB.GetTimeMatrix: ${elapsed} ms`);
    console.log('Floyd Warshall');
    startTime = new Date().getTime();
    const d = FloydWarshall(relationships, candidates);
    endTime = new Date().getTime();
    elapsed = endTime - startTime;
    console.log(`Floyd Warshall: ${elapsed} ms`);
    const h = ConvertDistanceMatrixToHarmonicCentrality(d, candidates);
    return h;
}

module.exports = HarmonicCentrality;
