SELECT
  sessions.id,
  sessions.user_id,
  sessions.birth_time,
  sessions.hashed_secret,
  sessions.user_agent_seen_first,
  users.username
FROM
  (
    sessions
    LEFT JOIN users ON ((users.id = sessions.user_id))
  );