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
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

-- Stores a list of special Offices that can be occupied by the top-ranked players.
CREATE TABLE offices
(
    id INT NOT NULL AUTO_INCREMENT,
    fancy_title VARCHAR(32),  -- Ex: President, Commander of the Air Force.
    abbreviation VARCHAR(32),  -- Ex: Pres., Cmdr.
    rank INT NOT NULL,  -- The required rank to claim this office.
    role VARCHAR(32),  -- Discord role to apply recursively.
    occupant INT,  -- Commissar ID of the current occupant of the office.
    ordinal INT NOT NULL,  -- The 5th President. The 17th Chief of the Army.
    FOREIGN KEY (occupant) REFERENCES users(commissar_id)
);

INSERT INTO offices
    (fancy_title, abbreviation, rank, role, occupant, ordinal)
VALUES
    ('President', 'Pres.', 0, NULL, NULL, 0),
    ('Vice President', 'VP', 1, NULL, NULL, 0),
    ('Chairman of the Joint Chiefs of Staff', 'Chmn.', 2, NULL, NULL, 0),
    ('Minister of Defense', 'Minister', 2, NULL, NULL, 0),
    ('Chief of the Army', 'Chf.', 3, 'Army', NULL, 0),
    ('Commander of the Air Force', 'Cmdr.', 3, 'Air Force', NULL, 0),
    ('Marine Commandant', 'Cmdt.', 3, 'Marines', NULL, 0),
    ('Director of Intelligence', 'Dir.', 3, 'Intel', NULL, 0);

-- Stores the history of who was granted which Office and when.
CREATE TABLE office_history
(
    t TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id INT NOT NULL,
    occupant INT NOT NULL,
    FOREIGN KEY (occupant) REFERENCES users(commissar_id)
);
