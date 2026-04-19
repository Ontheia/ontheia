# Automatisierung (Cron-Jobs)

Ontheia bietet ein integriertes System zur Automatisierung von Agenten-Workflows über zeitgesteuerte Cron-Jobs. Dies ermöglicht es, regelmäßige Aufgaben (z. B. tägliche Briefings, wöchentliche Berichte oder kontinuierliche Datenverarbeitung) ohne manuelle Interaktion auszuführen.

## Konzepte

### Zeitpläne (Cron)
Die Ausführung erfolgt basierend auf dem Standard-Cron-Format (Minute Stunde Tag Monat Wochentag).
Beispiele:
- `0 9 * * *`: Täglich um 09:00 Uhr.
- `*/15 * * * *`: Alle 15 Minuten.
- `0 0 * * 0`: Jeden Sonntag um Mitternacht.

### Ausführungskontext
Jeder Cron-Job wird im Namen eines spezifischen Benutzers ausgeführt. Der Job nutzt:
1.  **Einen Agenten**: Definiert die Identität und die verfügbaren MCP-Werkzeuge.
2.  **Einen Task oder eine Chain**: Definiert den spezifischen System-Prompt oder den komplexen Workflow.
3.  **Eine Prompt-Vorlage (Optional)**: Der Inhalt der Vorlage wird als initiale Benutzernachricht an den Agenten gesendet. Vorlagen werden nach Scope in folgender Priorität aufgelöst: `task`-spezifisch → `chain`-spezifisch → `agent`-spezifisch → `global`. Im Editor werden nur Vorlagen angezeigt, die zum gewählten Agenten/Task/Chain-Kontext passen.

## Funktionen

### Überlappungsschutz (Concurrency Control)
Um Ressourcen zu schonen und Logik-Konflikte zu vermeiden, kann die Option **"Überlappung verhindern"** aktiviert werden. Ist diese aktiv, wird ein geplanter Lauf übersprungen, falls die vorherige Ausführung desselben Jobs noch nicht abgeschlossen ist.

### Manuelle Ausführung
Jeder Job kann jederzeit manuell über das Play-Icon in der Admin-Konsole getriggert werden. Dies ist nützlich für Tests oder außerplanmäßige Ausführungen.

### Historie & Fehlersuche
In der Automatisierungs-Ansicht kann für jeden Job ein **Ausführungsverlauf** eingesehen werden. Dieser zeigt:
- Zeitpunkt der Ausführung.
- Status (Erfolgreich, Läuft, Fehler).
- Direktlink zum generierten Chat-Verlauf.
- Eventuelle Fehlermeldungen (z. B. falls ein MCP-Server offline war).

## Konfiguration

### Chat-Titel-Vorlagen
Der Titel des automatisch erstellten Chats kann über Platzhalter angepasst werden:
- `{{name}}`: Name des Cron-Jobs.
- `{{timestamp}}`: Lokaler Zeitstempel der Ausführung.

Beispiel: `Tagesbericht: {{name}} [{{timestamp}}]`

### Zeitzonen
Die Ausführung folgt der global konfigurierten **System Zeitzone** (einstellbar unter Administration -> Allgemein). Änderungen an der Zeitzone führen zu einem automatischen Update aller geplanten Jobs im Hintergrund-Scheduler.
