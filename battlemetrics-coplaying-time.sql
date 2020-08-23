SELECT
    a.player_id AS player_a,
    b.player_id AS player_b,
    a.server_id AS server_id,
    GREATEST(a.start_time, b.start_time, '') AS start_time,
    LEAST(a.stop_time, b.stop_time, '') AS stop_time
FROM battlemetrics_sessions a
INNER JOIN battlemetrics_sessions b ON b.server_id = a.server_id
WHERE ((a.start_time >= '' AND a.start_time < '') OR (a.stop_time >= '' AND a.stop_time < ''))
AND ((b.start_time >= '' AND b.start_time < '') OR (b.stop_time >= '' AND b.stop_time < ''))
AND a.start_time <= b.start_time
AND b.start_time < a.stop_time
;
