-- Migration V47: Füge show_in_composer zu app.agents, app.providers und app.provider_models hinzu
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS show_in_composer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app.providers ADD COLUMN IF NOT EXISTS show_in_composer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app.provider_models ADD COLUMN IF NOT EXISTS show_in_composer BOOLEAN NOT NULL DEFAULT true;
