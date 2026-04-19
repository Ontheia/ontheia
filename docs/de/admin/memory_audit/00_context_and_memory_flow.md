# Wie Memory und Kontext funktionieren

Dieses Dokument erklärt, wie Ontheia den Kontext für einen Agenten aufbaut, wie das Langzeitgedächtnis dabei eine Rolle spielt und was bei der Delegation an Sub-Agents passiert. Es ist die konzeptionelle Grundlage für alle weiteren Memory-Docs.

---

## 1. Was ist „Kontext"?

Jedes Mal, wenn ein Agent eine Aufgabe bearbeitet, bekommt er einen **Kontext** — das ist alles, was das Sprachmodell (LLM) zu Beginn seiner Arbeit „weiß". Der Kontext wird aus mehreren Quellen zusammengebaut und als geordnete Nachrichtenfolge an das LLM übergeben.

Der Kontext besteht aus **zwei Teilen**:

- **System-Prompt** — Hintergrundinformationen, die das Verhalten des Agents steuern (für den Nutzer nicht sichtbar)
- **Chat-Verlauf** — Die bisherige Gesprächshistorie zwischen Nutzer und Agent

---

## 2. Vollständige Nachrichten-Struktur

Das LLM empfängt eine geordnete Liste von Nachrichten. Jeder Block ist eine eigene System-Message. Die Reihenfolge ist festgelegt:

```
┌─────────────────────────────────────────────────────────────────┐
│ [system] 1. Datum & Uhrzeit                                     │
│    "TODAY'S DATE: 08.04.2026"                                   │
│    "CURRENT TIME: 10:30"                                        │
│    → Immer vorhanden; kann nicht deaktiviert werden             │
│    ⚠ Wenn ${current_date} im Agent-System-Prompt                │
│      verwendet wird, erscheint das Datum doppelt!               │
├─────────────────────────────────────────────────────────────────┤
│ [system] 2. Agent-Persona / Task-Kontext                        │
│    → Aus Agent- oder Task-Konfiguration                         │
│    → Template-Variablen (${user_name}, ${current_date} …)       │
│      werden hier aufgelöst                                      │
│    → Bei Sub-Agents: Anti-Selbst-Delegations-Hinweis            │
├─────────────────────────────────────────────────────────────────┤
│ [system] 3. Tool-Hinweis                                        │
│    → Nur wenn Tools vorhanden sind                              │
├─────────────────────────────────────────────────────────────────┤
│ [system] 4. Memory-Kontext                                      │
│    → Nur wenn Memory-Treffer gefunden wurden                    │
│    "RELEVANT CONTEXT FROM LONG-TERM MEMORY:                     │
│     --- MEMORY ENTRY (Stored on ..., Namespace: ...) ---        │
│     [Gespeicherter Text]"                                       │
├─────────────────────────────────────────────────────────────────┤
│ [user]      Nachricht 1 (älteste Chat-History)                  │
│ [assistant] Antwort 1                                           │
│ [user]      Nachricht 2                                         │
│ [assistant] Antwort 2                                           │
│  …          (vollständige Chat-History)                         │
├─────────────────────────────────────────────────────────────────┤
│ [user]      Aktuelle Nutzer-Nachricht                           │
└─────────────────────────────────────────────────────────────────┘
```

Die System-Blöcke werden **vor** die bereits bestehenden Chat-History-Messages gesetzt. Das LLM sieht damit immer den vollständigen Gesprächsverlauf.

### Template-Variablen im System-Prompt

Im Agent-Persona-Block (Block 2) können folgende Platzhalter verwendet werden — sie werden zur Laufzeit aus dem Sitzungskontext aufgelöst:

| Variable | Inhalt |
|---|---|
| `${user_id}` | Interne ID des eingeloggten Nutzers |
| `${user_name}` | Name des Nutzers (aus User-Settings) |
| `${user_email}` | E-Mail-Adresse des Nutzers |
| `${chat_id}` | Aktuelle Chat-ID |
| `${project_id}` | Aktuelle Projekt-ID |
| `${current_date}` | Lokalisiertes Datum (Sprache + Zeitzone des Nutzers) |
| `${current_time}` | Lokalisierte Uhrzeit (HH:mm, Zeitzone des Nutzers) |

Da Block 1 Datum und Uhrzeit immer automatisch einfügt, ist `${current_date}` und `${current_time}` im System-Prompt redundant — aber unschädlich.

---

## 3. Memory beim Start eines Runs

Bevor das LLM die erste Antwort generiert, durchläuft Ontheia folgende Schritte:

```
1. Memory Policy laden (Agent-Policy; Task-Policy überschreibt bei Bedarf)
         ↓
2. Namespaces auflösen (Template-Variablen ersetzen)
         ↓
3. Sicherheitsfilter: Nur Namespaces des angemeldeten Nutzers erlaubt (RLS)
         ↓
4. Semantische Suche: Letzte User-Nachricht als Suchbegriff
         ↓
5. Top-K Treffer als Text in System-Prompt einfügen (Block 4)
         ↓
6. Audit-Log: Wer hat wann welchen Namespace gelesen?
```

