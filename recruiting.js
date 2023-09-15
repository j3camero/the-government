// Recruiting leaderboard.
const db = require('./database');
const DiscordUtil = require('./discord-util');
const UserCache = require('./user-cache');

const inviteCache = {};

async function InitCache() {
    const sql = 'SELECT * FROM discord_invites WHERE uses > 0';
    const results = await db.Query(sql);
    for (const result of results) {
	inviteCache[result.code] = result.uses;
    }
    const n = Object.keys(inviteCache).length;
    console.log(`Loaded ${n} invites from the database into memory.`);
    if (n < 5) {
	console.log(`Loaded not very many invites from the database. This could indicate a problem with the database.`);
    }
}

async function ScanInvitesForChanges() {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const invites = await guild.invites.fetch();
    let changeDetected = false;
    let latestInviterId;
    for (const [code, invite] of invites) {
	if (!invite) {
	    continue;
	}
	if (!invite.code || !invite.inviterId || !invite.uses) {
	    continue;
	}
	const cachedUses = inviteCache[invite.code] || 0;
	if (invite.uses !== cachedUses) {
	    // Change detected. Update the database.
	    changeDetected = true;
	    latestInviterId = invite.inviterId;
	    console.log(`Change detected to invite code: ${invite.code} inviter_id: ${invite.inviterId} uses: ${cachedUses} -> ${invite.uses}`);
	    inviteCache[invite.code] = invite.uses;
	    const sql = 'INSERT INTO discord_invites (code, inviter_id, uses) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE uses = VALUES(uses)';
	    const fields = [invite.code, invite.inviterId, invite.uses];
	    await db.Query(sql, fields);
	    const cu = await UserCache.GetCachedUserByDiscordId(invite.inviterId);
	    if (cu) {
		const name = cu.getNicknameOrTitleWithInsignia();
		await DiscordUtil.MessagePublicChatChannel(`Good job ${name} for recruiting a new member`);
	    }
	}
    }
    if (changeDetected) {
	console.log('Change to invites detected. Update recruiting leaderboard.');
	await UpdateRecruitingLeaderboard(latestInviterId);
    }
}

async function UpdateRecruitingLeaderboard(idToHighlight) {
    const guild = await DiscordUtil.GetMainDiscordGuild();
    const recruitingLeaderboardChannelId = '1151299158750277662';
    const channel = await guild.channels.fetch(recruitingLeaderboardChannelId);
    const sql = 'SELECT inviter_id, SUM(uses) AS recruit_count FROM discord_invites WHERE uses > 0 GROUP BY inviter_id ORDER BY SUM(uses) DESC';
    const results = await db.Query(sql);
    const lines = [];
    let rankIndex = 1;
    for (const result of results) {
	const discordId = result.inviter_id;
	const recruitCount = result.recruit_count;
	const cu = await UserCache.GetCachedUserByDiscordId(discordId);
	if (!cu) {
	    continue;
	}
	const name = cu.getNicknameOrTitleWithInsignia();
	const formattedRecruitCount = recruitCount.toString().padStart(5);
	const plus = discordId === idToHighlight ? '+' : '';
	const line = `${plus}${formattedRecruitCount} ${name}`;
	lines.push(line);
	rankIndex++;
    }
    await channel.bulkDelete(99);
    await channel.send(`**Top Recruiters of All Time**`);
    await DiscordUtil.SendLongList(lines, channel, true);
}

module.exports = {
    InitCache,
    ScanInvitesForChanges,
    UpdateRecruitingLeaderboard,
};
