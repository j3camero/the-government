const assert = require('assert');
const CommissarUser = require('./commissar-user');
const Executives = require('./executive-offices');
const sampleChainOfCommand = require('./sample-chain-of-command');

describe('ExecutiveOffices', function() {
    it('FindUnassignedUser President', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	};
	const user = Executives.FindUnassignedUser(0, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 6);
    });
    it('FindUnassignedUser President occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6, office: 'PRES' },
	    7: { commissar_id: 7 },
	};
	const user = Executives.FindUnassignedUser(0, sampleChainOfCommand, mockUserCache);
	assert.equal(user, null);
    });
    it('FindUnassignedUser VP', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(1, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 42);
    });
    it('FindUnassignedUser VP occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42, office: 'VP' },
	};
	const user = Executives.FindUnassignedUser(1, sampleChainOfCommand, mockUserCache);
	assert.equal(user, null);
    });
    it('FindUnassignedUser 4-star', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert(user.commissar_id === 38 || user.commissar_id === 7);
    });
    it('FindUnassignedUser 4-star missing A', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 7);
    });
    it('FindUnassignedUser 4-star missing B', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 38);
    });
    it('FindUnassignedUser 4-star A occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    38: { commissar_id: 38, office: 'MINDEF' },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 7);
    });
    it('FindUnassignedUser 4-star B occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7, office: 'CJCS' },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 38);
    });
    it('FindUnassignedUser 4-star both occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7, office: 'CJCS' },
	    38: { commissar_id: 38, office: 'MINDEF' },
	    42: { commissar_id: 42 },
	};
	const user = Executives.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user, null);
    });
    it('FindUnassignedUser 3-star one spot left', () => {
	const mockUserCache = {
	    4: { commissar_id: 4, office: 'A' },
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    8: { commissar_id: 8, office: 'B' },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	    60: { commissar_id: 60, office: 'C' },
	    77: { commissar_id: 77 },
	};
	const user = Executives.FindUnassignedUser(3, sampleChainOfCommand, mockUserCache);
	assert(user.commissar_id === 77);
    });
    it('UpdateClanExecutives all empty', () => {
	const mockUserCache = {
	    4: new CommissarUser(4),
	    6: new CommissarUser(6),
	    7: new CommissarUser(7),
	    8: new CommissarUser(8),
	    38: new CommissarUser(38),
	    42: new CommissarUser(42),
	    60: new CommissarUser(60),
	    77: new CommissarUser(77),
	};
	Executives.UpdateClanExecutives(sampleChainOfCommand, mockUserCache);
	Object.values(mockUserCache).forEach((user) => {
	    assert(user.office);
	});
    });
    it('UpdateClanExecutives all full', () => {
	const mockUserCache = {
	    4: new CommissarUser(4, '', '', 3, null, 'MARINES'),
	    6: new CommissarUser(6, '', '', 0, null, 'PRES'),
	    7: new CommissarUser(7, '', '', 2, null, 'CJCS'),
	    8: new CommissarUser(8, '', '', 3, null, 'ARMY'),
	    38: new CommissarUser(38, '', '', 2, null, 'MINDEF'),
	    42: new CommissarUser(42, '', '', 1, null, 'VP'),
	    60: new CommissarUser(60, '', '', 3, null, 'NAVY'),
	    77: new CommissarUser(77, '', '', 3, null, 'AIR'),
	};
	Executives.UpdateClanExecutives(sampleChainOfCommand, mockUserCache);
	// Spot check one field, but nothing should have changed.
	assert.equal(mockUserCache[38].office, 'MINDEF');
    });
    it('UpdateClanExecutives fire & hire the right people', () => {
	const chainOfCommand = {
	    4: { id: 4, rank: 3 },
	    6: { id: 6, rank: 0 },
	    7: { id: 7, rank: 2 },
	    8: { id: 8, rank: 3 },
	    38: { id: 38, rank: 3 },  // Demoted!
	    42: { id: 42, rank: 1 },
	    60: { id: 60, rank: 2 },  // Promoted!
	    77: { id: 77, rank: 4 },  // Demoted!
	};
	const mockUserCache = {
	    4: new CommissarUser(4, '', '', 3, null, 'MARINES'),
	    6: new CommissarUser(6, '', '', 0, null, 'PRES'),
	    7: new CommissarUser(7, '', '', 2, null, 'CJCS'),
	    8: new CommissarUser(8, '', '', 3, null, 'ARMY'),
	    38: new CommissarUser(38, '', '', 2, null, 'MINDEF'),
	    42: new CommissarUser(42, '', '', 1, null, 'VP'),
	    60: new CommissarUser(60, '', '', 3, null, 'NAVY'),
	    77: new CommissarUser(77, '', '', 3, null, 'AIR'),
	};
	Executives.UpdateClanExecutives(chainOfCommand, mockUserCache);
	assert(mockUserCache[38].office);
	assert(mockUserCache[38].office != 'MINDEF');
	assert(mockUserCache[60].office);
	assert(mockUserCache[60].office, 'MINDEF');
	assert(!mockUserCache[77].office);
    });
});
