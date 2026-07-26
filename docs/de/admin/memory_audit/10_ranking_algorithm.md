# Technische Referenz: Memory Ranking & Suchalgorithmus

Dieses Dokument beschreibt die mathematische und logische Funktionsweise der Ontheia Memory-Suche. Es dient als Referenz für Administratoren und als Kontext-Dokument für LLMs zur Analyse von Suchergebnissen.

## 1. Mathematische Basis (Phase 1: SQL)

Die Suche basiert auf Vektorsimilarität innerhalb einer Postgres-Datenbank mit der `pgvector`-Erweiterung.

### 1.1 Ähnlichkeitsmaß
Ontheia nutzt die **Cosine Similarity**. In der Datenbank wird die *Cosine Distance* (`<=>`) berechnet. Der Basis-Score wird wie folgt normalisiert:

$$Score_{base} = 1 - (Vektor_{Search} \cdot Vektor_{Document})$$

Wertebereich: `[0.0, 1.0]`. Ein Wert von `1.0` bedeutet Identität. Aufgrund der Charakteristik moderner Embedding-Modelle (z.B. `text-embedding-3-small`) gelten Werte ab `0.4` bereits als thematisch signifikant.

> **Mindest-Score (Standard `0.4`).** Treffer unterhalb dieser Schwelle werden verworfen, bevor sie in den Kontext gelangen. Bis Version 0.5.0 lag die Schwelle bei `0.2` — praktisch jede Anfrage schöpfte damit `top_k` voll aus, auch wenn im Namespace nichts Passendes stand, und jeder dieser Treffer wurde als Prompt-Token bezahlt. Der Wert lässt sich pro Agent in der Memory-Policy über `min_score` überschreiben; bei einem Korpus mit durchweg niedrigen Scores kann ein kleinerer Wert sinnvoll sein.
>
> Ohne Suchbegriff (reines Durchblättern eines Namespace, etwa in der Admin-Konsole) greift die Schwelle nicht — dort gibt es keine Ähnlichkeit zu bewerten.

### 1.2 Namespace-Mischung
Namespaces werden nicht sequentiell durchsucht. Die Abfrage erfolgt über alle Ziel-Namespaces gleichzeitig (`namespace = ANY(...)`), was eine echte Relevanz-Mischung über Namespace-Grenzen hinweg ermöglicht.

---

## 2. Ranking-Faktoren (Phase 2: Code)

Nach der Datenbank-Abfrage wird ein Re-Ranking durchgeführt, um Kontext-Relevanz und Aktualität zu gewichten.

> **Alle drei Faktoren wirken multiplikativ.** Sie werden zu *einem* Multiplikator
> aufsummiert, mit dem der Basis-Score anschließend malgenommen wird. Ein Bonus
> von `0.1` bedeutet also **+10 % relativ**, nicht `+0.1` absolut. Bei einem
> Basis-Score von `0.5` sind das `+0.05`, bei `0.8` sind es `+0.08`.

### 2.1 Recency Decay (Zeitlicher Zerfall)
Um aktuelle Informationen (z.B. aus der laufenden Session) zu bevorzugen, geht ein zeitabhängiger Anteil in den Multiplikator ein.

**Formel:**
$$Anteil_{age} = \frac{recency\_decay}{1 + Alter\_in\_Tagen}$$

*   **recency_decay:** Konfigurierbar in `embedding.config.json` (Standard: `0.05`).
*   **Charakteristik:** Der Anteil halbiert sich nach dem ersten Tag und nähert sich nach 30 Tagen asymptotisch der Null.

| Alter | Effekt (bei decay 0.05) |
| :--- | :--- |
| 0 Tage (Heute) | + 5 % |
| 1 Tag | + 2,5 % |
| 7 Tage | + 0,6 % |
| 30 Tage | + 0,1 % |

In der Praxis ist dieser Anteil der schwächste der drei: bei einem Eintrag, der ein halbes Jahr alt ist, liegt er unter 0,03 % und wird von jeder Namespace-Regel deutlich übertroffen.

### 2.2 Dynamische Namespace-Boni
In der Tabelle `app.vector_namespace_rules` können Boni pro Namespace-Pattern definiert werden. Jede zutreffende Regel erhöht den Multiplikator um ihren Bonus.

*   **Beispiel:** `vector.agent.*.howto` -> `bonus: 0.1` ergibt einen Aufschlag von 10 %.
*   **Mehrere Treffer:** Passen mehrere Regeln auf denselben Namespace, addieren sich ihre Boni im Multiplikator.
*   **Logik:** Erhöht die "Sichtbarkeit" ganzer Kategorien gegenüber dem allgemeinen Gedächtnis.

