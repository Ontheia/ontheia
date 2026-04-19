# Nachrichtentypen & Formate

Ontheia stellt Informationen im Chatverlauf auf unterschiedliche Weise dar.

## 1. Text & Markdown
Antworten der KI werden als formatiertes Markdown gerendert. Dies beinhaltet:
- Fettschrift, Listen und Tabellen.
- **Code-Blöcke:** Mit Syntax-Highlighting und einer Schaltfläche zum schnellen Kopieren des Codes.
- Mathematische Formeln (LaTeX).

## 2. Tool-Karten (Berechtigungen)
Wenn ein Agent ein Werkzeug (z. B. Zugriff auf eine Datei) nutzen möchte, erscheint eine Tool-Karte:
- **Details:** Zeigt an, welcher Server und welches Tool aufgerufen werden soll und welche Argumente gesendet werden.
- **Einmalig erlauben:** Führt den aktuellen Aufruf aus.
- **Immer erlauben:** Der Agent darf dieses Tool für den Rest des Chats ohne Rückfrage nutzen.
- **Ablehnen:** Verweigert den Zugriff (der Agent erhält eine entsprechende Fehlermeldung).

## 3. Status- & Fehlermeldungen
Technische Ereignisse werden kompakt dargestellt:
- **System-Hinweise:** Informieren über den Start von Chains oder das Laden von Memory.
- **Fehler:** Falls ein Provider nicht erreichbar ist oder ein Tool abstürzt, wird dies rot markiert dargestellt.
