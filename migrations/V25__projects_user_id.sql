-- Projekte an User binden
ALTER TABLE app.projects
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app.users(id) ON DELETE SET NULL;

-- Bestehende Projekte ohne Zuordnung bleiben NULL (werden künftig nicht mehr sichtbar für neue User).
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON app.projects(user_id);
