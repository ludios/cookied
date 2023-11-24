-- Restrict to valid DNS labels, just in case one needs per-user subdomains later
-- Restrict to 31 characters instead of 63 because that is too many
CREATE DOMAIN username AS text
	CHECK (
		octet_length(VALUE) >= 1 AND
		octet_length(VALUE) <= 31 AND
		-- A host name (label) MUST NOT start or end with a '-' (dash)
		VALUE !~ '\A-' AND
		VALUE !~ '-\Z' AND
		-- A host name (label) MUST NOT consist of all numeric values
		VALUE !~ '\A[0-9]+\Z' AND
		VALUE ~ '\A[-a-zA-Z0-9]+\Z'
	);

-- Like username, but all lowercase and with [i1] -> l and 0 -> o to avoid visual ambiguity
CREATE DOMAIN visual_username AS text
	CHECK (
		VALUE ~ '\A[-a-hj-z1-9]+\Z'
	);

CREATE FUNCTION get_visual_username(username username) RETURNS visual_username
	LANGUAGE SQL
	IMMUTABLE
	RETURN
		REPLACE(
			REPLACE(
				REPLACE(LOWER($1),
				'i', 'l'),
			'1', 'l'),
		'0', 'o');

CREATE TABLE users (
	-- Limit of 1T can be raised if needed
	id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (id >= 1 AND id < 1000000000000),
	-- The username with its preferred casing
	username         username     NOT NULL,
	hashed_password  text         NOT NULL,
	creation_time    timestamptz  NOT NULL DEFAULT now()
);

-- After we've stabilized the table a bit
--SELECT periods.add_system_time_period('users', 'row_start', 'row_end');
--SELECT periods.add_system_versioning('users');

CREATE UNIQUE INDEX users_lower_username_index ON users (LOWER(username));
CREATE UNIQUE INDEX users_visual_username_index ON users (get_visual_username(username));

CREATE TRIGGER users_check_update
	BEFORE UPDATE ON users
	FOR EACH ROW
	WHEN (
		OLD.id            != NEW.id            OR
		OLD.creation_time != NEW.creation_time
	)
	EXECUTE FUNCTION raise_exception('cannot change id or creation_time');

CREATE TRIGGER users_forbid_truncate
	BEFORE TRUNCATE ON users
	EXECUTE FUNCTION raise_exception('truncate is forbidden');

-- Set the index to use for future CLUSTER operations
ALTER TABLE users CLUSTER ON users_pkey;
