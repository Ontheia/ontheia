# Erstellung & Basisdaten

Administratoren können Agenten zentral anlegen, um sie Nutzern oder Abteilungen zur Verfügung zu stellen.

## 1. Basis-Eigenschaften
- **Anzeigename:** Der Name, unter dem der Agent in der WebUI (z. B. im Picker) erscheint.
- **Beschreibung:** Eine Kurzinformation für den Nutzer über den Einsatzzweck des Agenten.
- **Provider & Modell:** Die technische Basis. (Hinweis: Diese können im AI-Provider Tab vorkonfiguriert werden).

## 2. Persona & Instruktionen
Obwohl Basis-Agenten oft einen generischen System-Prompt haben, können spezifischere Instruktionen über **Tasks** (siehe separater Dokumentations-Abschnitt) hinzugefügt werden. Ein Agent ohne speziellen Task nutzt die Standard-Instruktionen seines zugewiesenen Modells und die globalen System-Vorgaben von Ontheia.

## 3. Verwaltung
- **Bearbeiten:** Bestehende Agenten können jederzeit angepasst werden. Änderungen an Provider oder Tools wirken sich auf alle neuen Chat-Runs aus.
- **Löschen:** Beim Löschen eines Agenten werden auch alle verknüpften Tasks und Berechtigungen entfernt. Laufende Chats bleiben als Verlauf erhalten, können aber nicht mit diesem Agenten fortgesetzt werden.
