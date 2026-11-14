-- A trigger or a scheduled job may file the chats it creates under a project.
--
-- Every run of an automation without a fixed chat starts a new chat. A trigger
-- that fires often filled the chat list with its own entries; filed under a
-- project they stay together and out of the way.
--
-- ON DELETE SET NULL: deleting the project must not delete or break the
-- automation, its chats simply go back to the general list.

ALTER TABLE app.triggers
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES app.projects(id) ON DELETE SET NULL;

ALTER TABLE app.cron_jobs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES app.projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.triggers.project_id IS
  'Project that chats created by this trigger are filed under. Not applied to a fixed chat.';
COMMENT ON COLUMN app.cron_jobs.project_id IS
  'Project that chats created by this job are filed under. Not applied to a fixed chat.';
