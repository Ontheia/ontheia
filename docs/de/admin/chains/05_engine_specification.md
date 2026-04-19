# Ontheia Chain Engine Spezifikation (v2)

Diese Dokumentation beschreibt die technische Funktionsweise der Ontheia Chain-Engine. Sie ist als Referenz für Entwickler und LLMs konzipiert, um komplexe Workflows (Chains) fehlerfrei zu entwerfen.

---

## 1. Architektur-Übersicht

Die Chain-Engine verarbeitet eine Liste von Schritten (**Steps**) sequentiell. Sie verwaltet einen zentralen **Chain-Kontext**, in dem alle Ergebnisse der Schritte gespeichert werden.

### Kernkonzepte:
*   **DAG (Directed Acyclic Graph)**: Chains sind als gerichtete, azyklische Graphen aufgebaut.
*   **Persistent State**: Jeder Step hat Zugriff auf die Ergebnisse (`data` und `output`) aller vorherigen Steps.
*   **Variable Resolution**: Variablen werden zur Laufzeit rekursiv aufgelöst.
*   **JSON-Robustheit**: Die Engine verwendet `jsonrepair`, um unsaubere LLM-Antworten in valide Datenobjekte zu transformieren.

---

## 2. Das Variablen-System

Variablen werden in der Form `${...}` geschrieben. Die Engine unterstützt zwei Haupt-Scopes:

### A. Globaler Kontext (TemplateContext)
Diese Variablen sind immer verfügbar:
| Variable | Beschreibung | Beispiel |
| :--- | :--- | :--- |
| `${input}` | Der ursprüngliche Text des Benutzers. | `"Was ist mit ${input}?"` |
| `${userInput}` | Alias für `${input}`. | - |
| `${user_id}` | UUID des aktuellen Benutzers. | `vector.user.${user_id}.memory` |
| `${user_name}` | Anzeigename des Benutzers. | - |
| `${user_email}` | E-Mail-Adresse des Benutzers. | - |
| `${agent_id}` | ID des ausführenden Agenten. | - |
| `${task_id}` | ID des aktiven Tasks. | - |
| `${chat_id}` | ID des aktuellen Chats. | - |
| `${current_date}` | Heutiges Datum (Deutsch, lang). | - |
| `${current_time}` | Aktuelle Uhrzeit (HH:mm). | - |

### B. Step-Kontext (ChainContext)
Jeder Step speichert sein Ergebnis unter seiner `id`. Der Zugriff erfolgt über Dot-Notation:
`${steps.<step_id>.<pfad>}`

**Wichtige Felder pro Step:**
*   `output`: Die rohe Textantwort (z.B. der String eines LLM oder die Text-Repräsentation eines Tools).
*   `data`: Das **geparste JSON-Objekt**. Dies ist das wichtigste Feld für Logikketten.
*   `result`: (Nur Tool-Steps) Das komplette MCP-Result-Objekt.

---

## 3. JSON-Verarbeitung & Extraktion

Die Engine ist darauf optimiert, JSON aus LLM-Antworten zu extrahieren, selbst wenn das Modell Prosa drumherum schreibt.

### Extraktions-Algorithmus:
1.  Suche nach dem ersten Vorkommen von `{` oder `[`.
2.  Suche nach dem letzten Vorkommen von `}` oder `]`.
3.  Schneide den dazwischenliegenden Teil aus.
4.  Wende `jsonrepair` an (behebt fehlende Kommas, falsche Anführungszeichen etc.).
5.  Führe `JSON.parse()` aus und speichere das Ergebnis in `step.data`.

---

## 4. Step-Typen (Spezifikation)

### `llm` (Large Language Model)
Führt eine Anfrage an eine KI aus.
*   **Parameter:**
    *   `prompt`: Der Text an das LLM. Unterstützt Variablen.
    *   `system_prompt`: (Optional) Ein dedizierter System-Prompt für diesen Step. Wird dem Modell als `system`-Nachricht vorangestellt und überschreibt den Standard-Agenten-Kontext. Ideal für spezialisierte Steps wie Prompt-Optimierer oder Klassifizierer.
    *   `model`: (Optional) Spezifisches Modell.
    *   `params.silent`: Wenn `true`, wird die Antwort nicht an den Chat-Stream gesendet.
    *   `params.temperature`: Steuerung der Kreativität.

### `agent` (Agent Delegation)
Delegiert die Aufgabe an einen anderen Ontheia-Agenten (A2A).
*   **Parameter:**
    *   `agent_id`: Name oder UUID des Ziel-Agenten.
    *   `task_id`: (Optional) Spezifischer Task-Kontext.
    *   `input`: Die Nachricht an den Sub-Agenten.

