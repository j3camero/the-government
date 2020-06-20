-- Start a transaction so that the consolidation succeeds completely or else it gets rolled back.
START TRANSACTION;

-- Use the commissar database.
USE commissar;

-- Record the current time because it needs to be the same between the INSERT and the DELETE.
SET @current_time = CAST(CURRENT_TIMESTAMP AS CHAR(50));

-- Insert the new consolidated records. Make sure you use the right decay rate!
INSERT INTO time_together (t, lo_user_id, hi_user_id, duration_seconds, diluted_seconds)
SELECT
  @current_time AS t,
  tt.lo_user_id AS lo_user_id,
  tt.hi_user_id AS hi_user_id,
  SUM(tt.duration_seconds) AS duration_seconds,
  SUM(EXP(0.0000001337 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds) AS diluted_seconds
FROM time_together AS tt
GROUP BY tt.lo_user_id, tt.hi_user_id
ORDER BY SUM(EXP(0.0000001337 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds)
;

-- Delete the old records.
DELETE FROM time_together WHERE t < @current_time;

-- The changes are committed to the database only if we reach here without errors.
COMMIT;
