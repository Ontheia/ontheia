# Nachrichtentypen & Formate

Ontheia stellt Informationen im Chatverlauf auf unterschiedliche Weise dar.

## 1. Text & Markdown
Antworten der KI werden als formatiertes Markdown gerendert. Dies beinhaltet:
- Fettschrift, Listen und Tabellen.
- **Code-Blöcke:** Mit Syntax-Highlighting, einer Schaltfläche zum Kopieren und einem Stift-Symbol, das den Inhalt als Entwurf ins Artefakt-Panel übernimmt (siehe [Artefakte](./06_artifacts.md)).
- Mathematische Formeln (LaTeX).

## 2. Diagramme (Mermaid)

Ein ```` ```mermaid ````-Codeblock wird im Chat als Diagramm gerendert — in Agenten-Antworten ebenso wie in eigenen Nachrichten. Bitte einen Agenten einfach: *„Zeichne den Ablauf als Mermaid-Flowchart."*

- **Während des Streamings** bleibt der Quellcode sichtbar; sobald das Diagramm vollständig ist, klappt der Block automatisch in die Grafik um.
- **Werkzeugleiste** am Block: Vergrößern/Verkleinern/Zurücksetzen, **Vollbild** (Overlay mit eigenem Zoom, schließen per Escape oder Klick auf den Hintergrund), Umschalten Diagramm ↔ Quellcode, Kopieren des Quellcodes sowie **Im Panel bearbeiten** (siehe [Artefakte](./06_artifacts.md)).
- **Ungültiger Mermaid-Code** wird unverändert als Codeblock angezeigt.

Unterstützt werden alle Mermaid-Diagrammtypen (Flowchart, Sequenz, Klassen, ER, Gantt u. v. m.). Das Rendering erfolgt vollständig lokal im Browser.

## 3. Bilder & grafische Inhalte

Bilder können direkt im Composer an eine Nachricht angehängt werden. Unterstützte Formate: **JPEG, PNG, GIF, WebP**.

- Das Bild wird zusammen mit dem Nachrichtentext an das KI-Modell übertragen (Vision-Input).
- Unterstützt von multimodalen Providern (z. B. Claude, ChatGPT).
- Anwendungsfälle: Screenshots, Diagramme, Dokumente, Fotos — der Agent kann sie beschreiben, analysieren oder Daten daraus extrahieren.

> **Hinweis:** Bildunterstützung erfordert einen Provider mit Vision-Fähigkeit. Unterstützt das gewählte Modell keine Bilder, wird der Anhang ignoriert.

## 4. Dateikarten

Liest oder schreibt ein Agent eine Datei, erscheint statt des Inhalts eine **Dateikarte**. Ein Klick öffnet die Datei im Artefakt-Panel zum Ansehen und Bearbeiten; PDFs öffnen sich in einer Leseansicht mit markierbarem Text. Details in [Artefakte](./06_artifacts.md).

## 5. Tool-Karten (Berechtigungen)
Wenn ein Agent ein Werkzeug (z. B. Zugriff auf eine Datei) nutzen möchte, erscheint eine Tool-Karte:
- **Details:** Zeigt an, welcher Server und welches Tool aufgerufen werden soll und welche Argumente gesendet werden.
- **Einmalig erlauben:** Führt den aktuellen Aufruf aus.
- **Immer erlauben:** Der Agent darf dieses Tool für den Rest des Chats ohne Rückfrage nutzen.
- **Ablehnen:** Verweigert den Zugriff (der Agent erhält eine entsprechende Fehlermeldung).

## 6. Status- & Fehlermeldungen
Technische Ereignisse werden kompakt dargestellt:
- **System-Hinweise:** Informieren über den Start von Chains oder das Laden von Memory.
- **Fehler:** Falls ein Provider nicht erreichbar ist oder ein Tool abstürzt, wird dies rot markiert dargestellt.
