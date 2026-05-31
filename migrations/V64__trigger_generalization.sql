-- V64: Generalize run trigger (cron_job_id → trigger_type + trigger_id)
-- Prepares run_logs for webhook triggers alongside cron triggers.

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='run_logs' AND column_name='trigger_type') THEN
    ALTER TABLE app.run_logs ADD COLUMN trigger_type text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='run_logs' AND column_name='trigger_id') THEN
    ALTER TABLE app.run_logs ADD COLUMN trigger_id uuid;
  END IF;

END $$;

-- Migrate existing cron_job_id data
UPDATE app.run_logs
SET trigger_type = 'cron',
    trigger_id   = cron_job_id
WHERE cron_job_id IS NOT NULL
  AND trigger_id IS NULL;

-- Index for fast per-trigger queries
CREATE INDEX IF NOT EXISTS run_logs_trigger_idx
  ON app.run_logs (trigger_type, trigger_id)
  WHERE trigger_id IS NOT NULL;

-- cron_job_id is retained (not dropped) to avoid breaking existing rows
-- and any external queries. New writes target trigger_type/trigger_id only.
