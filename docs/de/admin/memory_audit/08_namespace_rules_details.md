# Deep Dive: Namespace-Regeln

Namespace-Regeln ermöglichen es Administratoren, das Verhalten der KI-Suche global zu steuern, ohne jeden Agenten einzeln konfigurieren zu müssen.

## 1. Ranking-Boni
Mit dem Ranking-Bonus kannst du steuern, welche Informationsquellen bevorzugt werden sollen.
- **Prinzip:** Ein Bonus zwischen `0.0` und `1.0` wird zum Score der Suchergebnisse addiert.
- **Anwendungsfall:** Gib `vector.global.knowledge.faq` einen Bonus von `0.2`, damit offizielle Antworten immer über zufälligen Chat-Notizen erscheinen.

## 2. LLM Instruktion Templates
Dies ist ein mächtiges Feature, um die Antwortqualität zu erhöhen. Wenn die KI einen Treffer aus einem Namespace mit Instruktionstext findet, wird dieser Text automatisch in den System-Prompt injiziert.
- **Beispiel:** Für den Namespace `vector.global.business.legal` hinterlegst du: *"Zitiere bei Informationen aus diesem Bereich immer den entsprechenden Paragraphen."*
- **Wirkung:** Der Agent wird automatisch zum "juristischen Berater", sobald er Wissen aus dieser Quelle abruft.

## 3. Pattern Matching
Regeln werden über Wildcards definiert (z.B. `vector.agent.*`). So lassen sich Regeln effizient auf ganze Gruppen von Namespaces anwenden.

---

## 🛠️ Technischer Hintergrund
Für eine detaillierte mathematische Erklärung des Such- und Ranking-Algorithmus (inkl. Cosine Similarity, Recency Decay und statischen Prioritäten), konsultieren Sie bitte die:

👉 **[Technische Referenz: Memory Ranking & Suchalgorithmus](./10_ranking_algorithm.md)**
