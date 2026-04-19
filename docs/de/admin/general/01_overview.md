# Allgemeine Systemeinstellungen

Der Bereich "Allgemein" in der Admin-Konsole dient der Steuerung globaler Parameter, die das Verhalten der KI-Agenten, die Benutzeroberfläche und die API-Auslastung für das gesamte Ontheia-System beeinflussen.

## Funktionsweise

Im Gegensatz zu persönlichen Benutzereinstellungen werden diese Werte vom Administrator zentral festgelegt und gelten systemweit. Sie überschreiben die Standardwerte der Anwendung.

## Technischer Hintergrund

Obwohl es sich um globale Einstellungen handelt, werden sie technisch in der Tabelle `app.user_settings` gespeichert. Hierzu nutzt das System eine reservierte **System-User-ID** (UUID: `00000000-0000-0000-0000-000000000000`), um Konsistenz mit dem restlichen Rechtesystem zu wahren.

### Persistenz-Details:
- **Tabelle:** `app.user_settings`
- **Spalte:** `settings` (JSONB)
- **Felder:** `runtime`, `uiFlags`, `promptOptimizer`, `builder`.