**Praktische Konsequenz:** Je präziser die Nutzer-Anfrage oder der Delegations-Input, desto besser passen die Memory-Treffer. Ein spezifischer Input ("Analysiere die Marketingstrategie von Q1") liefert zielgenauere Treffer als ein allgemeiner ("Was gibt es Neues?").

### Automatisches Speichern nach dem Run

Wenn `allowWrite = true`, speichert das System nach jedem erfolgreichen Run automatisch:

- **User-Input** (wenn ≥ 80 Zeichen) — als `run_input`
- **Agent-Antwort** — als `run_output`

Jeder Eintrag bekommt Herkunfts-Metadaten:

```json
{
  "source":     "run_output",
  "agent_id":   "...",
  "task_id":    "...",
  "chat_id":    "...",
  "user_id":    "...",
  "session_id": "..."
}
```

Diese Metadaten ermöglichen später zu filtern: *Welcher Agent hat das gespeichert? In welchem Chat?*

> **Hinweis:** Auto-Write schreibt in den konfigurierten `writeNamespace` der Memory Policy — standardmäßig `vector.agent.{user_id}.memory`. Der Platzhalter ist die **User-ID**, nicht die Agent-ID. Alle Agents eines Nutzers teilen sich damit denselben Agent-Memory-Namespace.

---

## 4. Agent-Delegation

Ein Master-Agent kann Aufgaben über das interne Tool `delegate-to-agent` an spezialisierte Sub-Agents übergeben. Dabei ist es wichtig zu verstehen, was der Sub-Agent vom Master bekommt — und was nicht.

### Was der Sub-Agent bekommt

```
Master-Agent
    │
    │  delegate-to-agent(agent="E-Mail-Agent", input="Schreib eine Antwort...")
    │
    ▼
Sub-Agent bekommt:
    ✅ Vollständiger Chat-Verlauf (bereinigt: ohne System-Messages)
    ✅ User-ID, Chat-ID, Projekt-ID, Session-ID
    ✅ Tool-Freigabe-Modus
    ✅ Delegations-Input als neue Nutzer-Nachricht
    ✅ Rekursionstiefe (depth + 1)
```

### Was der Sub-Agent selbst lädt

Der Sub-Agent baut seinen Kontext **unabhängig** vom Master auf:

```
    ✅ Eigener System-Prompt / Persona (aus Sub-Agent-Konfiguration)
    ✅ Eigene Memory Policy (eigene Namespaces, eigenes topK)
    ✅ Eigene Memory-Suche (basierend auf dem Delegations-Input)
    ✅ Eigenes Toolset
    ✅ Neue Run-ID
```

### Was der Sub-Agent NICHT vom Master bekommt

```
    ❌ Master-System-Prompt / Persona
    ❌ Master Memory-Kontext (geladene Memory-Treffer des Masters)
    ❌ Master-Tools
    ❌ Master-Run-ID
```

**Kernaussage:** Der Sub-Agent kennt die gesamte Gesprächsgeschichte, arbeitet aber mit seinen eigenen Instruktionen, seinem eigenen Gedächtnis und seinen eigenen Tools. Er ist funktional unabhängig.

### Sicherheitsmechanismen bei Delegation

| Schutzmaßnahme | Beschreibung |
|---|---|
| **Keine Selbst-Delegation** | Ein Agent kann sich nicht selbst als Ziel angeben |
| **Rekursionslimit** | Maximale Delegationstiefe: 5 Ebenen |
| **RLS-Enforcement** | User-ID wird durch alle Ebenen propagiert — kein Zugriff auf fremde Daten |
| **Namespace-Filter** | Sub-Agent darf nur Namespaces des angemeldeten Nutzers lesen |

---

## 5. Gesamtüberblick: Kontext-Fluss

```
Nutzer schickt Nachricht
         │
         ▼
executeRun() [Master, depth=0]
    ├── User-Settings laden (Sprache, Zeitzone)
    ├── Agent-Konfiguration laden (Provider, Modell, Tools)
    ├── Memory Policy laden
    ├── Memory suchen (semantisch, top-K)
    ├── System-Blöcke + Chat-History zusammenbauen
    └── LLM-Aufruf
         │
         ├── Tool-Aufruf: normales Tool
         │       └── Ergebnis zurück an Master
         │
         └── Tool-Aufruf: delegate-to-agent
                 ├── Sicherheitschecks (Selbst-Delegation, Tiefe)
                 └── executeRun() [Sub-Agent, depth=1]
                         ├── Sub-Agent Kontext aufbauen (eigene Policy, eigenes Memory)
                         ├── LLM-Aufruf (Sub-Agent)
                         ├── Tool-Aufrufe des Sub-Agents
                         └── ⬇ Auto-Write (wenn Sub-Agent policy.allowWrite = true)
                                  │
                                  ▼
                            Ergebnis zurück an Master
         │
         ▼ Auto-Write (wenn Master policy.allowWrite = true)
```

**Wichtig:** Auto-Write passiert am Ende **jedes einzelnen Runs** — sowohl für Master als auch für Sub-Agent, jeweils abhängig von deren eigener `allowWrite`-Policy. Um Auto-Write für Sub-Agents zu unterdrücken: `allowWrite: false` in der Sub-Agent Memory Policy setzen.
