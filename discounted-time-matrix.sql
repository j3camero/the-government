SELECT
  tt.lo_user_id AS lo_user_id,
  tt.hi_user_id AS hi_user_id,
  SUM(EXP(0.0000000439290175 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds) AS discounted_diluted_seconds
FROM time_together AS tt
INNER JOIN users AS u1 ON u1.commissar_id = tt.lo_user_id
INNER JOIN users AS u2 ON u2.commissar_id = tt.hi_user_id
GROUP BY tt.lo_user_id, tt.hi_user_id
ORDER BY SUM(EXP(0.0000000439290175 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds)
;
