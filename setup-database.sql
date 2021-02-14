-- Set up a MySQL database that stores the Commissar bot's memories.
CREATE DATABASE commissar;
USE commissar;

-- Store data about each user.
CREATE TABLE users
(
    commissar_id INT NOT NULL AUTO_INCREMENT,  -- Our clan's own set of IDs so we don't have to rely on Discord IDs.
    discord_id VARCHAR(32),  -- Discord ID.
    steam_id VARCHAR(32),  -- Steam ID.
    battlemetrics_id VARCHAR(32),  -- User ID on Battlemetrics.com.
    nickname VARCHAR(32),  -- Last known nickname.
    rank INT NOT NULL DEFAULT 12,  -- Rank. 0 = President, 1 = VP, 2 = 4-star General, etc.
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Last time active in voice chat.
    office VARCHAR(32),  -- Which office (executive title) the user occupies, if any.
    harmonic_centrality FLOAT DEFAULT 0,  -- A measure of this user's social influence.
    peak_rank INT DEFAULT 12,  -- The most senior rank (lowest rank number) ever achieved by this user.
    gender VARCHAR(1),  -- M, F, NULL, or any other single alphabetic letter.
                        -- L, G, B, T, Q... whatever letter people want to identify as!
			-- Must be a single alphabetic character from the ASCII range.
			-- It says so in the Bible. Everyone knows God created exactly 26 genders!
    citizen BOOLEAN DEFAULT TRUE,
    friend_role_id VARCHAR(32),  -- ID of the Discord role used to mark this user's friends.
    friend_category_id VARCHAR(32),  -- ID of the Discord category/section for a user's friends.
    friend_text_chat_id VARCHAR(32),  -- ID of the private Discord text chatroom for a user's friends.
    friend_voice_room_id VARCHAR(32),  -- ID of the private Discord voice room for a user's friends.
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

CREATE TABLE battlemetrics_sessions
(
    id INT NOT NULL AUTO_INCREMENT,
    battlemetrics_id VARCHAR(64),
    start_time DATETIME,
    stop_time DATETIME,
    first_time BOOLEAN,
    in_game_name VARCHAR(64),
    server_id BIGINT NOT NULL,
    player_id BIGINT NOT NULL,
    identifier_id BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE bmid_unique (battlemetrics_id),
    INDEX server_index (server_id, start_time, stop_time),
    INDEX player_index (player_id, start_time, stop_time)
);

CREATE TABLE trials
(
    trial_id INT NOT NULL AUTO_INCREMENT,
    defendant_id INT NOT NULL,
    accuser_id INT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    end_time TIMESTAMP,
    defendant_role_id VARCHAR(32),
    chatroom_id VARCHAR(32),
    vote_message_id VARCHAR(32),
    PRIMARY KEY(trial_id)
);

CREATE TABLE trial_votes
(
    trial_id INT NOT NULL,
    voter_id INT NOT NULL,
    vote INT NOT NULL,  -- 1 = GUILTY, 0 = NOT GUILTY
    PRIMARY KEY(trial_id, voter_id)
);
