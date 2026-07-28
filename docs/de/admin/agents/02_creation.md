# Erstellung & Basisdaten

Administratoren können Agenten zentral anlegen, um sie Nutzern oder Abteilungen zur Verfügung zu stellen.

## 1. Basis-Eigenschaften
- **Anzeigename:** Der Name, unter dem der Agent in der WebUI (z. B. im Picker) erscheint.
- **Beschreibung:** Eine Kurzinformation für den Nutzer über den Einsatzzweck des Agenten.
- **Provider & Modell:** Die technische Basis. (Hinweis: Diese können im AI-Provider Tab vorkonfiguriert werden).

## 2. Instruktionen
Instruktionen gehören nicht zum Agenten selbst, sondern zu seinen **[Tasks](../tasks/01_concept.md)**: Der **Task-Kontext** ist der System-Prompt, den das Modell zu Beginn eines Laufs erhält. Ohne gewählte Task entsteht **kein** System-Block — das Modell arbeitet dann ohne Instruktion; Skill-Katalog und Tool-Hinweis kommen davon unabhängig hinzu.

> **Bis einschließlich Version 0.5.0 gab es dafür zwei Wege:** eine Persona am Agenten *und* den Task-Kontext. Die Persona wurde nur beim Bootstrap geschrieben und nur als Rückfalloption gelesen, die der Task-Kontext sofort überschrieb — keine Route und keine Oberfläche konnte sie anzeigen oder korrigieren. Mit Version 0.6.0 ist sie aus Code und Datenbank entfernt (`V75`); der Task-Kontext ist die einzige Quelle.

## 3. Verwaltung
- **Bearbeiten:** Bestehende Agenten können jederzeit angepasst werden. Änderungen an Provider oder Tools wirken sich auf alle neuen Chat-Runs aus.
- **Löschen:** Beim Löschen eines Agenten werden auch alle verknüpften Tasks und Berechtigungen entfernt. Laufende Chats bleiben als Verlauf erhalten, können aber nicht mit diesem Agenten fortgesetzt werden.
