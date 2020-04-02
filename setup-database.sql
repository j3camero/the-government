-- Set up a MySQL database that stores the Commissar bot's memories.
CREATE DATABASE commissar;
USE commissar;

-- Store data about each user.
CREATE TABLE users
(
    commissar_id INT NOT NULL AUTO_INCREMENT,
    discord_id VARCHAR(32),
    steam_id VARCHAR(32),
    nickname VARCHAR(32),
    rank INT NOT NULL DEFAULT 1,
    participation_score FLOAT NOT NULL DEFAULT 0,
    participation_update_date DATE,
    rank_limit INT DEFAULT 1,
    rank_limit_cooldown TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
