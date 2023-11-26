SELECT
  sessions.id,
  sessions.user_id,
  sessions.birth_time,
  sessions.hashed_secret,
  sessions.user_agent_seen_first,
  sessions.row_start,
  sessions.row_end,
  users.username
FROM
  (
    sessions
    LEFT JOIN users ON ((users.id = sessions.user_id))
  );