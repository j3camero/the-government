-- Set up a MySQL database that stores the Commissar bot's memories.
CREATE DATABASE commissar;
USE commissar;

-- Store data about each user.
CREATE TABLE users
(
    commissar_id INT NOT NULL AUTO_INCREMENT,  -- Our clan's own set of IDs so we don't have to rely on Discord IDs.
    discord_id VARCHAR(32),  -- Discord ID.
    steam_id VARCHAR(32),  -- Steam ID.
    steam_name VARCHAR(128),  -- Steam display name.
    steam_name_update_time TIMESTAMP,
    battlemetrics_id VARCHAR(32),  -- User ID on Battlemetrics.com.
    nickname VARCHAR(32),  -- Last known nickname.
    nick VARCHAR(32),  -- A user-supplied preferred nickname.
    rank INT NOT NULL DEFAULT 12,  -- Rank. 0 = President, 1 = VP, 2 = 4-star General, etc.
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Last time active in voice chat.
    office VARCHAR(32),  -- Which office (executive title) the user occupies, if any.
    harmonic_centrality FLOAT DEFAULT 0,  -- A measure of this user's social influence.
    peak_rank INT DEFAULT 12,  -- The most senior rank (lowest rank number) ever achieved by this user.
    gender VARCHAR(1),  -- M, F, NULL, or any other single alphabetic letter.
                        -- L, G, B, T, Q... whatever letter people want to identify as!
			-- Must be a single alphabetic character from the ASCII range.
			-- It says so in the Bible. Everyone knows God created exactly 26 genders!
    citizen BOOLEAN DEFAULT TRUE,  -- Is this user currently a member of the main Discord guild?
    good_standing BOOLEAN DEFAULT TRUE,  -- The preliminary outcome of a pending ban vote trial.
    friend_role_id VARCHAR(32),  -- ID of the Discord Role for a user's friends.
    friend_category_id VARCHAR(32),  -- ID of the Discord category/section for a user's friends.
    friend_text_chat_id VARCHAR(32),  -- ID of the private Discord text chatroom for a user's friends.
    friend_voice_room_id VARCHAR(32),  -- ID of the private Discord voice room for a user's friends.
    ban_vote_start_time TIMESTAMP,  -- Time when the vote to ban this user started. Resets anytime the trial outcome flips.
    ban_vote_chatroom VARCHAR(32),  -- ID of the Discord text chat room used for a vote to ban this user.
    ban_vote_message VARCHAR(32),  -- ID of the Discord chat message used for a vote to ban this user.
    yen INT,  -- How many yen this user has. yen are for-fun currency.
    inactivity_tax_paid_until TIMESTAMP,  -- Last time this user was taxed.
    ban_conviction_time TIMESTAMP,  -- When this user was convicted & banned in ban court.
    ban_pardon_time TIMESTAMP,  -- When this user was convicted & banned in ban court.
    presidential_election_vote INT,  -- The commissar_id that this user is voting for in the presidential election. NULL if has not voted.
    presidential_election_message_id VARCHAR(32),  -- ID of the discord message used to display this user on the presidential election ballot.
    PRIMARY KEY (commissar_id),
    INDEX discord_index (discord_id)
);

-- For logging the time that users spend together. It is a running log
-- so you must sum over time to get the totals.
CREATE TABLE time_together
(
    t TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lo_user_id INT NOT NULL,
    hi_user_id INT NOT NULL,
    duration_seconds FLOAT NOT NULL,
    diluted_seconds FLOAT NOT NULL,
    FOREIGN KEY (lo_user_id) REFERENCES users(commissar_id),
    FOREIGN KEY (hi_user_id) REFERENCES users(commissar_id),
    INDEX user_index (lo_user_id, hi_user_id)
);

CREATE TABLE ban_votes
(
    defendant_id INT NOT NULL,
    voter_id INT NOT NULL,
    vote INT NOT NULL,  -- 0 = NOVOTE, 1 = GUILTY, 2 = NOT GUILTY
    PRIMARY KEY(defendant_id, voter_id)
);

CREATE TABLE discord_invites
(
    code VARCHAR(32),
    inviter_id VARCHAR(32),
    uses INT,
    PRIMARY KEY(code)
);
