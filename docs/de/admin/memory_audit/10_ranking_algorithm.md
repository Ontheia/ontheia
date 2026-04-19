# Technische Referenz: Memory Ranking & Suchalgorithmus

Dieses Dokument beschreibt die mathematische und logische Funktionsweise der Ontheia Memory-Suche. Es dient als Referenz für Administratoren und als Kontext-Dokument für LLMs zur Analyse von Suchergebnissen.

## 1. Mathematische Basis (Phase 1: SQL)

Die Suche basiert auf Vektorsimilarität innerhalb einer Postgres-Datenbank mit der `pgvector`-Erweiterung.

### 1.1 Ähnlichkeitsmaß
Ontheia nutzt die **Cosine Similarity**. In der Datenbank wird die *Cosine Distance* (`<=>`) berechnet. Der Basis-Score wird wie folgt normalisiert:

$$Score_{base} = 1 - (Vektor_{Search} \cdot Vektor_{Document})$$

Wertebereich: `[0.0, 1.0]`. Ein Wert von `1.0` bedeutet Identität. Aufgrund der Charakteristik moderner Embedding-Modelle (z.B. `text-embedding-3-small`) gelten Werte ab `0.4` bereits als thematisch signifikant.

### 1.2 Namespace-Mischung
Namespaces werden nicht sequentiell durchsucht. Die Abfrage erfolgt über alle Ziel-Namespaces gleichzeitig (`namespace = ANY(...)`), was eine echte Relevanz-Mischung über Namespace-Grenzen hinweg ermöglicht.

---

## 2. Ranking-Faktoren (Phase 2: Code)

Nach der Datenbank-Abfrage wird ein Re-Ranking durchgeführt, um Kontext-Relevanz und Aktualität zu gewichten.

### 2.1 Recency Decay (Zeitlicher Zerfall)
Um aktuelle Informationen (z.B. aus der laufenden Session) zu bevorzugen, wird ein zeitabhängiger Bonus addiert.

**Formel:**
$$Bonus_{age} = \frac{recency\_decay}{1 + Alter\_in\_Tagen}$$

*   **recency_decay:** Konfigurierbar in `embedding.config.json` (Standard: `0.05`).
*   **Charakteristik:** Der Bonus halbiert sich nach dem ersten Tag und nähert sich nach 30 Tagen asymptotisch der Null.

| Alter | Effekt (bei decay 0.05) |
| :--- | :--- |
| 0 Tage (Heute) | + 0.050 |
| 1 Tag | + 0.025 |
| 7 Tage | + 0.006 |
| 30 Tage | + 0.001 |

### 2.2 Dynamische Namespace-Boni (Additiv)
In der Tabelle `app.vector_namespace_rules` können Boni pro Namespace-Pattern (Wildcards unterstützt) definiert werden. Diese Boni werden auf den Score addiert.

*   **Beispiel:** `vector.agent.*.howto` -> `bonus: 0.1`
*   **Logik:** Erhöht die "Sichtbarkeit" ganzer Kategorien gegenüber dem allgemeinen Gedächtnis.

### 2.3 Statische Prioritäten (Multiplikativ)
In der `embedding.config.json` können Namespaces gewichtet werden. Dieser Faktor wirkt verstärkend auf den bisherigen Gesamtscore.

*   **Beispiel:** `priorities: { "vector.project": 1.1 }` -> 10% Aufschlag auf den finalen Score.

---

## 3. Gesamt-Algorithmus (Zusammenfassung)

Der finale Score eines Treffers berechnet sich aus der Kombination aller Faktoren:

$$Score_{final} = (Score_{base} + Bonus_{rule} + Bonus_{age}) \times Priorität_{config}$$

### 3.1 Deduplizierung
Bevor Treffer an das LLM übergeben werden, findet eine inhaltsbasierte Deduplizierung statt (SHA-256 Hash des Contents).
*   Bei identischem Inhalt über verschiedene Namespaces hinweg gewinnt der Treffer mit dem **höchsten Score**.
*   Die anderen Instanzen werden als `duplicates` im Metadaten-Objekt des Gewinner-Treffers gespeichert.

### 3.2 Namespace-Instruktionen
Zusätzlich zum Ranking können Namespaces `instruction_templates` hinterlegen. Wenn ein Treffer aus einem solchen Namespace stammt, wird die Instruktion (z.B. *"Handle strikt nach dieser SOP: {{content}}"*) automatisch in den System-Prompt injiziert.

---

## 4. Konfiguration & Audit

*   **Konfigurationsdatei:** `config/embedding.config.json`
*   **Datenbank-Regeln:** `SELECT * FROM app.vector_namespace_rules;`
*   **Audit-Log:** Alle Lese- und Schreibvorgänge werden in `app.memory_audit_logs` zur Analyse der Relevanz-Entscheidungen protokolliert.
