BEGIN;

ALTER TABLE app.tasks
    ADD COLUMN IF NOT EXISTS show_in_composer boolean NOT NULL DEFAULT true;

ALTER TABLE app.chains
    ADD COLUMN IF NOT EXISTS show_in_composer boolean NOT NULL DEFAULT true;

UPDATE app.tasks
   SET show_in_composer = true
 WHERE show_in_composer IS NULL;

UPDATE app.chains
   SET show_in_composer = true
 WHERE show_in_composer IS NULL;

COMMIT;
