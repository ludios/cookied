\set ON_ERROR_STOP on

CREATE SCHEMA cards;
SET search_path TO cards;

CREATE OR REPLACE FUNCTION raise_exception() RETURNS trigger AS $$
DECLARE
    message text;
BEGIN
    message := TG_ARGV[0];
    RAISE EXCEPTION '%', message;
END;
$$ LANGUAGE plpgsql;

-- A superuser should apply extensions.sql first

\ir users.sql
\ir sessions.sql
\ir cards.sql
