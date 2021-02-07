// Code for updating and establishing various offices & titles in the Discord.
// Ex: Mr. President, Minister of Defense.
const jobDescriptions = require('./executive-config');
const UserCache = require('./user-cache');

// Returns a user with the given target rank, who doesn't already have an office.
// If all users of the target rank already have an office, returns null.
//   - targetRank: find a user of this rank exactly.
//   - userCache: for unit testing a mock user cache can be passed in. In
//                production the real user cache is passed in.
//   - chainOfCommand: the most recently computed chain of command.
function FindUnassignedUser(targetRank, chainOfCommand, userCache) {
    let foundUser = null;
    Object.keys(chainOfCommand).forEach((commissar_id) => {
	const cachedUser = userCache ? userCache[commissar_id]
	      : UserCache.GetCachedUserByCommissarId(commissar_id);
	const comUser = chainOfCommand[commissar_id];
	if (cachedUser && comUser && comUser.rank === targetRank && !cachedUser.office) {
	    foundUser = cachedUser;
	}
    });
    return foundUser;
}

// Updates the clan executives. Fire any users that don't match their jobs any
// more, then appoint new executives to fill any open spots.
//   - userCache: for unit testing, pass in a mock of the user cache. In
//                production, leave it out to default to the real user cache.
//   - chainOfCommand: the most recently computed chain of command.
async function UpdateClanExecutives(chainOfCommand, userCache) {
    if (!chainOfCommand || Object.keys(chainOfCommand).length <= 0) {
	// Do nothing if the chain of command isn't loaded / calculated yet.
	return;
    }
    const filledPositions = {};
    let ForEach = UserCache.ForEach;
    // Accomodate mock user cache for unit testing.
    if (userCache) {
	ForEach = f => Object.values(userCache).forEach(f);
    }
    // Dismiss executives who don't match any more.
    await ForEach((user) => {
	if (!user.office) {
	    return;
	}
	const jobDescription = jobDescriptions[user.office];
	const chainUser = chainOfCommand[user.commissar_id];
	if ((user.office in filledPositions) || !chainUser || (chainUser.rank !== jobDescription.rank)) {
	    // Do not await to avoid creating a race condition.
	    user.setOffice(null);
	} else {
	    filledPositions[user.office] = true;
	}
    });
    // Attempt to fill all empty executive roles.
    Object.keys(jobDescriptions).forEach((jobID) => {
	const jobDescription = jobDescriptions[jobID];
	if (jobID in filledPositions) {
	    return;
	}
	const appointee = FindUnassignedUser(jobDescription.rank, chainOfCommand, userCache);
	if (appointee) {
	    // Do not await to avoid creating race condition.
	    appointee.setOffice(jobID);
	}
    });
}

// Calls an inner function for each executive with role. Typically 3-star Generals
// with roles Army, Navy, Air Force, and Marines.
async function ForEachExecutiveWithRoles(innerFunction) {
    await UserCache.ForEach((user) => {
	if (user.office) {
	    const jobDescription = jobDescriptions[user.office];
	    const recursiveRole = jobDescription.recursiveRole;
	    const personalRole = jobDescription.personalRole;
	    innerFunction(user.commissar_id, recursiveRole, personalRole);
	}
    });
}

module.exports = {
    FindUnassignedUser,
    ForEachExecutiveWithRoles,
    UpdateClanExecutives,
};
