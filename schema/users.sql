CREATE TABLE users (
    -- Limit of 1T can be raised if needed
    id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id >= 1 AND id < 1000000000000),
    username       text         NOT NULL,
    creation_time  timestamptz  NOT NULL
);
-- After we've stabilized the table a bit
--SELECT periods.add_system_time_period('users', 'row_start', 'row_end');
--SELECT periods.add_system_versioning('users');

CREATE TRIGGER users_check_update
    BEFORE UPDATE ON users
    FOR EACH ROW
    WHEN (OLD.id != NEW.id OR OLD.creation_time != NEW.creation_time)
    EXECUTE FUNCTION raise_exception('cannot change id or creation_time');

CREATE TRIGGER users_forbid_truncate
    BEFORE TRUNCATE ON users
    EXECUTE FUNCTION raise_exception('truncate is forbidden');

-- Set the index to use for future CLUSTER operations
ALTER TABLE users CLUSTER ON users_pkey;
