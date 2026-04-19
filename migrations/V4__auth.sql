BEGIN;

CREATE TABLE IF NOT EXISTS app.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id text UNIQUE,
    email text NOT NULL,
    password_hash text,
    name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_check CHECK (email <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON app.users (lower(email));

CREATE TABLE IF NOT EXISTS app.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON app.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON app.sessions (expires_at);

COMMIT;
