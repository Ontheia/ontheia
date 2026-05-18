# Automatisierung (Cron-Jobs)

Ontheia bietet ein integriertes System zur Automatisierung von Agenten-Workflows über zeitgesteuerte Jobs. Dies ermöglicht es, regelmäßige Aufgaben (z. B. tägliche Briefings, wöchentliche Berichte oder kontinuierliche Datenverarbeitung) ohne manuelle Interaktion auszuführen.

## Konzepte

### Wiederkehrende Zeitpläne (Cron)
Die Ausführung erfolgt basierend auf dem Standard-Cron-Format (Minute Stunde Tag Monat Wochentag).
Beispiele:
- `0 9 * * *`: Täglich um 09:00 Uhr.
- `*/15 * * * *`: Alle 15 Minuten.
- `0 0 * * 0`: Jeden Sonntag um Mitternacht.

### Einmalige Jobs (run_at)
Neben wiederkehrenden Zeitplänen können Jobs für einen **einmaligen Ausführungszeitpunkt** konfiguriert werden. Nach der Ausführung wird der Job automatisch deaktiviert. Einmalige Jobs eignen sich für termingenaue Erinnerungen oder zeitgesteuerte Einmalaktionen.

### Ausführungskontext
Jeder Cron-Job wird im Namen eines spezifischen Benutzers ausgeführt. Der Job nutzt:
1. **Einen Agenten**: Definiert die Identität und die verfügbaren MCP-Werkzeuge.
2. **Einen Task oder eine Chain**: Definiert den spezifischen System-Prompt oder den komplexen Workflow.
3. **Einen Prompt** (Optional): Entweder eine gespeicherte **Prompt-Vorlage** oder ein direkt eingegebener **Prompt-Text**, der als initiale Benutzernachricht an den Agenten gesendet wird. Vorlagen werden nach Scope in folgender Priorität aufgelöst: `task`-spezifisch → `chain`-spezifisch → `agent`-spezifisch → `global`.

### Chat-Fortsetzung
Wird einem Job ein **Chat-Ziel** zugewiesen, lädt der Job beim Ausführen den bisherigen Chat-Verlauf und setzt die Konversation in diesem bestehenden Chat fort. Die Chat-History wird automatisch per Rolling Summary komprimiert, falls der Kontext zu lang wird. Ohne Chat-Ziel erstellt jede Ausführung einen neuen Chat.

## Funktionen

### Überlappungsschutz (Concurrency Control)
Um Ressourcen zu schonen und Logik-Konflikte zu vermeiden, kann die Option **„Überlappung verhindern"** aktiviert werden. Ist diese aktiv, wird ein geplanter Lauf übersprungen, falls die vorherige Ausführung desselben Jobs noch nicht abgeschlossen ist.

### Desktop-Benachrichtigung bei Abschluss
Ist die Option **„Bei Abschluss benachrichtigen"** aktiv und hat der Benutzer Desktop-Benachrichtigungen in seinen Einstellungen aktiviert, wird nach Abschluss des Jobs eine Browser-Notification angezeigt. Diese enthält einen Direktlink zum zugehörigen Chat.

### Manuelle Ausführung
Jeder Job kann jederzeit manuell über das Play-Icon in der Admin-Konsole getriggert werden. Dies ist nützlich für Tests oder außerplanmäßige Ausführungen.

### Historie & Fehlersuche
In der Automatisierungs-Ansicht kann für jeden Job ein **Ausführungsverlauf** eingesehen werden. Dieser zeigt:
- Zeitpunkt der Ausführung.
- Status (Erfolgreich, Läuft, Fehler).
- Direktlink zum generierten Chat-Verlauf.
- Eventuelle Fehlermeldungen (z. B. falls ein MCP-Server offline war).

## Agenten-gesteuerte Zeitpläne

Agenten können über den internen **Scheduler-MCP-Server** eigenständig Zeitpläne erstellen und verwalten. Folgende Tools stehen zur Verfügung:

| Tool | Beschreibung |
| --- | --- |
| `create_schedule` | Erstellt einen neuen Zeitplan (wiederkehrend oder einmalig). Der Job wird standardmäßig im selben Chat fortgesetzt und mit Überlappungsschutz angelegt. |
| `cancel_schedule` | Deaktiviert einen vom Agenten selbst erstellten Zeitplan. |
| `list_schedules` | Listet alle aktiven, vom Agenten erstellten Zeitpläne des aktuellen Benutzers auf. |

Agentenerstelle Jobs sind in der Automatisierungs-Ansicht mit einem **Agent**-Badge gekennzeichnet.

### Task-Kontext-Beibehaltung
Wenn ein Agent einen Zeitplan anlegt, speichert das System automatisch die **Agent/Task-Kombination** des aufrufenden Runs. Bei Ausführung des Jobs wird exakt diese Konfiguration wiederverwendet — der Job läuft mit demselben System-Prompt (Task-Kontext) wie der Run, in dem er erstellt wurde.

### Schutz vor Scheduling-Schleifen
Beim Ausführen eines Cron-Jobs wird dem Modell automatisch ein **System-Hinweis** vorangestellt, der klarstellt, dass es sich um eine automatisierte Ausführung handelt und keine neuen Zeitpläne angelegt werden sollen. Dies verhindert Endlosschleifen — z. B. wenn der ursprüngliche Prompt eine Erinnerung enthielt, die das Modell sonst bei jeder Ausführung erneut einplanen würde.

### Tiefenschutz (Depth Guard)
Zusätzlich stehen die Scheduler-Tools nur in direkt vom Benutzer gestarteten Runs zur Verfügung (`schedule_depth = 0`). Jobs, die selbst durch einen Zeitplan ausgelöst wurden, erhalten keinen Zugriff auf die Scheduling-Tools. Beide Schutzebenen wirken unabhängig voneinander.

## Konfiguration

### Chat-Titel-Vorlagen
Der Titel des automatisch erstellten Chats kann über Platzhalter angepasst werden:
- `{{name}}`: Name des Cron-Jobs.
- `{{timestamp}}`: Lokaler Zeitstempel der Ausführung.

Beispiel: `Tagesbericht: {{name}} [{{timestamp}}]`

### Zeitzonen
Die Ausführung folgt der global konfigurierten **System Zeitzone** (einstellbar unter Administration → Allgemein). Änderungen an der Zeitzone führen zu einem automatischen Update aller geplanten Jobs im Hintergrund-Scheduler.
