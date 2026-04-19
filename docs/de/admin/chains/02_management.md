# Verwaltung von Chains

In der Admin-Konsole können Sie die Rahmenbedingungen für neue Abläufe festlegen.

## 1. Neue Chain anlegen
Bevor Schritte definiert werden können, muss das Basis-Objekt erstellt werden:
- **Agent:** Der Haupt-Agent, dem diese Chain zugeordnet ist. (Wird oft als "Einstiegspunkt" oder Koordinator genutzt).
- **Name:** Der Anzeigename im System.
- **Beschreibung:** Erklärt den Zweck des Workflows.

## 2. Sichtbarkeit im Composer
Wie bei Tasks steuert das Feld **"Im Composer anzeigen"**, ob Nutzer diese Chain direkt im Chat-Frontend auswählen können.
- **Wichtig:** Eine Chain erscheint nur dann im Composer, wenn der zugewiesene Agent für den Nutzer sichtbar ist.

## 3. Versionierung
Ontheia speichert jede Änderung an der Chain-Definition als neue Version in der Tabelle `app.chain_versions`. 
- **Auto-Save:** Der Designer speichert Fortschritte automatisch.
- **Aktivierung:** Nur die als "aktiv" markierte Version wird bei einem Run ausgeführt.
