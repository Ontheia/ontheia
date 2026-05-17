-- V63: Agent-gesteuerte Cron-Jobs
-- Erweitert app.cron_jobs um einmalige Ausführung, direkten Prompt-Text,
-- Chat-Ausgabeziel, Agent-Tracking, Rekursionsschutz und Benachrichtigung.

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='prompt_text') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN prompt_text text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='run_at') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN run_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='chat_id') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN chat_id text REFERENCES app.chats(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='created_by_agent_id') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN created_by_agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='schedule_depth') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN schedule_depth smallint NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='app' AND table_name='cron_jobs' AND column_name='notify') THEN
    ALTER TABLE app.cron_jobs ADD COLUMN notify boolean NOT NULL DEFAULT false;
  END IF;

  -- schedule ist bisher NOT NULL — für einmalige Jobs (run_at) muss es nullable sein
  ALTER TABLE app.cron_jobs ALTER COLUMN schedule DROP NOT NULL;

END $$;

-- Constraint: genau eines von schedule oder run_at muss gesetzt sein
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema='app' AND table_name='cron_jobs'
      AND constraint_name='cron_jobs_schedule_or_run_at') THEN
    ALTER TABLE app.cron_jobs ADD CONSTRAINT cron_jobs_schedule_or_run_at
      CHECK (
        (schedule IS NOT NULL AND run_at IS NULL) OR
        (schedule IS NULL AND run_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cron_jobs_run_at_idx ON app.cron_jobs(run_at)
  WHERE active = true AND run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cron_jobs_created_by_agent_idx ON app.cron_jobs(created_by_agent_id)
  WHERE created_by_agent_id IS NOT NULL;
