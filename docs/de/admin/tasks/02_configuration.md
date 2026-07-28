# Konfiguration von Tasks

In der Admin-Konsole können Sie bestehende Tasks bearbeiten oder neue spezialisierte Aufgaben für Ihre Agenten definieren.

## 1. Basis-Informationen
- **Titel:** Der Name des Tasks, wie er im Dropdown-Menü der WebUI erscheint.
- **Beschreibung:** Eine kurze Erklärung für den Nutzer, was dieser Task bewirkt.

## 2. Task-Kontext (System-Prompt)
Dies ist das wichtigste Feld. Der hier hinterlegte Text wird als erste `system`-Nachricht an das KI-Modell gesendet — er ist die **einzige** Quelle für die Instruktionen eines Agenten. Ein Agent kann mehrere Tasks haben und damit je Task einen eigenen Task-Kontext; wirksam ist immer nur der der gewählten Task.

> Zur Abgrenzung von System-Kontext, Task-Kontext und System-Prompt siehe [Wie Memory und Kontext funktionieren](../memory_audit/00_context_and_memory_flow.md#1-was-ist-kontext).
- **Inhalt:** Definieren Sie hier Verhaltensregeln, Antwortformate oder spezifisches Prozesswissen.
- **Best Practice:** Nutzen Sie klare Anweisungen (z. B. "Analysiere den Code auf Sicherheitslücken und gib das Ergebnis als Markdown-Tabelle aus.").

### Template-Variablen im System-Prompt

Im Task-Kontext können Variablen in der Form `${variable}` oder `{{variable}}` verwendet werden. Sie werden beim Start jedes Runs automatisch durch die aktuellen Laufzeit-Werte ersetzt.

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `${user_name}` | Anzeigename des Nutzers | `Antworte immer auf Deutsch. Sprich den Nutzer als ${user_name} an.` |
| `${user_email}` | E-Mail-Adresse des Nutzers | `${user_email}` |
| `${user_id}` | UUID des Nutzers | `vector.user.${user_id}.preferences` |
| `${role}` | Rolle des Nutzers (`admin`, `user`) | |
| `${current_date}` | Heutiges Datum | siehe Hinweis unten |
| `${current_time}` | Aktuelle Uhrzeit (HH:mm) | siehe Hinweis unten |
| `${chat_id}` | UUID des aktuellen Chats | |
| `${agent_id}` | UUID des ausführenden Agenten | |
| `${agent_label}` | Name des Agenten | |
| `${task_id}` | UUID des aktiven Tasks | |
| `${session_id}` | UUID der Session | |
| `${input}` / `${userInput}` | Die Nutzereingabe dieses Runs | |
| `${provider_id}` | Aktiver Provider | |
| `${model_id}` | Aktives Modell | |

**Hinweis:** Variablen funktionieren auch in Prompt-Vorlagen (Composer-Vorlagen-Icon) — sie werden beim Einfügen in den Composer clientseitig ersetzt.

**Datum & Uhrzeit — nicht in den Task-Kontext schreiben:** Ontheia stellt dem Agenten das aktuelle Datum und die Uhrzeit (Zeitzone laut Systemeinstellung) bei **jedem** Run automatisch bereit — angehängt an die aktuelle Nutzernachricht. Du musst `${current_date}`/`${current_time}` also **nicht** in den Task-Kontext aufnehmen. Tust du es doch, landet die minütlich wechselnde Uhrzeit im **gecachten Prefix** und bricht das Prompt-Caching bei jeder Minute (höhere Kosten, siehe Token-Anzeige ⚡ im Chat). Die Variablen bleiben für Sonderfälle verfügbar, sollten aber im Task-Kontext gemieden werden.

## 3. Verwaltung
Änderungen an einem Task werden sofort für alle neuen Runs wirksam. Da Tasks in der Datenbank (`app.tasks`) gespeichert werden, bleiben sie auch bei einem Neustart des Systems erhalten.
