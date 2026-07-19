# Tiefendiagnose: Das Trace-Panel

Das Trace-Panel ist das zentrale Analyse-Werkzeug in Ontheia. Es bietet einen tiefen Einblick in die Arbeitsweise der KI, indem es Informationen aus dem Gedächtnis, ausgeführte Werkzeuge und technische Systemereignisse an einem Ort bündelt.

## Aktivierung
Das Trace-Panel wird über das **Augen-Icon** oben rechts im Chat-Fenster gesteuert. 
- **Einblenden:** Klicke auf das Icon, um die Diagnose-Details für den aktuellen Chat zu öffnen.
- **Ausblenden:** Ein erneuter Klick schließt das Panel wieder, um den Fokus auf das Gespräch zu legen.
- **Automatischer Reset:** Beim Wechseln zwischen verschiedenen Chats wird das Panel aus Datenschutzgründen automatisch geschlossen.

## Aufbau & Tabs

Das Panel ist in vier spezialisierte Bereiche unterteilt:

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

### 3. Reasoning (Denkprozess)
Zeigt die Zwischenüberlegungen des Modells, sofern der Provider sie liefert (z. B. Anthropic Extended Thinking oder die Reasoning-Summaries der OpenAI-Responses-API).
- **Herkunft:** Jeder Eintrag ist mit dem Agenten beschriftet, der ihn erzeugt hat. Bei delegierten Läufen erscheint das Label des jeweiligen Sub-Agenten, sonst „Reasoning".
- **Vorschau & Details:** Längere Gedankengänge werden auf fünf Zeilen gekürzt und lassen sich per „Mehr anzeigen" vollständig aufklappen.
- **Zurückgehaltene Inhalte:** Gibt der Provider nur Teile des Reasonings frei, weist ein kursiver Hinweis darauf hin.
- **Voraussetzung:** Am Modell muss ein Reasoning-Effort gesetzt sein.
- **Zusammenfassung statt Rohtext:** Die OpenAI-Responses-API gibt die eigentliche Gedankenkette nie heraus, sondern eine vom Modell selbst verfasste Nacherzählung („Summary", meist mit fetter Überschrift). Anthropic liefert dagegen den Denktext direkt.
- **Leerer Tab trotz Denkphase:** OpenAI erzeugt eine solche Zusammenfassung nur sporadisch — und nicht proportional zum Aufwand: Ein Lauf mit 390 Reasoning-Tokens kann ohne Zusammenfassung bleiben, während einer mit 44 Tokens eine liefert. Hat das Modell nachweislich gedacht, ohne dass eine Zusammenfassung kam, nennt der Tab die verbrauchte Token-Zahl, damit sich „hat nicht gedacht" von „Provider verschweigt es" unterscheiden lässt. Anthropic und xAI füllen den Tab zuverlässig.

### 4. Events (Ereigniskette)
Die chronologische Liste aller technischen Hintergrundereignisse eines Runs.
- **Timing:** Zeitstempel für den Start der Anfrage, den Empfang von Tokens und den Abschluss.
- **Provider-Wiederholungen:** Schlägt eine Anfrage an den Provider vorübergehend fehl (Netzwerk-Aussetzer oder HTTP 429/5xx), erscheint eine `provider_retry`-Warnung mit der tatsächlichen Fehlerursache. Der Lauf wird automatisch bis zu zweimal wiederholt, statt die bereits geleistete Arbeit zu verwerfen.
- **JSON-Deep-Dive:** Für Experten lassen sich die Rohdaten jedes Ereignisses einzeln ausklappen.

## JSON exportieren
Über die Schaltfläche **„JSON kopieren"** oben im Panel lässt sich der gesamte Trace als JSON in die Zwischenablage übernehmen. Das Menü bietet zwei Varianten:
- **Ohne Reasoning kopieren:** Exportiert den Trace ohne die internen Denkprozesse des Modells – geeignet zum Teilen und für Fehlerberichte.
- **Mit Reasoning kopieren:** Enthält zusätzlich die vollständigen Reasoning-Einträge.

## Warum das Trace-Panel nutzen?
Das Trace-Panel hilft dir dabei, die "Blackbox" der KI zu durchleuchten. Es ist unverzichtbar, um zu verstehen, auf welcher Faktenbasis der Agent antwortet, warum er bestimmte Werkzeuge wählt oder an welcher Stelle ein komplexer Arbeitsablauf (Chain) hakt.
