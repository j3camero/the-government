const assert = require('assert');
const UserCache = require('./commissar-user');
const sampleChainOfCommand = require('./sample-chain-of-command');

describe('CommissarUser', function() {
    it('FindUnassignedUser President', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	};
	const user = UserCache.FindUnassignedUser(0, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 6);
    });
    it('FindUnassignedUser President occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6, office: 'PRES' },
	    7: { commissar_id: 7 },
	};
	const user = UserCache.FindUnassignedUser(0, sampleChainOfCommand, mockUserCache);
	assert.equal(user, null);
    });
    it('FindUnassignedUser VP', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(1, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 42);
    });
    it('FindUnassignedUser VP occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42, office: 'VP' },
	};
	const user = UserCache.FindUnassignedUser(1, sampleChainOfCommand, mockUserCache);
	assert.equal(user, null);
    });
    it('FindUnassignedUser 4-star', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert(user.commissar_id === 38 || user.commissar_id === 7);
    });
    it('FindUnassignedUser 4-star missing A', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 7);
    });
    it('FindUnassignedUser 4-star missing B', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 38);
    });
    it('FindUnassignedUser 4-star A occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7 },
	    38: { commissar_id: 38, office: 'MINDEF' },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 7);
    });
    it('FindUnassignedUser 4-star B occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7, office: 'CJCS' },
	    38: { commissar_id: 38 },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
	assert.equal(user.commissar_id, 38);
    });
    it('FindUnassignedUser 4-star both occupied', () => {
	const mockUserCache = {
	    6: { commissar_id: 6 },
	    7: { commissar_id: 7, office: 'CJCS' },
	    38: { commissar_id: 38, office: 'MINDEF' },
	    42: { commissar_id: 42 },
	};
	const user = UserCache.FindUnassignedUser(2, sampleChainOfCommand, mockUserCache);
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
	const user = UserCache.FindUnassignedUser(3, sampleChainOfCommand, mockUserCache);
	assert(user.commissar_id === 77);
    });
});
