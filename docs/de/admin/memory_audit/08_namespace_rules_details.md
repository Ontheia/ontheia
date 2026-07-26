# Deep Dive: Namespace-Regeln

Namespace-Regeln ermöglichen es Administratoren, das Verhalten der KI-Suche global zu steuern, ohne jeden Agenten einzeln konfigurieren zu müssen.

## 1. Ranking-Boni
Mit dem Ranking-Bonus kannst du steuern, welche Informationsquellen bevorzugt werden sollen.
- **Prinzip:** Ein Bonus zwischen `0.0` und `1.0` wirkt als **prozentualer Aufschlag** auf den Score. `0.2` bedeutet also +20 % — nicht `+0.2` als absoluter Wert.
- **Anwendungsfall:** Gib `vector.global.knowledge.faq` einen Bonus von `0.2`, damit offizielle Antworten immer über zufälligen Chat-Notizen erscheinen.
- **Augenmaß:** Werte über `0.3` heben schwache Treffer über die Mindest-Score-Schwelle, die sie aus eigener Ähnlichkeit nie erreicht hätten. Die mitgelieferten Regeln bewegen sich zwischen `0.03` und `0.12`.

## 2. LLM Instruktion Templates
Dies ist ein mächtiges Feature, um die Antwortqualität zu erhöhen. Findet die KI einen Treffer aus einem Namespace mit Instruktionstext, wird dieser Text dem Treffer im Kontext vorangestellt.
- **Beispiel:** Für den Namespace `vector.global.business.legal` hinterlegst du: *"Zitiere bei Informationen aus diesem Bereich immer den entsprechenden Paragraphen: {{content}}"*
- **Wirkung:** Der Agent wird automatisch zum "juristischen Berater", sobald er Wissen aus dieser Quelle abruft.
- **Platzhalter:** `{{content}}` markiert die Stelle, an der die Treffer eingesetzt werden. Fehlt er, werden sie an den Text angehängt.
- **Einmal je Gruppe:** Treffen mehrere Ergebnisse dieselbe Regel, erscheint der Instruktionstext **einmal** über allen — nicht einmal pro Treffer.

> Der Text landet nicht im System-Prompt, sondern am Ende der letzten Nutzernachricht. Grund ist das Prompt-Caching; Details in der [technischen Referenz](/de/admin/memory_audit/10_ranking_algorithm/).

## 3. Pattern Matching
Regeln gelten für Namespace-Muster, nicht für einzelne Namespaces:

| Schreibweise | Bedeutung |
| :--- | :--- |
| `${user_id}` | genau **ein** Segment — die Regel gilt für jeden Nutzer |
| `*` | beliebiger Rest, z.B. `vector.agent.*` |

Eine Regel deckt immer auch die Unter-Namespaces ihres Musters ab. Treffen mehrere Instruktionsregeln zu, gewinnt die längste.

---

## 🛠️ Technischer Hintergrund
Für eine detaillierte mathematische Erklärung des Such- und Ranking-Algorithmus (inkl. Cosine Similarity, Recency Decay und statischen Prioritäten), konsultieren Sie bitte die:

👉 **[Technische Referenz: Memory Ranking & Suchalgorithmus](/de/admin/memory_audit/10_ranking_algorithm/)**
