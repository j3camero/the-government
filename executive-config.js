module.exports = {
    'PRES': {
	rank: 0,
	title: 'President',
    },
    'VP': {
	rank: 1,
	title: 'Vice President',
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
	personalRole: 'Commander of the Air Force',
	rank: 3,
	recursiveRole: 'Air Force',
    },
    'MARINES': {
	personalRole: 'Commandant of the Marines',
	rank: 3,
	recursiveRole: 'Marines',
    },
};
