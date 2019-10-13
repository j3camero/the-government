SELECT
  duration_seconds,
  EXP(0.0000000439290175 * TIMESTAMPDIFF(SECOND, NOW(), t)) * duration_seconds AS discounted
FROM time_together;
