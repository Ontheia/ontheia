-- Setzt das Passwort des App-Users auf den konfigurierten Wert.
-- Wird beim Install-Script via Flyway-Placeholder ${ONTHEIA_APP_PASSWORD} übergeben.
-- Für bestehende Installationen: aktualisiert das Passwort auf den neuen Wert.
-- Für neue Installationen: überschreibt den Default aus V41.

ALTER ROLE ontheia_app WITH PASSWORD '${ONTHEIA_APP_PASSWORD}';
