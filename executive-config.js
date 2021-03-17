module.exports = {
    'PRES': {
	title: 'President',
	rank: 0,
    },
    'VP': {
	title: 'Vice President',
	rank: 1,
    },
    'CJCS': {
	personalRole: 'Chairman of the Joint Chiefs of Staff',
	rank: 2,
    },
    'MINDEF': {
	personalRole: 'Minister of Defense',
	rank: 2,
    },
    'ARMY': {
	personalRole: 'Chief of the Army',
	rank: 3,
	recursiveRole: 'Army',
    },
    'NAVY': {
	personalRole: 'Secretary of the Navy',
	rank: 3,
	recursiveRole: 'Navy',
    },
    'AIR': {
	personalRole: 'Administrator of the Air Force',
	rank: 3,
	recursiveRole: 'Air Force',
    },
    'MARINES': {
	personalRole: 'Commandant of the Marines',
	rank: 3,
	recursiveRole: 'Marines',
    },
    'INTER': {
	personalRole: 'Minister of the Interior',
	rank: 4,
    },
    'FOR': {
	personalRole: 'Minister of Foreign Affairs',
	rank: 4,
    },
    'JUS': {
	personalRole: 'Minister of Justice',
	rank: 4,
    },
    'INTEL': {
	personalRole: 'Director of Intelligence',
	rank: 4,
    },
    'FIN': {
	personalRole: 'Minister of Finance',
	rank: 4,
    },
    'DEPINTER': {
	personalRole: 'Deputy Minister of the Interior',
	rank: 5,
    },
    'DEPFOR': {
	personalRole: 'Deputy Minister of Foreign Affairs',
	rank: 5,
    },
    'DEPJUS': {
	personalRole: 'Deputy Minister of Justice',
	rank: 5,
    },
    'DEPINTEL': {
	personalRole: 'Deputy Director of Intelligence',
	rank: 5,
    },
    'DEPFIN': {
	personalRole: 'Deputy Minister of Finance',
	rank: 5,
    },
    'OPS': {
	personalRole: 'Director of Special Ops',
	rank: 5,
    },
};
