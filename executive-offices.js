// Code for updating and establishing various offices & titles in the Discord.
// Ex: Mr. President, Minister of Defense.
const executiveOffices = {
    'PRES': {
	abbreviation: 'Pres.',
	longTitle: 'President',
	rank: 0,
	shortTitle: 'President',
    },
    'VP': {
	abbreviation: 'VP',
	longTitle: 'Vice President',
	rank: 1,
	shortTitle: 'Vice President',
    },
    'CJCS': {
	abbreviation: 'Chmn.',
	longTitle: 'Chairman of the Joint Chiefs of Staff',
	personalRole: 'Chairman of the Joint Chiefs of Staff',
	rank: 2,
	shortTitle: 'Chairman',
    },
    'MINDEF': {
	abbreviation: 'Min.',
	longTitle: 'Minister of Defense',
	personalRole: 'Minister of Defense',
	rank: 2,
	shortTitle: 'Minister',
    },
    'ARMY': {
	abbreviation: 'Chf.',
	chatroom: 'army-only',
	longTitle: 'Chief of the Army',
	rank: 3,
	recursiveRole: 'Army',
	shortTitle: 'Chief',
    },
    'NAVY': {
	abbreviation: 'Sec.',
	chatroom: 'navy-only',
	longTitle: 'Secretary of the Navy',
	rank: 3,
	recursiveRole: 'Navy',
	shortTitle: 'Secretary',
    },
    'AIR': {
	abbreviation: 'Cmdr.',
	chatroom: 'air-force',
	longTitle: 'Commander of the Air Force',
	rank: 3,
	recursiveRole: 'Air Force',
	shortTitle: 'Commander',
    },
    'MARINES': {
	abbreviation: 'Cmdt.',
	chatroom: 'marines-only',
	longTitle: 'Commandant of the Marines',
	rank: 3,
	recursiveRole: 'Marines',
	shortTitle: 'Commandant',
    },
};

// Returns a user with the given target rank, who doesn't already have an office.
// If all users of the target rank already have an office, returns null.
//   - targetRank: find a user of this rank exactly.
//   - userCache: for unit testing a mock user cache can be passed in. In
//                production the real user cache is passed in.
//   - chainOfCommand: the most recently computed chain of command.
function FindUnassignedUser(targetRank, chainOfCommand, userCache) {
    let foundUser = null;
    Object.keys(chainOfCommand).forEach((commissar_id) => {
	const cachedUser = userCache[commissar_id];
	const comUser = chainOfCommand[commissar_id];
	if (cachedUser && comUser && comUser.rank === targetRank && !cachedUser.office) {
	    foundUser = cachedUser;
	}
    });
    return foundUser;
}

// Calls an inner function for each executive with role. Typically 3-star Generals
// with roles Army, Navy, Air Force, and Marines.
function ForEachExecutiveWithRoles(innerFunction) {
    Object.values(commissarUserCache).forEach((user) => {
	if (user.office) {
	    const jobDescription = executiveOffices[user.office];
	    const recursiveRole = jobDescription.recursiveRole;
	    const personalRole = jobDescription.personalRole;
	    innerFunction(user.commissar_id, recursiveRole, personalRole);
	}
    });
}

// Updates the clan executives. Fire any users that don't match their jobs any
// more, then appoint new executives to fill any open spots.
//   - userCache: for unit testing, pass in a mock of the user cache. In
//                production, leave it out to default to the real user cache.
//   - chainOfCommand: the most recently computed chain of command.
function UpdateClanExecutives(chainOfCommand, userCache) {
    if (!userCache) {
	userCache = commissarUserCache;
    }
    if (!chainOfCommand || Object.keys(chainOfCommand).length <= 0) {
	// Do nothing if the chain of command isn't loaded / calculated yet.
	return;
    }
    const filledPositions = {};
    // Dismiss executives who don't match any more.
    Object.values(userCache).forEach((user) => {
	if (!user.office) {
	    return;
	}
	const jobDescription = executiveOffices[user.office];
	const chainUser = chainOfCommand[user.commissar_id];
	if ((user.office in filledPositions) || !chainUser || (chainUser.rank !== jobDescription.rank)) {
	    user.setOffice(null);
	} else {
	    filledPositions[user.office] = true;
	}
    });
    // Attempt to fill all empty executive roles.
    Object.keys(executiveOffices).forEach((jobID) => {
	const jobDescription = executiveOffices[jobID];
	if (jobID in filledPositions) {
	    return;
	}
	const appointee = FindUnassignedUser(jobDescription.rank, chainOfCommand, userCache);
	if (appointee) {
	    appointee.setOffice(jobID);
	}
    });
}

module.exports = {
    FindUnassignedUser,
    ForEachExecutiveWithRoles,
    UpdateClanExecutives,
};
