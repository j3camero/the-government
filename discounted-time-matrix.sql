SELECT
  tt.lo_user_id AS lo_user_id,
  tt.hi_user_id AS hi_user_id,
  SUM(EXP(0.0000001337 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds) AS discounted_diluted_seconds
FROM time_together AS tt
GROUP BY tt.lo_user_id, tt.hi_user_id
ORDER BY SUM(EXP(0.0000001337 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds)
;
