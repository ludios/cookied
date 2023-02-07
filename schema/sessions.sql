CREATE TABLE sessions (
    -- 128-bit hash of the 128-bit secret used to check whether this is really client's session
    hashed_secret          uuid         NOT NULL,
    -- Limit of 1T can be raised if needed
    id                     bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id >= 1 AND id < 1000000000000),
    -- Which user this session is for
    user_id                bigint       NOT NULL REFERENCES users (id),
    -- Time the session was created
    birth_time             timestamptz  NOT NULL,
    -- User agent at the time the session was created
    user_agent_seen_first  text         NOT NULL
);
-- After we've stabilized the table a bit
--SELECT periods.add_system_time_period('sessions', 'row_start', 'row_end');
--SELECT periods.add_system_versioning('sessions');

CREATE TRIGGER sessions_check_update
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    WHEN (OLD.id != NEW.id OR OLD.birth_time != NEW.birth_time)
    EXECUTE FUNCTION raise_exception('cannot change id or birth_time');

CREATE TRIGGER sessions_forbid_truncate
    BEFORE TRUNCATE ON sessions
    EXECUTE FUNCTION raise_exception('truncate is forbidden');

-- Set the index to use for future CLUSTER operations
ALTER TABLE sessions CLUSTER ON sessions_pkey;
