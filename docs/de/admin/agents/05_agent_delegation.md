# Agent-zu-Agent (A2A) Delegation

Ontheia unterstützt die Zusammenarbeit zwischen spezialisierten Agenten durch Delegation. Dies ermöglicht den Aufbau komplexer Workflows, bei denen ein "Master-Agent" (Planer) Aufgaben an spezialisierte "Sub-Agenten" (Worker) delegiert.

Es gibt zwei primäre Mechanismen für die Delegation:
1. **Deklarative Delegation** (über Chain-Steps)
2. **Autonome Delegation** (über das `delegate-to-agent` Tool)

---

## 1. Deklarative Delegation (Chain-Steps)

Diese Form der Delegation wird fest in einer Chain-Spezifikation definiert. Sie ist ideal für strukturierte, wiederkehrende Prozesse, bei denen die Reihenfolge der Agenten-Aufrufe im Voraus bekannt ist.

### Funktionsweise
In einer Chain wird ein Step vom Typ `agent` verwendet. Die Engine (`ChainRunner`) unterbricht die Ausführung des Master-Runs, führt den Sub-Agenten aus und gibt dessen Ergebnis an die Chain zurück.

### Beispiel Spezifikation
```json
{
  "id": "research_step",
  "type": "agent",
  "agent_id": "d2306d91-29fd-4ae3-8828-1189a9b41a7f",
  "task_id": "search_contacts",
  "input": "Suche nach Kontakten mit dem Namen 'Hans'",
  "params": {
    "silent": false
  }
}
```

### Merkmale für LLMs
- **Deterministisch**: Der Aufruf erfolgt immer, wenn der Step erreicht wird.
- **Kontext-Isolierung**: Der Sub-Agent erhält eine frische Instanz, behält aber die Gesprächshistorie bei, wenn diese übergeben wird.
- **Datenübergabe**: Ergebnisse können über `${steps.research_step.output}` in folgenden Schritten genutzt werden.

---

## 2. Autonome Delegation (`delegate-to-agent`)

Dies ist die dynamischere Form der Delegation. Hier entscheidet ein LLM während der Laufzeit selbstständig, ob und an wen es eine Aufgabe delegieren möchte.

### Das Tool: `delegate-to-agent`
Das Tool ist Teil des internen `delegation`-Servers und wird automatisch injiziert, wenn der Agent dafür konfiguriert ist.

#### Tool-Definition (für KI-Modelle)
- **Server**: `delegation`
- **Tool**: `delegate-to-agent`
- **Parameter**:
    - `agent` (String, Required): Die UUID oder der Name des Ziel-Agenten.
    - `input` (String, Required): Die konkrete Aufgabe oder Nachricht an den Sub-Agenten.
    - `task` (String, Optional): UUID oder Name eines spezifischen Task-Kontexts.
    - `chain` (String, Optional): UUID oder Name einer spezifischen Chain, die ausgeführt werden soll.

---

## Sicherheitsmechanismen & Kontrolle

### 1. Tool-Approval im Sub-Run (Blocking)
Wenn für einen Run der Modus `tool_approval: "prompt"` aktiv ist, gilt dies auch für alle delegierten Aufgaben.
- **Interaktive Freigabe:** Erreicht ein Sub-Agent einen Tool-Aufruf, pausiert die gesamte Kette (auch der Master-Agent).
- **Benutzer-Feedback:** Der Benutzer sieht im Composer die Anfrage des Sub-Agenten und muss diese explizit freigeben, bevor die Delegation fortgesetzt wird.
- **Transparenz:** In der Sidebar (TOOLFREIGABE) werden alle wartenden Anfragen gelistet, inklusive der Information, welcher Sub-Agent das Tool aufrufen möchte.

### 2. Rekursionsschutz (Recursion Guard)
Die `ChainRunner` Engine trackt die `depth` (Tiefe) der Delegation.
- **Limit**: Maximal **5 Ebenen** Tiefe sind erlaubt.
- Bei Überschreitung wird der Run mit einer Fehlermeldung abgebrochen, um Endlosschleifen zwischen Agenten zu verhindern.

### 3. Selbst-Delegations-Sperre (Self-Call Prevention)
Ein Agent kann Aufgaben nicht an sich selbst delegieren. Dies verhindert "Kreisdenken" und unnötige API-Kosten durch endlose Identitäts-Schleifen. Das `delegation`-Plugin blockiert solche Aufrufe bereits auf Tool-Ebene.

### 4. Identitäts-Injektion
Sub-Agenten erhalten automatisch eine erweiterte System-Instruktion, die ihnen ihre eigene Rolle und Identität im System mitteilt. Dies fördert die Nutzung der eigenen spezialisierten Tools gegenüber einer erneuten Delegation.

### 5. System-Kontext-Vererbung
Sub-Agenten erben den vollständigen System-Kontext des Masters:
- **Zeit/Datum:** Aktuelle Zeitangaben werden automatisch injiziert.
- **User-Kontext:** Informationen über den anfragenden Benutzer (ID, Name, Rolle) werden übergeben.
- **SOPs:** Alle im gewählten Task definierten Verhaltensregeln (`context_prompt`) werden als primäre `system`-Nachricht gesetzt.

### 6. Historien-Kontinuität (History Flow)
Bei jeder Delegation wird die relevante Gesprächshistorie an den Sub-Agenten weitergegeben. Dies stellt sicher, dass der Sub-Agent den Kontext des gesamten Gesprächs versteht.

### 7. Memory-Kontext für Sub-Agenten
Wenn in der Memory-Policy eines Sub-Agenten `readNamespaces` konfiguriert sind, lädt das System vor der eigentlichen Ausführung automatisch den passenden Memory-Kontext — identisch zum Verhalten beim Master-Agenten.
- Die Namespace-Templates werden mit dem aktuellen User-Kontext aufgelöst.
- Ein Sicherheitsfilter stellt sicher, dass nur `vector.global.*`-Namespaces und Namespaces mit der eigenen User-UUID zugänglich sind.
- Die gefundenen Einträge erscheinen als `memory_context`-Step im Trace-Panel.

---

## Best Practices für Entwickler

1. **Eindeutige Inputs**: Der `input` für eine Delegation sollte so formuliert sein, als wäre es eine neue Benutzeranfrage.
2. **Zuständigkeiten trennen**: Erstelle lieber viele kleine, spezialisierte Agenten als einen großen "Alles-Könner".
3. **Labels nutzen**: Im System-Prompt für den Planer sollten die Namen/Labels der Agenten stehen, um dem LLM die Auswahl zu erleichtern.
