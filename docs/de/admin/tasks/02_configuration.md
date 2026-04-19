# Konfiguration von Tasks

In der Admin-Konsole können Sie bestehende Tasks bearbeiten oder neue spezialisierte Aufgaben für Ihre Agenten definieren.

## 1. Basis-Informationen
- **Titel:** Der Name des Tasks, wie er im Dropdown-Menü der WebUI erscheint.
- **Beschreibung:** Eine kurze Erklärung für den Nutzer, was dieser Task bewirkt.

## 2. Task-Kontext (System-Prompt)
Dies ist das wichtigste Feld. Der hier hinterlegte Text wird als Teil des System-Prompts an das KI-Modell gesendet.
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
| `${current_date}` | Heutiges Datum | `Heute ist ${current_date}.` |
| `${current_time}` | Aktuelle Uhrzeit (HH:mm) | |
| `${chat_id}` | UUID des aktuellen Chats | |
| `${agent_id}` | UUID des ausführenden Agenten | |
| `${agent_label}` | Name des Agenten | |
| `${task_id}` | UUID des aktiven Tasks | |
| `${session_id}` | UUID der Session | |
| `${input}` / `${userInput}` | Die Nutzereingabe dieses Runs | |
| `${provider_id}` | Aktiver Provider | |
| `${model_id}` | Aktives Modell | |

**Hinweis:** Variablen funktionieren auch in Prompt-Vorlagen (Composer-Vorlagen-Icon) — sie werden beim Einfügen in den Composer clientseitig ersetzt.

## 3. Verwaltung
Änderungen an einem Task werden sofort für alle neuen Runs wirksam. Da Tasks in der Datenbank (`app.tasks`) gespeichert werden, bleiben sie auch bei einem Neustart des Systems erhalten.
