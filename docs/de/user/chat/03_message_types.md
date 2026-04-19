# Nachrichtentypen & Formate

Ontheia stellt Informationen im Chatverlauf auf unterschiedliche Weise dar.

## 1. Text & Markdown
Antworten der KI werden als formatiertes Markdown gerendert. Dies beinhaltet:
- Fettschrift, Listen und Tabellen.
- **Code-Blöcke:** Mit Syntax-Highlighting und einer Schaltfläche zum schnellen Kopieren des Codes.
- Mathematische Formeln (LaTeX).

## 2. Bilder & grafische Inhalte

Bilder können direkt im Composer an eine Nachricht angehängt werden. Unterstützte Formate: **JPEG, PNG, GIF, WebP**.

- Das Bild wird zusammen mit dem Nachrichtentext an das KI-Modell übertragen (Vision-Input).
- Unterstützt von multimodalen Providern (z. B. Claude, GPT-4o).
- Anwendungsfälle: Screenshots, Diagramme, Dokumente, Fotos — der Agent kann sie beschreiben, analysieren oder Daten daraus extrahieren.

> **Hinweis:** Bildunterstützung erfordert einen Provider mit Vision-Fähigkeit. Unterstützt das gewählte Modell keine Bilder, wird der Anhang ignoriert.

## 3. Tool-Karten (Berechtigungen)
Wenn ein Agent ein Werkzeug (z. B. Zugriff auf eine Datei) nutzen möchte, erscheint eine Tool-Karte:
- **Details:** Zeigt an, welcher Server und welches Tool aufgerufen werden soll und welche Argumente gesendet werden.
- **Einmalig erlauben:** Führt den aktuellen Aufruf aus.
- **Immer erlauben:** Der Agent darf dieses Tool für den Rest des Chats ohne Rückfrage nutzen.
- **Ablehnen:** Verweigert den Zugriff (der Agent erhält eine entsprechende Fehlermeldung).

## 4. Status- & Fehlermeldungen
Technische Ereignisse werden kompakt dargestellt:
- **System-Hinweise:** Informieren über den Start von Chains oder das Laden von Memory.
- **Fehler:** Falls ein Provider nicht erreichbar ist oder ein Tool abstürzt, wird dies rot markiert dargestellt.
