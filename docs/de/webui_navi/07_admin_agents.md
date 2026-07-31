# Admin-Konsole › Agents

**Pfad:** Avatar-Dropdown → Administration → Agents

Tab-Leiste: **Agents** · **Tasks** · **Chains**

---

## Tab: Agents

**Formular Agent anlegen / bearbeiten:**

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Anzeigename | Text | ✓ | Sichtbarer Name des Agents in der Oberfläche. |
| Beschreibung | Textarea | | Beschreibungstext, der im Composer und als Nachricht des Tages angezeigt werden kann. |
| Provider | Dropdown | | KI-Provider, der diesem Agent zugeordnet ist. |
| Standard-Modell | Dropdown | | Vorausgewähltes Modell für diesen Agent. Erst verfügbar, wenn ein Provider gewählt ist. |

**Abschnitt: Zugriff & Sichtbarkeit**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Berechtigte Benutzer | Multiselect | Wählt aus, wer den Agent verwenden darf. Erste Option `* Alle Benutzer` macht den Agent für alle eingeloggten Benutzer zugänglich (entspricht „öffentlich"). Einzelne Benutzer schränken den Zugriff auf explizit genannte Accounts ein. Links: **Alle auswählen** (setzt `* Alle Benutzer`) · **Auswahl leeren** (kein Zugriff außer Owner). |
| Besitzer | Dropdown | Der Benutzer, dem der Agent gehört — er sieht ihn in seinem Composer. Standard: der anlegende Admin („Ersteller (Standard)"). Beim Anlegen für einen anderen Benutzer hier den Zielbenutzer wählen; beim Bearbeiten lässt sich die Ownership übertragen. |
| Im Composer anzeigen | Checkbox (Toggle) | Bestimmt, ob der Agent in der Composer-Auswahl erscheint. |

Buttons: **[Agent anlegen]** (beim Erstellen) bzw. **[Änderungen speichern]** (beim Bearbeiten).

**Registrierte Agents (Akkordeon):**

Jeder Agent erscheint als aufklappbarer Eintrag. Im geöffneten Zustand inline editierbar:

| Feld | Typ | Optionen / Hinweis |
| --- | --- | --- |
| Provider | Dropdown | Ändert den Provider direkt im Akkordeon. |
| Modell | Dropdown | Ändert das Standard-Modell direkt im Akkordeon. |
| Tool-Freigabe (Standard) | Dropdown | `Nachfragen` (Agent fragt vor jedem Tool-Aufruf), `Voller Zugriff` (ohne Rückfrage), `Blockiert` (keine Tool-Aufrufe). |
| MCP-Server | Multiselect | Weist dem Agent verfügbare MCP-Server zu. |
| Tools | Multiselect | Wählt einzelne Tools aus den zugewiesenen Servern. Buttons: **Alle auswählen** · **Auswahl leeren** · **Tool-Liste aktualisieren**. |
| Skills | Multiselect | Weist dem Agent verfügbare Skills zu. Zugewiesene Skills werden als Katalog in den System-Kontext jedes Runs injiziert; der Agent aktiviert sie bei Bedarf via `activate_skill`. Globale Skills (vom Admin installiert) und nutzer-eigene Skills werden aufgelistet. |
| Tasks | Liste | Zeigt die mit diesem Agent verknüpften Tasks. Jeder Name ist ein **Link**: Ein Klick wechselt in den Tab „Tasks", klappt dort den Agenten und den Task auf und scrollt hin. Daneben je ein Kopier-Button für die Task-ID. |
| Chains | Liste (nur lesen) | Zeigt die mit diesem Agent verknüpften Chains. |

Aktionen pro Agent: **Bearbeiten** (lädt Agent in das Formular oben) · **Löschen** (mit Bestätigungsdialog).

---

## Tab: Tasks

**Formular Task hinzufügen:**

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Agent | Dropdown | ✓ | Agent, dem der Task zugeordnet wird. |
| Titel | Text | ✓ | Anzeigename des Tasks. |
| Task-Kontext | Textarea | | Prompt-Kontext, der dem Agent für diesen Task mitgegeben wird (ca. 10 Zeilen). |
| Beschreibung | Textarea | | Kurze Beschreibung des Tasks, sichtbar im Composer (ca. 2 Zeilen). |
| Im Composer anzeigen | Checkbox (Toggle) | | Bestimmt, ob der Task in der Composer-Auswahl erscheint. |

Button: **[Task hinzufügen]**

**Tasks pro Agent (Akkordeon):**

Listet alle Agents; jeder Agent ist aufklappbar und zeigt seine Tasks als verschachtelte Akkordeon-Einträge. Ein aufgeklappter Task zeigt ein Bearbeitungsformular mit denselben Feldern (Titel, Task-Kontext, Beschreibung, Im Composer anzeigen).

Über dem Formular steht `Agent: <Name>` — der Name ist ein **Link** zurück in den Tab „Agents" und klappt dort den Agenten auf. Er sitzt bewusst im Formular und nicht im Akkordeon-Kopf: Der Kopf ist selbst der Auf-/Zuklapp-Button, ein Link darin würde beim Klick den Task zuklappen.

Unter dem Feld „Task-Kontext" steht der aufklappbare Abschnitt **Verlauf** mit den früheren Fassungen des Kontexts. Je Fassung: Nummer, Zeitpunkt, Urheber, Zeichenzahl mit Differenz zur aktuellen Länge sowie die Aktionen **Anzeigen** (Text einblenden), **Laden** (ungespeichert in den Editor) und **Wiederherstellen** (sofort zurückschreiben). Ausführlich in [Konfiguration von Tasks](/de/admin/tasks/02_configuration/#4-verlauf-des-task-kontexts).

Buttons im Task-Bearbeitungsformular: **[Speichern]** · **[Task löschen]** (mit Bestätigungsdialog).

---

## Tab: Chains

**Formular Neue Chain:**

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Agent | Dropdown | | Agent, dem die Chain zugeordnet wird. |
| Anzeigename | Text | ✓ | Name der Chain (z. B. `Retrieval QA`). |
| Beschreibung | Textarea | | Optionale Beschreibung der Chain. |
| Im Composer anzeigen | Checkbox (Toggle) | | Bestimmt, ob die Chain im Composer erscheint. |

Button: **[Chain anlegen]**

**Chain-Designer:**

Bereich zum Bearbeiten der Schritte einer bestehenden Chain.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Agent | Dropdown | Filtert die Chain-Liste auf einen Agent (oder „Alle Chains"). |
| Chains | Dropdown | Wählt die zu bearbeitende Chain. |
| Im Composer anzeigen | Checkbox (Toggle) | Sichtbarkeit der gewählten Chain im Composer. |
| Beschreibung | Text (nur lesen) | Beschreibung der gewählten Chain. |

Buttons: **[Schritt hinzufügen]** · **[Chain-Spec speichern]** · **[Chain importieren]** · **[Chain leeren]** · **[Chain löschen]** (mit Bestätigungsdialog).

**Schritte (Akkordeon):**

Jeder Schritt wird als aufklappbarer Eintrag angezeigt. Im geöffneten Zustand editierbar:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Schritt-Name | Text | Anzeigename des Schritts. |
| Schritt-Typ | Dropdown | Typ des Schritts (z. B. `llm`, `rest_call`, `delay`, `loop`, `retry`, `transform`). |
| Agent/Task für diesen Schritt | Dropdowns | Wählt Agent und Task, die dieser Schritt verwendet. |
| Konfiguration/Argumente (JSON) | Code-Editor | JSON-Konfiguration des Schritts (gemäß Chain-Schema). |
| Platzhalter | Info | Liste verfügbarer Template-Variablen (z. B. `${steps.<id>.output}`). |

Aktion pro Schritt: **[Schritt entfernen]**
