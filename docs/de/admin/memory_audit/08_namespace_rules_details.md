# Deep Dive: Namespace-Regeln

Namespace-Regeln ermöglichen es Administratoren, das Verhalten der KI-Suche global zu steuern, ohne jeden Agenten einzeln konfigurieren zu müssen.

## 1. Ranking-Boni
Mit dem Ranking-Bonus kannst du steuern, welche Informationsquellen bevorzugt werden sollen.
- **Prinzip:** Ein Bonus zwischen `0.0` und `1.0` wirkt als **prozentualer Aufschlag** auf die Ähnlichkeit und ergibt die Relevanz. `0.2` bedeutet also +20 % — nicht `+0.2` als absoluter Wert.
- **Anwendungsfall:** Gib `vector.global.knowledge.faq` einen Bonus von `0.2`, damit offizielle Antworten immer über zufälligen Chat-Notizen erscheinen.
- **Augenmaß:** Werte über `0.3` heben schwache Treffer über die Mindest-Score-Schwelle, die sie aus eigener Ähnlichkeit nie erreicht hätten. Die mitgelieferten Regeln bewegen sich zwischen `0.03` und `0.12`.

## 2. LLM Instruktion Templates
Dies ist ein mächtiges Feature, um die Antwortqualität zu erhöhen. Findet die KI einen Treffer aus einem Namespace mit Instruktionstext, wird dieser Text dem Treffer im Kontext vorangestellt.
- **Beispiel:** Für den Namespace `vector.global.business.legal` hinterlegst du: *"Zitiere bei Informationen aus diesem Bereich immer den entsprechenden Paragraphen: {{content}}"*
- **Wirkung:** Der Agent wird automatisch zum "juristischen Berater", sobald er Wissen aus dieser Quelle abruft.
- **Platzhalter:** `{{content}}` markiert die Stelle, an der die Treffer eingesetzt werden. Fehlt er, werden sie an den Text angehängt.
- **Einmal je Gruppe:** Treffen mehrere Ergebnisse dieselbe Regel, erscheint der Instruktionstext **einmal** über allen — nicht einmal pro Treffer.

### Die Konvention `(QUELLE)` und `(MEMORY)`

Die mitgelieferten Vorlagen beginnen mit einem Etikett in Klammern, und das ist keine Kosmetik: **Es entscheidet, ob ein Treffer zitiert wird.**

| Etikett | Wofür | In der Antwort |
| :--- | :--- | :--- |
| `(QUELLE)` | Korpus — Rezepte, Anleitungen, Dokumentation, persönliche Unterlagen | wird als Quelle genannt |
| `(MEMORY)` | Gedächtnis — Notizen, Vorlieben, Arbeitsanweisungen, Zwischenstände | wird **nicht** genannt |

Das Etikett deckt sich mit der Gedächtnisklasse: Alle Namespaces der Klasse `document` tragen `(QUELLE)`, alle übrigen `(MEMORY)`. Wer eine eigene Vorlage schreibt, sollte sich daran halten.

Ein zitierter Korpus-Treffer erscheint am Ende der Antwort als dritte Form neben URL und Dateipfad:

```
##### Quellen
- Gedächtnis `vector.global.privat.recipes`
```

**Warum das nötig ist.** Der injizierte Block ist für den Nutzer unsichtbar. Ob eine Antwort aus seiner eigenen Sammlung stammt oder aus dem allgemeinen Wissen des Modells, sieht er ihr sonst nicht an — beide lesen sich gleich sicher. Belegt an einem Fall, in dem derselbe Agent auf dieselbe Frage einmal ein erfundenes und einmal das gespeicherte Rezept lieferte, ohne dass die Antworten sich unterschieden hätten.

**Was nie zitiert wird**, und zwar unabhängig vom Etikett: was der Nutzer im laufenden Gespräch gesagt hat, was der Agent in diesem Zug gerade gespeichert hat, und sein eigenes Wissen. Ein Eintrag ohne Etikett wird ebenfalls nicht genannt — im Zweifel schweigen.

> Der Text landet nicht im System-Prompt, sondern am Ende der letzten Nutzernachricht. Grund ist das Prompt-Caching; Details in der [technischen Referenz](/de/admin/memory_audit/10_ranking_algorithm/).

## 3. Gedächtnisklasse

Eine Regel kann eine **Standard-Klasse** für ihren Namespace festlegen. Jeder Eintrag, der dorthin geschrieben wird, bekommt sie automatisch — der Agent muss nichts angeben.

| Klasse | Wofür |
| :--- | :--- |
| **Episodisch** | Etwas, das geschehen ist, zu einer Zeit |
| **Semantisch** | Ein Fakt, der gilt, bis er ersetzt wird |
| **Prozedural** | Eine Regel oder Arbeitsanweisung |
| **Arbeitskontext** | Nur für die laufende Aufgabe nötig |
| **Dokument (Korpus)** | Eingelesenes Quellmaterial, kein Gedächtnis |

> **Die Regel ist ein Standard, keine Festlegung.** Ein Namespace enthält in der Praxis gemischte Klassen — `…preferences` etwa trägt neben echten Präferenzen auch Fakten und Arbeitsanweisungen. Deshalb kann jeder einzelne Eintrag beim Schreiben eine abweichende Klasse führen, und eine spätere Änderung der Regel wirkt **nicht** rückwirkend auf den Bestand.
>
> Die Klasse steht bewusst **nicht** im Namespace-Namen. Sie kann sich ändern — eine Episode, die sich als dauerhafter Fakt erweist, wechselt die Klasse, ohne den Namespace zu verlassen. Ohne Klasse bleibt das Feld leer; das ist ehrlicher als ein geratener Wert.

Feld leer lassen (**„Kein Standard"**), wenn ein Namespace zu gemischt ist, um eine sinnvolle Vorgabe zu tragen.

## 4. Pattern Matching
Regeln gelten für Namespace-Muster, nicht für einzelne Namespaces:

| Schreibweise | Bedeutung |
| :--- | :--- |
| `${user_id}` | genau **ein** Segment — die Regel gilt für jeden Nutzer |
| `*` | beliebiger Rest, z.B. `vector.agent.*` |

Eine Regel deckt immer auch die Unter-Namespaces ihres Musters ab. Treffen mehrere Instruktionsregeln zu, gewinnt die längste.

---

## 🛠️ Technischer Hintergrund
Für eine detaillierte mathematische Erklärung des Such- und Ranking-Algorithmus (inkl. Cosine Similarity, Recency Decay und Namespace-Boni), konsultieren Sie bitte die:

👉 **[Technische Referenz: Memory Ranking & Suchalgorithmus](/de/admin/memory_audit/10_ranking_algorithm/)**
