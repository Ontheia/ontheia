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
Jedes Projekt besitzt eine eindeutige ID. In der Admin-Konsole können spezifische **Memory-Policies** so konfiguriert werden, dass ein Agent nur Zugriff auf Dokumente erhält, die der ID des aktuellen Projekts zugeordnet sind (`vector.project.${project_id}`).
