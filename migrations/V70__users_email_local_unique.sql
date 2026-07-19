-- Hardening: prevent {user} local-part collisions
--
-- The files skill derives a user's root directory from the local part of their
-- email (sources/skills/global/files/scripts/_common.py, resolve_user(); documented
-- there as a frozen contract):
--   1. local part before '@'
--   2. lowercased
--   3. restricted to [a-z0-9._-]
--   4. leading dots stripped
--
-- Without this migration rasher@brangl.de and rasher@example.com both resolve to
-- 'rasher' and silently share the same root directory — an isolation hole on
-- instances serving more than one email domain.
--
-- The generated column plus unique index rules this out at the database level and
-- therefore covers every creation path and any future email-change path. An
-- application-level check alone would be bypassable through other code paths.
--
-- NOTE: if resolve_user() is ever changed, the expression below must be changed
-- with it — otherwise the check and reality drift apart and the safety is only
-- apparent.

BEGIN;

-- 1a. Pre-flight: colliding local parts in existing data?
--     Raise a clear message instead of a cryptic unique-index violation.
DO $$
DECLARE
    dupes text;
BEGIN
    SELECT string_agg(format('%s -> %s', local_part, emails), E'\n  ')
      INTO dupes
      FROM (
        SELECT ltrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '.') AS local_part,
               string_agg(email, ', ') AS emails
          FROM app.users
         GROUP BY 1
        HAVING count(*) > 1
      ) d;

    IF dupes IS NOT NULL THEN
        RAISE EXCEPTION E'Migration aborted: colliding email local parts found.\n  %\nResolve the affected users first (change an email or remove a user).', dupes;
    END IF;
END $$;

-- 1b. Pre-flight: local part that normalizes to empty?
--     Such users could never use the files skill anyway (resolve_user() returns
--     NULL, roots are dropped fail-closed, exit 2).
DO $$
DECLARE
    empties text;
BEGIN
    SELECT string_agg(email, ', ')
      INTO empties
      FROM app.users
     WHERE ltrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '.') = '';

    IF empties IS NOT NULL THEN
        RAISE EXCEPTION E'Migration aborted: email(s) without a usable local part: %\nFix these first.', empties;
    END IF;
END $$;

-- 2. Generated column — mirrors resolve_user() exactly
ALTER TABLE app.users
    ADD COLUMN IF NOT EXISTS email_local text
    GENERATED ALWAYS AS (
        ltrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '.')
    ) STORED;

-- 3. An empty local part is unusable — reject it up front
ALTER TABLE app.users
    ADD CONSTRAINT users_email_local_not_empty CHECK (email_local <> '');

-- 4. The actual protection
CREATE UNIQUE INDEX IF NOT EXISTS users_email_local_uidx
    ON app.users (email_local);

COMMENT ON COLUMN app.users.email_local IS
    'Normalized email local part = the files skill''s {user} value (see _common.py resolve_user). Unique so two users can never share a root directory.';

COMMIT;
