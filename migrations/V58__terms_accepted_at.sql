-- Add terms_accepted_at to track when a user accepted the license/ToS
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
