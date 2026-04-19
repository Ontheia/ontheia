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

Das Tool `delegate-to-agent` bietet drei Wege, Aufgaben an Sub-Systeme zu übergeben:

### 2.1 Delegation an Agent/Task (Empfohlen)
```json
{
  "agent": "Homeauto",
  "task": "Status_Check",
  "input": "Wie ist der Füllstand?"
}
```
- **Logik:** Ontheia sucht den Agenten, prüft, ob eine Chain hinterlegt ist, und führt diese aus. Falls keine Chain existiert, wird ein LLM-Prompt gestartet.
- **Einsatz:** Standard-Delegation zwischen Agenten.

### 2.2 Direkter Chain-Aufruf
```json
{
  "chain": "Homeauto_Chain",
  "input": "..."
}
```
- **Logik:** Der Agenten-Lookup wird übersprungen. Die Kette wird sofort gestartet.
- **Einsatz:** Wenn man sichergehen will, dass *genau diese* technische Prozedur ohne Umwege ausgeführt wird.

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
