-- Start a transaction so that the consolidation succeeds completely or else it gets rolled back.
START TRANSACTION;

-- Use the commissar database.
USE commissar;

-- The timestamp in the past where to stop consolidating records.
SET @one_week_ago = CAST((CURRENT_TIMESTAMP  - INTERVAL 168 HOUR) AS CHAR(50));

-- Insert the new consolidated records. Make sure you use the right decay rate!
INSERT INTO time_together (t, lo_user_id, hi_user_id, duration_seconds, diluted_seconds)
SELECT
  @one_week_ago AS t,
  tt.lo_user_id AS lo_user_id,
  tt.hi_user_id AS hi_user_id,
  SUM(tt.duration_seconds) AS duration_seconds,
  SUM(EXP(0.00000008913929791 * TIMESTAMPDIFF(SECOND, @one_week_ago, tt.t)) * tt.diluted_seconds) AS diluted_seconds
FROM time_together AS tt
WHERE t < @one_week_ago
GROUP BY tt.lo_user_id, tt.hi_user_id
ORDER BY SUM(EXP(0.00000008913929791 * TIMESTAMPDIFF(SECOND, @one_week_ago, tt.t)) * tt.diluted_seconds)
;

-- Delete the old records.
DELETE FROM time_together WHERE t < @one_week_ago;

-- The changes are committed to the database only if we reach here without errors.
COMMIT;
