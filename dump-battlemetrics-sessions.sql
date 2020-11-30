-- Use the commissar database.
USE commissar;

-- Dump all battlemetrics sessions.
SELECT * FROM battlemetrics_sessions
ORDER BY server_id, start_time, stop_time
;
