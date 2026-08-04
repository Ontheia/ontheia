# Interaktionen im Chatverlauf

Zusätzlich zum reinen Chatten bietet Ontheia Funktionen zur Verwaltung der Konversation.

## 1. Nachrichten-Aktionen
Wenn du mit der Maus über eine Nachricht fährst, erscheinen Aktions-Icons:
- **Kopieren:** Kopiert den gesamten Inhalt der Nachricht in die Zwischenablage.
- **Löschen:** Entfernt eine Nachricht aus dem Verlauf. Hinweis: Dies beeinflusst den Kontext für nachfolgende Fragen.

## 2. Verlauf & Kontinuität
- **Fortsetzen:** Du kannst jederzeit in einen alten Chat zurückkehren. Der Agent "erinnert" sich an den bisherigen Verlauf (innerhalb der Grenzen seines Kontext-Fensters).
- **Automatischer Titel:** Sobald das erste Gespräch beendet ist, generiert Ontheia automatisch einen passenden Titel für den Chat in der Sidebar.

## 3. Suche im Chat

Über das **Lupen-Symbol** oberhalb des Verlaufs blendest du ein Suchfeld ein. Es filtert den Chat auf die Nachrichten, in denen der Begriff vorkommt — alles andere wird ausgeblendet, statt nur markiert.

Gesucht wird an drei Stellen, nicht nur im sichtbaren Text:

*   **Nachrichteninhalt** — was du und der Agent geschrieben habt.
*   **Werkzeug-Metadaten** — Argumente und Ergebnisse von Tool-Aufrufen. So findest du einen Lauf über den Dateinamen, den er verarbeitet hat, auch wenn dieser in keiner Antwort steht.
*   **Dateien** — Titel, Pfad und Inhalt der Artefakte, die an einer Nachricht hängen.

Treffer werden im Text hervorgehoben; öffnest du eine gefundene Datei, ist der Begriff auch in der Artefakt-Vorschau markiert. Das **×** im Feld leert die Suche, und beim Einblenden steht der Cursor bereits darin.

## 4. Streaming
Die Antworten der KI werden in Echtzeit gestreamt. Das bedeutet, du kannst anfangen zu lesen, während der Agent den Rest des Textes noch generiert.
