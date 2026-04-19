# Rechte Sidebar (Aktivitäts-Panel)

Die rechte Sidebar zeigt den Live-Status laufender Runs und ergänzende Informationen. Sie ist aufklappbar pro Abschnitt.

**Pfad:** Automatisch sichtbar in der Chat-Ansicht (rechts).

---

## Abschnitte

### Run-Status
Zeigt den aktuellen Zustand des laufenden Runs. Jeder Eintrag enthält Titel, Zeitstempel und eine kurze Beschreibung des Ereignisses (z. B. Tool-Aufruf, Delegierung, Fehler).

Kein aktiver Run → „Kein aktiver Run".

### Chain Console
Echtzeit-Log der Chain-Ausführung im Monospace-Format. Zeigt die Schrittfolge und Zwischenergebnisse einer laufenden Chain.

Keine Chain aktiv → „Bereit zur Ausführung".

### Warnungen
Systemhinweise und nicht-kritische Fehler. Anzahl offener Warnungen wird als Badge angezeigt.

### Tool Queue
Warteschlange ausstehender Tool-Aufrufe. Relevant wenn die Tool-Freigabe auf „Nachfragen" steht und mehrere Aufrufe gleichzeitig anstehen.

### Automatisierung
Übersicht aktiver Cron-Jobs und deren letzter Ausführung.

### MCP-Server
Status der konfigurierten MCP-Server: verbunden / getrennt / Fehler. Aktualisiert sich automatisch.

### Memory-Treffer
Zeigt Einträge aus dem Vektor-Gedächtnis, die für den aktuellen Chat-Kontext abgerufen wurden. Standardmäßig eingeklappt.

---

## Kopfzeile

| Element | Funktion |
| --- | --- |
| **Aktivität** (Titel) | Kennzeichnet das Panel. |
| **Kopieren-Button** | Kopiert den gesamten sichtbaren Sidebar-Inhalt in die Zwischenablage. |
