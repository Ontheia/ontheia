BEGIN;

-- 1. User Status Typ erstellen (falls noch nicht vorhanden)
DO $$ BEGIN
    CREATE TYPE app.user_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Spalten zur users Tabelle hinzufügen
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS status app.user_status NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- 3. Bestehende Benutzer auf 'active' setzen
UPDATE app.users SET status = 'active';

-- 4. Tabelle für globale Systemeinstellungen
CREATE TABLE IF NOT EXISTS app.system_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Standard-Einstellungen initialisieren
INSERT INTO app.system_settings (key, value, description) 
VALUES 
    ('allow_self_signup', 'true'::jsonb, 'Erlaubt Benutzern, sich selbst über die Signup-Seite zu registrieren.'),
    ('require_admin_approval', 'true'::jsonb, 'Neue Registrierungen müssen von einem Admin freigeschaltet werden (status=pending).')
ON CONFLICT (key) DO NOTHING;

COMMIT;
