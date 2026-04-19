-- Datenbank-Härtung: Eingeschränkter App-User für RLS-Erzwingung
-- Flyway läuft weiterhin als 'postgres' (Superuser), um Schema-Änderungen vorzunehmen.
-- Das Backend sollte diesen neuen User nutzen, damit RLS-Regeln garantiert greifen.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ontheia_app') THEN
        -- Erstelle den User (Passwort sollte in der .env überschrieben werden)
        CREATE ROLE ontheia_app WITH LOGIN PASSWORD 'ontheia_app_pwd_123';
    END IF;
END
$$;

-- 1. Zugriff auf Schemata gewähren
GRANT USAGE ON SCHEMA app TO ontheia_app;
GRANT USAGE ON SCHEMA vector TO ontheia_app;

-- 2. Berechtigungen auf bestehende Tabellen und Sequenzen
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app TO ontheia_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app TO ontheia_app;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA vector TO ontheia_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA vector TO ontheia_app;

-- 3. Berechtigungen für zukünftige Tabellen (erstellt durch Flyway/postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app 
    GRANT ALL PRIVILEGES ON TABLES TO ontheia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app 
    GRANT ALL PRIVILEGES ON SEQUENCES TO ontheia_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA vector 
    GRANT ALL PRIVILEGES ON TABLES TO ontheia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA vector 
    GRANT ALL PRIVILEGES ON SEQUENCES TO ontheia_app;

-- 4. Sicherstellen, dass der User RLS nicht umgehen kann (NOBYPASSRLS ist Standard, hier explizit)
ALTER ROLE ontheia_app NOBYPASSRLS;

COMMENT ON ROLE ontheia_app IS 'Eingeschränkter Anwendungsbenutzer für Ontheia Backend (erzwingt RLS).';
