// Updates the Army, Navy, Air Force, and Marines.
//
// The four mini-clans are based on chain-of-command. Each 'branch' is headed by
// one of the four 3-star Generals.
const DiscordUtil = require('./discord-util');
const Executives = require('./executive-offices');

// Updates the mini-clans for the main Discord guild only.
async function UpdateRolesForMainDiscordGuild() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    UpdateRolesForOneGuild(guild);
}

// Updates the mini-clans for one Discord guild only.
async function UpdateRolesForOneGuild(guild, chainOfCommand) {
    if (!chainOfCommand) {
	// Bail if the chain of command isn't booted up yet.
	return;
    }
    // Get the Discord roles for each mini-clan.
    const allRoleNames = [
	'Army', 'Navy', 'Air Force', 'Marines',
	'Minister of Defense', 'Chairman of the Joint Chiefs of Staff',
    ];
    const rolesByName = {};
    allRoleNames.forEach(async (roleName) => {
	rolesByName[roleName] = await DiscordUtil.GetRoleByName(guild, roleName);
    });

    // Custom role updating function for mini-clans. It applies the given
    // roles and actively removes any others.
    function UpdateRoles(member, names) {
	const addRoles = [];
	const removeRoles = [];
	Object.keys(rolesByName).forEach((name) => {
	    const role = rolesByName[name];
	    if (names.includes(name)) {
		DiscordUtil.AddRole(member, role);
	    } else {
		DiscordUtil.RemoveRole(member, role);
	    }
	});
    }

    // A list of roles to be applied, keyed by commissar_id. It's this
    // way to accomodate giving senior leaders several roles.
    const rolesById = {};

    // Add a role to the list of roles buffered for one user by ID.
    function AddRoleToId(commissar_id, roleName) {
	const userRoles = rolesById[commissar_id] || [];
	userRoles.push(roleName);
	rolesById[commissar_id] = userRoles;
    }

    // Apply a role to a user and their children in the chain of command, recursively.
    function ApplyRoleDownwards(commissar_id, roleName) {
	AddRoleToId(commissar_id, roleName);
	const chainUser = chainOfCommand[commissar_id];
	if (!chainUser || !chainUser.children) {
	    return;
	}
	chainUser.children.forEach((child) => {
	    ApplyRoleDownwards(child, roleName);
	});
    }

    // Apply a role to a user and their bosses in the chain of command, recursively.
    function ApplyRoleUpwards(commissar_id, roleName) {
	AddRoleToId(commissar_id, roleName);
	const chainUser = chainOfCommand[commissar_id];
	if (chainUser && chainUser.boss) {
	    ApplyRoleUpwards(chainUser.boss, roleName);
	}
    }

    // Kick off the recursive role assignment.
    Executives.ForEachExecutiveWithRoles((execID, recursiveRole, personalRole) => {
	if (recursiveRole) {
	    ApplyRoleDownwards(execID, recursiveRole);
	    ApplyRoleUpwards(execID, recursiveRole);
	}
	if (personalRole) {
	    AddRoleToId(execID, personalRole);
	}
    });
    // Apply the calculated mini-clan roles to each user in the Discord guild.
    const members = await guild.members.fetch();
    members.forEach((member) => {
	const cu = UserCache.GetCachedUserByDiscordId(member.user.id);
	if (cu && cu.commissar_id in rolesById) {
	    const roleNames = rolesById[cu.commissar_id];
	    UpdateRoles(member, roleNames);
	}
    });
}

module.exports = {
    UpdateRolesForMainDiscordGuild,
};
