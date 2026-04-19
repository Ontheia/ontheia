# Tiefendiagnose: Das Trace-Panel

Das Trace-Panel ist das zentrale Analyse-Werkzeug in Ontheia. Es bietet einen tiefen Einblick in die Arbeitsweise der KI, indem es Informationen aus dem Gedächtnis, ausgeführte Werkzeuge und technische Systemereignisse an einem Ort bündelt.

## Aktivierung
Das Trace-Panel wird über das **Augen-Icon** oben rechts im Chat-Fenster gesteuert. 
- **Einblenden:** Klicke auf das Icon, um die Diagnose-Details für den aktuellen Chat zu öffnen.
- **Ausblenden:** Ein erneuter Klick schließt das Panel wieder, um den Fokus auf das Gespräch zu legen.
- **Automatischer Reset:** Beim Wechseln zwischen verschiedenen Chats wird das Panel aus Datenschutzgründen automatisch geschlossen.

## Aufbau & Tabs

Das Panel ist in drei spezialisierte Bereiche unterteilt:

### 1. Memory (Gedächtnis)
Hier werden alle Informationen aufgelistet, die der Agent aus dem Langzeitgedächtnis abgerufen hat.
- **Vorschau:** Einträge werden zunächst kompakt (max. 5 Zeilen) angezeigt.
- **Details:** Über die Schaltfläche "Alles anzeigen" kann der vollständige Kontext eines Eintrags eingeblendet werden.
- **Relevanz:** Der Score zeigt an, wie gut das gefundene Dokument zur gestellten Frage passt.

### 2. Tools (Werkzeuge)
Verfolge jede Aktion, die der Agent über MCP-Server (Model Context Protocol) ausgeführt hat.
- **Live & Historie:** Das Panel zeigt sowohl die Tool-Aufrufe des aktuellen Laufs als auch alle vergangenen Aktionen dieses Chats an.
- **Transparenz:** Du siehst die exakten Argumente, die an das Tool gesendet wurden, sowie das Ergebnis oder Fehlermeldungen des Servers.
- **Status-Indikatoren:** Farbpunkte signalisieren sofort den Erfolg (Grün), laufende Prozesse (Gelb) oder Fehler (Rot).

### 3. Events (Ereigniskette)
Die chronologische Liste aller technischen Hintergrundereignisse eines Runs.
- **Timing:** Zeitstempel für den Start der Anfrage, den Empfang von Tokens und den Abschluss.
- **JSON-Deep-Dive:** Für Experten lassen sich die Rohdaten jedes Ereignisses einzeln ausklappen.

## Warum das Trace-Panel nutzen?
Das Trace-Panel hilft dir dabei, die "Blackbox" der KI zu durchleuchten. Es ist unverzichtbar, um zu verstehen, auf welcher Faktenbasis der Agent antwortet, warum er bestimmte Werkzeuge wählt oder an welcher Stelle ein komplexer Arbeitsablauf (Chain) hakt.
