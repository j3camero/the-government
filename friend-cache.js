
// In-memory cache of the most recent known friend room and friend role for each user.
// Key is the channel.id of a discord voice chat room. Value is the commissar_id
// of the owner of the room.
const friendRoomCache = {};
const friendRoleCache = {};

module.exports = {
    friendRoleCache,
    friendRoomCache,
};
