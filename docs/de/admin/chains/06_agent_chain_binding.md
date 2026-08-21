# Deep Dive: Agent-zu-Chain Bindung & Delegation

Dieses Dokument erklärt die Architektur-Entscheidung hinter der Bindung von Agenten an Ketten (Chains) und wie Ontheia Delegation vs. direkte Aufrufe handhabt.

## 1. Das Konzept der Abstraktion

In Ontheia dient ein **Agent** als stabiles Interface (Identität). Wie dieser Agent seine Aufgabe erfüllt, kann sich im Hintergrund ändern, ohne dass der aufrufende Master-Agent angepasst werden muss.

### Szenario A: Agent als LLM (Standard)
Der Agent nutzt ein KI-Modell und Werkzeuge (Tools), um eine Antwort zu generieren. Er "denkt" frei über die Lösung nach.

### Szenario B: Agent als Chain (Deterministisch)
Der Agent ist mit einer Kette verknüpft (`app.agent_chains`). Sobald dieser Agent delegiert wird, führt Ontheia **keinen** KI-Prompt aus, sondern startet sofort den `ChainRunner` für die verknüpfte Kette.

**Vorteile:**
- **Stabilität:** Der Master-Agent muss nur wissen: *"Frag Homeautomation nach dem Wasserstand"*.
- **Flexibilität:** Die Implementierung von `Homeauto` kann morgen eine Chain, übermorgen ein Python-Skript und nächste Woche wieder ein reines LLM sein.

---

## 2. Delegation vs. Direkter Aufruf

Das Tool `delegate-to-agent` verlangt immer `agent` und `input`; `task` und `chain` sind optional. Was ausgeführt wird, entscheidet eine feste Präzedenz:

1. **Expliziter, matchender Task** — wurde `task` angegeben **und** existiert der Task für diesen Agenten, läuft der Task: ein LLM-Aufruf mit dem Task-Kontext. Er schlägt jede Chain vor — die Default-Chain des Agenten ebenso wie eine benannte `chain`.
2. **Chain** — ohne matchenden Task läuft die Chain:
   - ist zusätzlich `chain` benannt, wird **diese** Chain ausgeführt (sie muss am Agenten gebunden sein); sie ersetzt die Default-Chain.
   - sonst läuft die Default-Chain des Agenten, falls eine hinterlegt ist.
3. **LLM** — ohne Task und ohne Chain startet ein normaler LLM-Aufruf (mit dem Default-Task-Kontext des Agenten, falls vorhanden).

> **Benannter Task nicht gefunden:** Wurde `task` angegeben, aber kein passender Task am Agenten gefunden, fällt der Lauf auf die Chain (Default oder benannt) zurück und protokolliert den Fallback im Trace — es wird **nicht** ein Task ausgeführt, den der Aufrufer nie genannt hat.

### 2.1 Delegation an Agent/Task (Empfohlen)
```json
{
  "agent": "Homeauto",
  "task": "Status_Check",
  "input": "Wie ist der Füllstand?"
}
```
- **Logik:** Der matchende Task gewinnt und läuft als LLM-Aufruf mit dessen Task-Kontext. Ohne `task` griffe die Default-Chain des Agenten (sofern vorhanden), sonst ein LLM-Aufruf.
- **Einsatz:** Standard-Delegation zwischen Agenten.

### 2.2 Spezifische Chain erzwingen
```json
{
  "agent": "Homeauto",
  "chain": "Homeauto_Chain",
  "input": "..."
}
```
- **Logik:** `agent` wird wie immer aufgelöst; `chain` wählt die Chain, die gebunden ausgeführt wird — anstelle der Default-Chain des Agenten. Ein matchender Task hätte dennoch Vorrang (dafür `task` weglassen). Die Chain muss am Agenten gebunden sein, sonst entfällt sie und der Lauf fällt auf LLM zurück.
- **Einsatz:** Wenn für diesen Agenten *genau diese* technische Prozedur laufen soll, ohne dass die Default-Chain greift.

---

## 3. Dynamische Ketten-Wahl (Fortgeschritten)

Wenn ein Sub-Agent entscheiden soll, welche von mehreren Ketten er nutzt, wird er als **LLM-Agent** konfiguriert und erhält das Tool `execute-chain`.

1. **Master** delegiert an **Sub-Agent (LLM)**.
2. **Sub-Agent** analysiert die Anfrage.
3. **Sub-Agent** ruft Tool `execute-chain(name="Kette_A")` oder `execute-chain(name="Kette_B")` auf.

Dies ermöglicht eine intelligente Vor-Auswahl technischer Prozesse durch eine KI.

---

## 4. Best Practices für Chains

- **Branching:** Nutze den Schritt-Typ `branch`, um innerhalb einer Kette auf verschiedene Eingabeparameter zu reagieren (z.B. `input.action == 'write'`).
- **Silent Steps:** Markiere technische Zwischenschritte (wie Datenbank-Abfragen oder REST-Calls) als `silent: true`, um das Chat-Interface des Nutzers nicht mit Rohdaten zu fluten. Nur der finale `finalize`-Schritt sollte seine Antwort streamen.
