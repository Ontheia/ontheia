# Artefakte: Dateikarten & Panel-Editor

Dateien landen nicht mehr als langer Textblock im Chat. Liest oder schreibt ein Agent eine Datei, erscheint stattdessen eine **Karte** — ein Klick öffnet die Datei im Artefakt-Panel am rechten Rand, wo du sie ansehen und bearbeiten kannst.

## 1. Die Dateikarte

Die Karte zeigt Dateiname, Pfad und Größe. Sie entsteht automatisch, sobald ein Agent eine Datei liest (`read.py`) oder neu anlegt (`write.py`), und bleibt nach einem Neuladen der Seite erhalten.

- **Stift-Symbol:** Textdateien öffnen sich zum Bearbeiten.
- **Augen-Symbol:** PDFs öffnen sich in der Leseansicht.
- **„Teilansicht":** Bei sehr großen Dateien konnte nur ein Ausschnitt geladen werden — das Bearbeiten ist dann gesperrt, um Datenverlust zu verhindern.

Der Agent gibt den Dateiinhalt nicht mehr zusätzlich in seiner Antwort aus. Er verweist nur noch auf die Datei und zitiert einzelne Stellen, über die er tatsächlich spricht. Das hält den Chat übersichtlich und spart deutlich Token.

## 2. Das Artefakt-Panel

Das Panel öffnet sich rechts und lässt sich am linken Rand **in der Breite ziehen** — die eingestellte Breite bleibt gespeichert. Auf schmalen Bildschirmen nimmt es die volle Breite ein.

**Bearbeiten ↔ Vorschau:** Markdown- und Mermaid-Dateien öffnen in der Vorschau; ein Klick auf „Bearbeiten" zeigt den Quelltext. Die Vorschau rendert immer den *aktuellen* Stand im Editor — du kannst also tippen, umschalten, prüfen und erst dann speichern. Bei Mermaid-Dateien wird daraus ein vollwertiger Diagramm-Editor.

**Speichern:** Beim Öffnen wird die Datei frisch von der Platte gelesen — die Datei ist die Wahrheit, nicht der zwischengespeicherte Stand. Beim Speichern prüft Ontheia, ob sich die Datei zwischenzeitlich geändert hat (Prüfsumme). Ist das der Fall, erscheint statt eines stillen Überschreibens ein Hinweis mit der Möglichkeit, neu zu laden. Die vorherige Fassung wandert automatisch in den Papierkorb (`.trash/`).

**PDFs** werden direkt im Panel dargestellt: Seiten scrollen, Zoom-Schaltflächen, und der Text lässt sich **markieren und kopieren**. Die Darstellung erfolgt unabhängig von den PDF-Einstellungen deines Browsers.

## 3. Entwürfe aus dem Chat übernehmen

Jeder Codeblock in einer Antwort — auch ein gerendertes Mermaid-Diagramm — hat ein **Stift-Symbol**. Damit landet der Inhalt als Entwurf im Panel:

1. Inhalt im Editor überarbeiten, bei Mermaid und Markdown mit Live-Vorschau.
2. Pfad eintragen und **„Speichern unter…"** wählen.
3. Die Datei wird angelegt, eine Karte erscheint im Chat, und ab da verhält sie sich wie jede andere Dateikarte.

Solange nichts gespeichert ist, wird auch nichts angelegt — der Block in der Nachricht bleibt unverändert erhalten. Existiert unter dem Pfad bereits eine Datei, wird sie **nicht** überschrieben; du bekommst einen Hinweis und wählst einen anderen Namen. Liegt der Pfad außerhalb der freigegebenen Verzeichnisse, nennt die Meldung die erlaubten Wurzelverzeichnisse.

Typischer Ablauf: Du lässt einen Entwurf schreiben (etwa eine E-Mail), überarbeitest ihn im Panel, speicherst — und bittest den Agenten anschließend, genau diese Fassung zu verwenden.

## 4. Was der Agent von deinen Änderungen mitbekommt

Ontheia hält den Agenten auf Stand, ohne den ganzen Dateiinhalt erneut durch den Chat zu schicken:

- Zu jeder Anfrage bekommt er eine kompakte Liste der Dateien dieses Chats (Pfad, Kennung, Prüfsumme) — **nicht** deren Inhalt.
- Braucht er den Inhalt, lädt er ihn gezielt nach (`artifact_read` für den gespeicherten Stand, `read.py` für den Live-Stand der Datei).
- **Deine Bearbeitung wird wortgetreu weitergereicht:** Speicherst du im Panel, erhält der Agent beim nächsten Mal deinen exakten Wortlaut mit der Anweisung, ihn weder umzuformulieren noch zurückzudrehen.

> **Zu beachten:** Der gespeicherte Stand ist das, was Ontheia zuletzt gesehen hat. Änderst du eine Datei außerhalb von Ontheia (etwa direkt am Dateisystem), merkt der Agent das erst, wenn er sie erneut liest. Bitte ihn in dem Fall ausdrücklich, die Datei neu einzulesen.
