-- Chat-Einstellungen (Composer-Auswahl) persistieren
BEGIN;

-- 1. Tabelle app.chats um settings-Spalte erweitern
ALTER TABLE app.chats ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- 2. Bestehende Chats initialisieren (optional, falls Default-Werte gewünscht sind)
-- Aktuell lassen wir es leer ({}), das Frontend nutzt dann die User-Defaults.

COMMIT;
