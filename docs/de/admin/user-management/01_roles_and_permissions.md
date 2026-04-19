# Benutzerverwaltung, Rollen & Status

Ontheia nutzt ein rollenbasiertes Zugriffsmodell (RBAC) und ein statusbasiertes Freigabesystem, um die Funktionen des Systems abzusichern.

## 1. Benutzertypen (Rollen)

### Administrator (`admin`)
- Vollzugriff auf alle Tabs der Admin-Konsole.
- Kann MCP-Server starten/stoppen, Provider konfigurieren und globale Systemparameter ändern.
- Kann öffentliche Agenten und globale Chains erstellen.
- Berechtigung zur Verwaltung des Vektorspeichers und Audit-Logs.
- **Selbstschutz:** Das System verhindert, dass sich Administratoren selbst löschen, sperren oder ihre Admin-Rechte entziehen.

### Standard-Nutzer (`user`)
- Hat keinen Zugriff auf die Admin-Konsole.
- Kann nur Agenten und Projekte sehen, die für ihn freigegeben wurden.
- Verwaltet eigene API-Keys und persönliche Einstellungen.

## 2. Benutzer-Status

Jeder Benutzer hat einen Status, der den Zugriff auf das System steuert:

- **Aktiv (`active`):** Der Benutzer kann sich einloggen und alle freigegebenen Funktionen nutzen.
- **Ausstehend (`pending`):** Der Account wurde erstellt (z.B. via Self-Signup), wartet aber auf die Freigabe durch einen Administrator. Ein Login ist noch nicht möglich.
- **Gesperrt (`suspended`):** Der Account wurde durch einen Administrator deaktiviert. Alle aktiven Sitzungen werden beendet und ein Login ist blockiert.

## 3. Registrierungs-Workflow & Genehmigung

In den **Allgemeinen Einstellungen** der Admin-Konsole kann der Registrierungsprozess gesteuert werden:

### Selbstregistrierung (Self-Signup)
- **Aktiviert:** Neue Nutzer können sich über die `/signup` Seite registrieren.
- **Deaktiviert:** Neue Konten können nur durch einen Administrator manuell angelegt werden.

### Admin-Freigabe (Approval)
Ist die Option "Admin-Freigabe erforderlich" aktiviert, erhalten neue Nutzer nach der Registrierung automatisch den Status `pending`. 
Ein Administrator muss den Status in der **Benutzerverwaltung** manuell auf `active` setzen, bevor der Nutzer das System verwenden kann.

## 4. Agenten-Berechtigungen
In der Agenten-Verwaltung können Administratoren Agenten spezifischen Nutzern zuweisen:
- **Zuweisung:** Über den "User-Picker" werden Benutzer anhand ihrer E-Mail-Adresse ausgewählt.
- **Wirkung:** Der Agent erscheint sofort in der WebUI des entsprechenden Nutzers.
- **Teilen:** Durch das Hinzufügen mehrerer Nutzer können Agenten effektiv für Teams freigegeben werden, ohne sie direkt "öffentlich" zu machen.
