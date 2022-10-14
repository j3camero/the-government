const RoleID = require('./role-id');

module.exports = [
    {
	banPower: true,
	count: 0,
	insignia: '⚑',
	roles: [
	    RoleID.Marshal,
	    RoleID.MrPresident,
	    RoleID.Admin,
	],
	title: 'President',
	titleOverride: true,
    },
    {
	banPower: true,
	count: 0,
	insignia: '⚑',
	roles: [
	    RoleID.Marshal,
	    RoleID.MrVicePresident,
	    RoleID.Admin,
	],
	title: 'Vice President',
	titleOverride: true,
    },
    {
	banPower: true,
	count: 0,
	insignia: '★★★★',
	roles: [RoleID.General, RoleID.Admin],
	title: 'General',
    },
    {
	banPower: true,
	count: 0,
	insignia: '★★★',
	roles: [RoleID.General, RoleID.Admin],
	title: 'General',
    },
    {
	banPower: true,
	count: 0,
	insignia: '★★',
	roles: [RoleID.General, RoleID.Admin],
	title: 'General',
    },
    {
	banPower: true,
	count: 15,
	insignia: '★',
	roles: [RoleID.General, RoleID.Admin],
	title: 'General',
    },
    {
	count: 8,
	insignia: '❱❱❱❱',
	roles: [RoleID.Colonel, RoleID.Officer],
	title: 'Colonel',
    },
    {
	count: 8,
	insignia: '❱❱❱',
	roles: [RoleID.Major, RoleID.Officer],
	title: 'Major',
    },
    {
	count: 9,
	insignia: '❱❱',
	roles: [RoleID.Captain, RoleID.Officer],
	title: 'Captain',
    },
    {
	count: 10,
	insignia: '❱',
	roles: [RoleID.Lieutenant, RoleID.Officer],
	title: 'Lieutenant',
    },
    {
	count: 50,
	insignia: '⦁⦁⦁⦁',
	roles: [RoleID.StaffSergeant, RoleID.Grunt],
	title: 'Staff Sergeant',
    },
    {
	count: 100,
	insignia: '⦁⦁⦁',
	roles: [RoleID.Sergeant, RoleID.Grunt],
	title: 'Sergeant',
    },
    {
	count: 200,
	insignia: '⦁⦁',
	roles: [RoleID.Corporal, RoleID.Grunt],
	title: 'Corporal',
    },
    {
	count: 1000 * 1000,
	insignia: '⦁',
	roles: [RoleID.Recruit, RoleID.Grunt],
	title: 'Recruit',
    },
];
