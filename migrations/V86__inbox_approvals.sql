BEGIN;

-- Zeitplaner-Läufe haben sich bisher jeden Tool-Aufruf selbst genehmigt
-- ('granted'), unabhängig von der Freigabe-Einstellung des Agenten. Das bleibt
-- der Standard, damit bestehende Jobs sich nicht ändern. Mit 'inbox' gilt die
-- Einstellung des Agenten: was er nicht von sich aus darf, fragt über den
-- Posteingang nach.
ALTER TABLE app.cron_jobs
    ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'granted';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'app' AND table_name = 'cron_jobs'
        AND constraint_name = 'cron_jobs_approval_mode_check') THEN
    ALTER TABLE app.cron_jobs ADD CONSTRAINT cron_jobs_approval_mode_check
      CHECK (approval_mode IN ('granted', 'inbox'));
  END IF;
END $$;

-- Wie lange eine Freigabe im Posteingang auf Antwort wartet. Danach gilt sie
-- als abgelehnt und der Lauf geht mit der Ablehnung weiter. NULL = Default 24.
INSERT INTO app.system_settings (key, value, description)
VALUES (
    'inbox_approval_timeout_hours',
    'null'::jsonb,
    'Stunden, die eine Tool-Freigabe im Posteingang auf Antwort wartet, bevor sie als abgelehnt gilt. Leer = Default 24.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
