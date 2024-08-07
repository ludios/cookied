CREATE TABLE sessions (
	-- Limit of 1T can be raised if needed
	id                     bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id >= 1 AND id < 1000000000000),
	-- Which user this session is for
	user_id                bigint       NOT NULL REFERENCES users (id),
	-- Time the session was created
	birth_time             timestamptz  NOT NULL DEFAULT now(),
	-- 128-bit hash of the 128-bit secret used to check whether this is really client's session
	hashed_secret          bytea        NOT NULL CHECK (octet_length(hashed_secret) = 16),
	-- User agent at the time the session was created
	user_agent_seen_first  text         NOT NULL
);

SELECT periods.add_system_time_period('sessions', 'row_start', 'row_end');
SELECT periods.add_system_versioning('sessions');

CREATE TRIGGER sessions_check_update
	BEFORE UPDATE ON sessions
	FOR EACH ROW
	WHEN (
		OLD.id         != NEW.id         OR
		OLD.birth_time != NEW.birth_time
	)
	EXECUTE FUNCTION raise_exception('cannot change id or birth_time');

CREATE TRIGGER sessions_forbid_truncate
	BEFORE TRUNCATE ON sessions
	EXECUTE FUNCTION raise_exception('truncate is forbidden');

-- Set the index to use for future CLUSTER operations
ALTER TABLE sessions CLUSTER ON sessions_pkey;

CREATE FUNCTION new_session(user_id_ bigint, user_agent_seen_first_ text) RETURNS RECORD AS $$
DECLARE
	secret_ bytea := public.gen_random_bytes(16);
	hashed_secret_ bytea = substring(sha384(secret_) from 1 for 16);
	id_ bigint;
	ret RECORD;
BEGIN
	-- This must have a schema name here: clients aren't required to have `cookied` in
	-- their search_path, and in this case, without "cookied." here, the trigger will fail.
	INSERT
		INTO cookied.sessions (hashed_secret,  user_id,  user_agent_seen_first)
		               VALUES (hashed_secret_, user_id_, user_agent_seen_first_)
		RETURNING id INTO id_;
	SELECT id_, secret_ INTO ret;
	RETURN ret;
END;
$$ LANGUAGE plpgsql;



CREATE VIEW sessions_view AS
	SELECT
		sessions.*,
		users.username
	FROM sessions
	LEFT JOIN users ON users.id = sessions.user_id;