### `tool` (MCP Tool Call)
Ruft eine Funktion eines MCP-Servers auf.
*   **Parameter:**
    *   `server`: Name des MCP-Servers (z.B. `time`, `nextcloud`).
    *   `tool`: Name der Funktion.
    *   `args`: Argumente als Key-Value-Map. Unterstützt Variablen.

### `memory_search` (Vektor-Suche)
Sucht im Langzeitgedächtnis.
*   **Parameter:**
    *   `params.query`: Der Suchbegriff.
    *   `params.namespaces`: Array von Namespaces.
    *   `params.top_k`: Anzahl der Treffer.

### `memory_write` (Gedächtnis schreiben)
Speichert Informationen dauerhaft.
*   **Parameter:**
    *   `params.namespace`: Ziel-Namespace.
    *   `params.content`: Der zu speichernde Text.

### `transform` (Datenmanipulation)
Erstellt neuen Text oder JSON basierend auf einem Template.
*   **Parameter:**
    *   `prompt`: Das Template.

### `rest_call` (HTTP Anfrage)
Ruft externe APIs auf.
*   **Parameter:**
    *   `url`, `method`, `headers`, `body`.

### `router` (Mehrweg-Verzweigung)
Ähnlich wie `branch`, evaluiert jedoch alle Fälle gegen einen zentralen Eingabewert und leitet die Ausführung an den passenden Zweig.
*   **Parameter:**
    *   `cases`: Array von Objekten mit `when` (Bedingung) und `steps` (Sub-Steps).
    *   `default`: (Optional) Fallback-Schritte, wenn kein Fall zutrifft.

### `branch` (Switch-Case Logik)
Führt den ersten Zweig aus, dessen Bedingung erfüllt ist.
*   **Parameter:**
    *   `cases`: Array von Objekten mit `when` (Bedingung) und `steps` (Sub-Steps).
    *   `default`: (Optional) Fallback-Schritte.

### `parallel` (Parallele Ausführung)
Führt mehrere Schritte gleichzeitig aus.

### `loop` (Iteration)
Wiederholt einen Block mehrfach.
*   **Parameter:**
    *   `count`: Anzahl der Durchläufe.
    *   `steps`: Die zu wiederholenden Schritte.

### `retry` (Fehlerbehandlung)
Wiederholt einen Block bei Fehlern.
*   **Parameter:**
    *   `steps`: Die zu wiederholenden Schritte.
    *   `count`: Maximale Versuche (1–5).
    *   `delay_ms`: Pause zwischen Versuchen (0–600 000 ms).
    *   `params.success_when`: (Optional) Ausdruck, der Erfolg definiert.
    *   `params.fail_on_warnings`: (Optional) Bei `true` gilt eine Warnung als Fehler.

### `delay` (Pause)
Pausiert die Chain.
*   **Parameter:**
    *   `delay_ms`: Dauer in Millisekunden (0–600 000).

---

## 5. Bedingte Ausführung (`when`)

Jeder Step kann ein `when`-Feld enthalten. Ist die Bedingung `false`, wird der Step übersprungen.

**Unterstützte Ausdrücke:**
*   `boolean`: `true`/`false`.
*   `string` (Variable): `${steps.check.data.is_free} == 'true'`.
*   `Operator Support`: `==` und `!=`.

---

## 6. Datenfluss-Logik (Edges)

Obwohl Steps sequentiell definiert werden, können explizite Daten-Mappings über `edges` definiert werden.

```json
"edges": [
  {
    "from": "step_a",
    "to": "step_b",
    "map": {
      "data.user_name": "in_user"
    }
  }
]
```

---

## 7. Limits & Obergrenzen

| Parameter | Limit |
|---|---|
| Maximale Steps pro Chain | 50 |
| Maximale Edges | 200 |
| `parallel` — maximale Sub-Steps | 4 |
| `loop` — maximale Iterationen | 1–20 |
| `retry` — maximale Versuche | 1–5 |
| `delay_ms` | 0–600 000 ms |
| Memory Search `top_k` | Standard 5, Maximum 20 |
| Tool/LLM Output (gekürzt) | ~1 200–1 600 Zeichen |
| Chain-Kontext (gekürzt) | ~2 000 Zeichen |

---

## 8. Leitfaden für LLMs zur Chain-Erstellung

1.  **Stabile IDs**: Nutze sprechende IDs (z.B. `time_resolver`).
2.  **Date-Handling**: Nutze immer zuerst den `time`-Server.
3.  **JSON-First**: Lass LLM-Steps bevorzugt JSON antworten.
4.  **Error-Handling**: Nutze `when`, um Schritte logisch zu verknüpfen.
