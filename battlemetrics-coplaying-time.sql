-- Calculate the co-playing time by joining the sessions by server ID, start, and stop time.

-- Use the commissar database.
USE commissar;

SELECT
    a.player_id AS player_a,
    b.player_id AS player_b,
    SUM(TIMESTAMPDIFF(SECOND,
	GREATEST(a.start_time, b.start_time),
	LEAST(a.stop_time, b.stop_time))
    ) AS coplaying_seconds
FROM battlemetrics_sessions a
INNER JOIN battlemetrics_sessions b ON b.server_id = a.server_id
WHERE a.start_time IS NOT NULL AND a.stop_time IS NOT NULL
AND b.start_time IS NOT NULL AND b.stop_time IS NOT NULL
AND a.start_time <= b.start_time
AND b.start_time < a.stop_time
GROUP BY a.player_id, b.player_id
;
