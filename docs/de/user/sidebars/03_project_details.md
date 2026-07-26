# Projekt-Management im Detail

Projekte ermöglichen eine strukturierte Ablage deiner Konversationen und dienen gleichzeitig als Filter für das Langzeitgedächtnis.

## 1. Projekte verwalten
- **Anlegen:** Über das Plus-Icon in der Sidebar erstellst du neue Ordner.
- **Verschachteln:** Du kannst Projekte beim Erstellen oder Bearbeiten einem übergeordneten Projekt zuweisen.
- **Verschieben:** Bestehende Chats können über ihr Kontextmenü (Drei-Punkte-Icon) einem Projekt zugewiesen werden.


## 2. Projekt-Aktionen
Klicke mit der rechten Maustaste (oder auf das Menü-Icon) eines Projekts, um:
- Es **umzubenennen**.
- Es zu **löschen** (du kannst wählen, ob die enthaltenen Chats ebenfalls gelöscht oder nur in den allgemeinen Verlauf verschoben werden sollen).
- Einen **Neuen Chat** direkt innerhalb dieses Projekts zu starten.

## 3. Technischer Hintergrund
Jedes Projekt besitzt eine eindeutige ID. Läuft ein Chat innerhalb eines Projekts, wird diese ID als `project_id` in den Metadaten der dabei entstehenden Gedächtniseinträge vermerkt.

Gespeichert wird alles in den normalen Namespaces des Nutzers (`vector.user.*` / `vector.agent.*`) — ein Projekt ist eine Ordnungshilfe, kein eigener Speicherbereich. Die `project_id` dient als **Filter**: in der Admin-Konsole und über die API lässt sich eine Suche damit auf ein Projekt eingrenzen. Der automatische Gedächtnisabruf im Chat nutzt diesen Filter nicht — ein Agent sieht die Einträge des Nutzers unabhängig davon, in welchem Projekt sie entstanden sind.
