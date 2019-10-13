-- Set up a MySQL database that stores the Commissar bot's memories.
CREATE DATABASE commissar;
USE commissar;

-- A list of which ranks there are.
CREATE TABLE ranks
(
    id INT NOT NULL AUTO_INCREMENT,
    title VARCHAR(16),
    insignia VARCHAR(8),
    discord_role VARCHAR(16),
    max_occupants INT,
    PRIMARY KEY (id)
);

INSERT INTO ranks
    (title, insignia, discord_role, max_occupants)
VALUES
    ('Recruit', '●', 'Grunt', 9000),
    ('Corporal', '●●', 'Grunt', 512),
    ('Sergeant', '●●●', 'Grunt', 256),
    ('Lieutenant', '●', 'Officer', 128),
    ('Captain', '●●', 'Officer', 64),
    ('Major', '●●●', 'Officer', 32),
    ('Colonel', '●●●●', 'Officer', 16),
    ('General', '★', 'General', 8),
    ('General', '★★', 'General', 4),
    ('General', '★★★', 'General', 2),
    ('General', '★★★★', 'General', 1);

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
    FOREIGN KEY (rank) REFERENCES ranks(id),
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
    FOREIGN KEY (lo_user_id) REFERENCES users(commissar_id),
    FOREIGN KEY (hi_user_id) REFERENCES users(commissar_id),
    INDEX user_index (lo_user_id, hi_user_id)
);
