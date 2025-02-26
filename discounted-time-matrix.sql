SELECT
  tt.lo_user_id AS lo_user_id,
  tt.hi_user_id AS hi_user_id,
  SUM(EXP(0.0000001337089469 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds) AS discounted_diluted_seconds
FROM time_together AS tt
INNER JOIN users AS lo on lo.commissar_id = tt.lo_user_id
INNER JOIN users AS hi ON hi.commissar_id = tt.hi_user_id
WHERE lo.citizen IS TRUE AND hi.citizen IS TRUE
GROUP BY tt.lo_user_id, tt.hi_user_id
ORDER BY SUM(EXP(0.0000001337089469 * TIMESTAMPDIFF(SECOND, NOW(), tt.t)) * tt.diluted_seconds)
;
