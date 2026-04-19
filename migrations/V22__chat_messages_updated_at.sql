-- Add updated_at column for chat_messages to match upsert logic
ALTER TABLE app.chat_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill any existing rows that might have NULL (safety for legacy data)
UPDATE app.chat_messages
  SET updated_at = COALESCE(updated_at, created_at);
