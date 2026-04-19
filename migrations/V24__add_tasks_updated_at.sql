-- Add updated_at to tasks for tracking edits (needed by PATCH /tasks).
ALTER TABLE app.tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill existing rows to a sensible value so timestamps are non-null.
UPDATE app.tasks
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;
