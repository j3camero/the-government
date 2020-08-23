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
    rank INT NOT NULL DEFAULT 1,  -- Rank. 0 = President, 1 = VP, 2 = 4-star General, etc.
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Last time active in voice chat.
    office VARCHAR(32),  -- Which office (executive title) the user occupies, if any.
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
    start_time DATETIME NOT NULL,
    stop_time DATETIME NOT NULL,
    first_time BOOLEAN,
    in_game_name VARCHAR(64),
    server_id BIGINT NOT NULL,
    player_id BIGINT NOT NULL,
    identifier_id BIGINT NOT NULL,
    PRIMARY KEY (id),
    INDEX bmid_index (battlemetrics_id),
    INDEX server_index (server_id, start_time, stop_time),
    INDEX player_index (player_id, start_time, stop_time)
);