### 2.3 Statische Prioritäten
In der `embedding.config.json` können Namespaces zusätzlich gewichtet werden. Eine Priorität von `1.1` steuert `0.1` zum Multiplikator bei — sie wirkt also genau wie ein Bonus von `0.1`, nur aus einer anderen Quelle.

*   **Beispiel:** `priorities: { "vector.agent.${user_id}.howto": 1.05 }` -> 5 % Aufschlag.
*   **Hinweis:** Die Datenbank-Regeln aus 2.2 sind der empfohlene Weg — sie lassen sich zur Laufzeit über die Admin-Oberfläche pflegen, während Änderungen an der Konfigurationsdatei einen Neustart erfordern.

---

## 3. Gesamt-Algorithmus (Zusammenfassung)

Der finale Score eines Treffers berechnet sich aus dem Basis-Score und einem Multiplikator, in den alle Faktoren einfließen:

$$Score_{final} = Score_{base} \times \left(1 + \sum Bonus_{rule} + \sum (Priorität_{config} - 1) + Anteil_{age}\right)$$

> **Die Mindest-Score-Schwelle greift auf den *finalen* Score**, nicht auf den Basis-Score. Ein Treffer kann also über einen Bonus eine Schwelle überschreiten, die er aus eigener Ähnlichkeit nicht erreicht. Das ist beabsichtigt: die Schwelle wird gegen die Werte kalibriert, die in Admin-Konsole und Trace sichtbar sind.

### 3.1 Deduplizierung
Bevor Treffer an das LLM übergeben werden, findet eine inhaltsbasierte Deduplizierung statt (SHA-256 Hash des Contents).
*   Bei identischem Inhalt über verschiedene Namespaces hinweg gewinnt der Treffer mit dem **höchsten Score**.
*   Die anderen Instanzen werden als `duplicates` im Metadaten-Objekt des Gewinner-Treffers gespeichert.

### 3.2 Namespace-Instruktionen
Zusätzlich zum Ranking können Namespaces ein `instruction_template` hinterlegen. Stammt ein Treffer aus einem solchen Namespace, wird die Instruktion (z.B. *"Handle strikt nach dieser SOP: {{content}}"*) dem Treffer vorangestellt.

**Gruppierung.** Treffer, auf die dieselbe Regel zutrifft, werden zusammengefasst, und die Instruktion erscheint **einmal je Gruppe** — nicht einmal je Treffer. Fünf Treffer aus `…preferences` erzeugen also einen Instruktionstext, nicht fünf. Das spart Token und verhindert, dass ein Modell die Wiederholung als Betonung liest.

Die Reihenfolge der Gruppen folgt dem jeweils besten Treffer, sodass die Gruppierung die Rangfolge nicht verändert. Treffer ohne zutreffende Regel stehen ohne Vorspann im Block.

```
NUTZERPRÄFERENZ (MEMORY): … Berücksichtige sie bei deiner Antwort:
--- MEMORY ENTRY (Stored on 1/19/2026, Namespace: vector.agent.<uuid>.preferences) ---
E-Mail-Adresse von Alexandra: …

--- MEMORY ENTRY (Stored on 5/11/2026, Namespace: vector.agent.<uuid>.preferences) ---
Standard-Chat mit Alexandra: …
```

> **Wo der Block landet.** Nicht im System-Prompt, sondern am Ende der letzten Nutzernachricht. Der Grund ist Prompt-Caching: Treffer sind anfrageabhängig und würden im System-Prefix den Cache bei jeder Anfrage entwerten. Details in [Kontext- und Gedächtnisfluss](/de/admin/memory_audit/00_context_and_memory_flow/).

### 3.3 Pattern-Syntax
Regeln aus 2.2 und 3.2 verwenden dieselbe Syntax:

| Schreibweise | Bedeutung | Beispiel |
| :--- | :--- | :--- |
| `${...}` | genau **ein** Namespace-Segment | `vector.agent.${user_id}.howto` trifft jeden Nutzer |
| `*` | beliebiger Rest | `vector.agent.*` trifft alles darunter |
| Literal | exakter Abschnitt | `vector.global.ontheia.temp` |

Eine Regel deckt immer auch die **Unter-Namespaces** ihres Musters ab: `vector.agent.${user_id}.howto` gilt damit ebenso für `vector.agent.<uuid>.howto.sql`. Treffen mehrere Instruktionsregeln zu, gewinnt die **längste** — die spezifischere Regel setzt sich gegen die allgemeinere durch.

---

## 4. Konfiguration & Audit

*   **Konfigurationsdatei:** `config/embedding.config.json`
*   **Datenbank-Regeln:** `SELECT * FROM app.vector_namespace_rules;`
*   **Audit-Log:** Lese- und Schreibvorgänge werden in `app.memory_audit` zur Analyse der Relevanz-Entscheidungen protokolliert. Änderungen an bestehenden Einträgen erscheinen dort nicht.
