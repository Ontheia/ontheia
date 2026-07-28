# Technische Referenz: Memory Ranking & Suchalgorithmus

Dieses Dokument beschreibt die mathematische und logische Funktionsweise der Ontheia Memory-Suche. Es dient als Referenz für Administratoren und als Kontext-Dokument für LLMs zur Analyse von Suchergebnissen.

## 1. Mathematische Basis (Phase 1: SQL)

Die Suche basiert auf Vektorsimilarität innerhalb einer Postgres-Datenbank mit der `pgvector`-Erweiterung.

### 1.0 Zwei Zahlen, zwei Fragen

Ein Treffer trägt **zwei** Werte, und sie werden regelmäßig verwechselt:

| Feld | Bedeutung | Wertebereich |
| :--- | :--- | :--- |
| `similarity` | Kosinus-Ähnlichkeit zwischen Anfrage und Eintrag. Das, was die Vektorsuche gemessen hat. | `[0.0, 1.0]` |
| `relevance` | Was der Eintrag für **diese** Anfrage wert ist — nach Namespace-Bonus und Rezenz. Danach wird sortiert, darauf greift `min_score`, das steht in Trace und Admin-Konsole. | **kann > 1 sein** |

> ⚠️ **`relevance` ist kein Ähnlichkeitsmaß.** Sobald ein Bonus oder der
> Rezenz-Anteil greift, ist der Multiplikator größer als 1 — der Wert kann die
> Ähnlichkeit also übersteigen. Beobachtet wurde `1.03` bei einer Korrektur,
> deren Wortlaut dem gespeicherten Eintrag fast entsprach (`similarity` 0.994,
> plus Rezenz-Anteil desselben Tages).
>
> Bis Version 0.6.0 hieß dieses Feld `score` und trug damit den Namen des
> Ähnlichkeitsmaßes, ohne eines zu sein; die rohe Ähnlichkeit wurde beim
> Re-Ranking überschrieben und war gar nicht mehr abrufbar. Seitdem werden beide
> Werte geführt. **Breaking Change** für alle, die `hit.score` auswerten.

### 1.1 Ähnlichkeitsmaß
Ontheia nutzt die **Cosine Similarity**. In der Datenbank wird die *Cosine Distance* (`<=>`) berechnet. Die Ähnlichkeit wird wie folgt normalisiert:

$$similarity = 1 - (Vektor_{Search} \cdot Vektor_{Document})$$

Wertebereich: `[0.0, 1.0]`. Ein Wert von `1.0` bedeutet Identität. Aufgrund der Charakteristik moderner Embedding-Modelle (z.B. `text-embedding-3-small`) gelten Werte ab `0.4` bereits als thematisch signifikant.

> **Mindest-Relevanz (Standard `0.4`, Konfigurationsschlüssel `min_score`).** Treffer unterhalb dieser Schwelle werden verworfen, bevor sie in den Kontext gelangen. Bis Version 0.5.0 lag die Schwelle bei `0.2` — praktisch jede Anfrage schöpfte damit `top_k` voll aus, auch wenn im Namespace nichts Passendes stand, und jeder dieser Treffer wurde als Prompt-Token bezahlt. Der Wert lässt sich pro Agent in der Memory-Policy über `min_score` überschreiben; bei einem Korpus mit durchweg niedrigen Werten kann ein kleinerer sinnvoll sein. Der Schlüssel heißt weiterhin `min_score` — er steht in bestehenden Policies in der Datenbank und wurde nicht mitumbenannt; geprüft wird damit die **Relevanz**, nicht die Ähnlichkeit (siehe 3.).
>
> Ohne Suchbegriff (reines Durchblättern eines Namespace, etwa in der Admin-Konsole) greift die Schwelle nicht — dort gibt es keine Ähnlichkeit zu bewerten.

### 1.3 Relativer Cutoff (Standard `0.7`)

Ein zweiter Filter nach der Mindest-Relevanz, der eine **andere** Frage beantwortet. Die Mindest-Relevanz fragt: *Ist dieser Treffer überhaupt themenverwandt?* Der relative Cutoff fragt: *Ist er innerhalb dieser Trefferliste noch konkurrenzfähig?* Auch er rechnet mit `relevance`.

Treffer unterhalb von 70 % des besten Treffers werden verworfen. Bei einem Spitzentreffer von `0.81` fällt damit alles unter `0.57` heraus — auch wenn es über `0.4` liegt.

**Warum beides nötig ist.** Über 3786 Treffer aus 906 Läufen gemessen: In 227 Läufen lag bereits der *beste* Treffer unter `0.4`. Ein rein relativer Filter hätte dort 750 Treffer durchgelassen, weil er nur den Abstand zum Besten kennt, nicht dessen Güte. Umgekehrt behält die Mindest-Relevanz allein Treffer, die im Vergleich chancenlos sind. Die Kriterien ersetzen einander nicht.

**Charakteristik.** Der Filter wirkt als *Schwanz-Abschneider*: Der Abstand zwischen den ersten beiden Treffern ist für ihn unerheblich. Eine Liste `0.999 / 0.999 / 0.994 / 0.688` verliert nur den letzten Eintrag. In der Praxis greift er in etwa 7 % der Läufe und entfernt dort 3,6 % der Treffer — Kosinus-Werte liegen von Natur aus dicht beieinander.

Der Wert lässt sich pro Agent in der Memory-Policy über `relative_cutoff` überschreiben; `0` schaltet ihn ab. Werte ab `0.8` sind riskant: bei `0.9` verschwände jeder dritte Treffer, viele davon berechtigt.

### 1.4 Ausschlusskriterien vor dem Scoring

Vor jeder Bewertung fallen drei Gruppen aus der Abfrage — nicht als Abwertung, sondern als Bedingung in der `WHERE`-Klausel:

| Bedingung | Bedeutung |
| :--- | :--- |
| `deleted_at IS NULL` | gelöscht (weich) |
| `expires_at IS NULL OR expires_at > now()` | abgelaufen |
| `superseded_by IS NULL` | **von einem neueren Eintrag abgelöst** |

Die dritte Zeile kam mit Version 0.6.0. Ein abgelöster Eintrag ist nicht „weniger relevant" — er ist nicht mehr die geltende Aussage. Ihn über die Relevanz zu benachteiligen hieße, den Kosinus darüber entscheiden zu lassen, ob die alte oder die neue Fassung gewinnt.

Der abgelöste Eintrag bleibt erhalten und über seine ID lesbar. Er verschwindet aus der Suche, nicht aus der Datenbank.

### 1.2 Namespace-Mischung
Namespaces werden nicht sequentiell durchsucht. Die Abfrage erfolgt über alle Ziel-Namespaces gleichzeitig (`namespace = ANY(...)`), was eine echte Relevanz-Mischung über Namespace-Grenzen hinweg ermöglicht.

---

## 2. Ranking-Faktoren (Phase 2: Code)

Nach der Datenbank-Abfrage wird ein Re-Ranking durchgeführt, um Kontext-Relevanz und Aktualität zu gewichten.

> **Beide Faktoren wirken multiplikativ.** Sie werden zu *einem* Multiplikator
> aufsummiert, mit dem die Ähnlichkeit anschließend malgenommen wird. Ein Bonus
> von `0.1` bedeutet also **+10 % relativ**, nicht `+0.1` absolut. Bei einer
> Ähnlichkeit von `0.5` sind das `+0.05`, bei `0.8` sind es `+0.08`.
>
> Gerechnet wird immer aus `similarity`, nie aus einer schon gewichteten
> `relevance` — sonst würde sich der Bonus bei mehrfacher Auswertung aufmultiplizieren.

### 2.1 Recency Decay (Zeitlicher Zerfall)
Um aktuelle Informationen (z.B. aus der laufenden Session) zu bevorzugen, geht ein zeitabhängiger Anteil in den Multiplikator ein.

**Formel:**
$$Anteil_{age} = \frac{recency\_decay}{1 + Alter\_in\_Tagen}$$

> **Gemessen wird `updated_at`, nicht `created_at`.** Bis Version 0.6.0 setzte der Schreibpfad `created_at` bei jedem erneuten Schreiben desselben Inhalts auf „jetzt" — das Feld verhielt sich also bereits wie ein Änderungsdatum, und das Ranking war darauf eingestellt. Seit die Anlagezeit erhalten bleibt, trägt `updated_at` diese Rolle ausdrücklich.
>
> `observed_at` wird hier **nicht** verwendet: Rezenz meint, wie frisch der Eintrag im System ist, nicht wie alt der Sachverhalt ist.

*   **recency_decay:** Konfigurierbar in `embedding.config.json` (Standard: `0.05`).
*   **Charakteristik:** Der Anteil halbiert sich nach dem ersten Tag und nähert sich nach 30 Tagen asymptotisch der Null.

| Alter | Effekt (bei decay 0.05) |
| :--- | :--- |
| 0 Tage (Heute) | + 5 % |
| 1 Tag | + 2,5 % |
| 7 Tage | + 0,6 % |
| 30 Tage | + 0,1 % |

In der Praxis ist dieser Anteil der schwächere der beiden: bei einem Eintrag, der ein halbes Jahr alt ist, liegt er unter 0,03 % und wird von jeder Namespace-Regel deutlich übertroffen.

### 2.2 Dynamische Namespace-Boni
In der Tabelle `app.vector_namespace_rules` können Boni pro Namespace-Pattern definiert werden. Jede zutreffende Regel erhöht den Multiplikator um ihren Bonus.

*   **Beispiel:** `vector.agent.*.howto` -> `bonus: 0.1` ergibt einen Aufschlag von 10 %.
*   **Mehrere Treffer:** Passen mehrere Regeln auf denselben Namespace, addieren sich ihre Boni im Multiplikator.
*   **Logik:** Erhöht die "Sichtbarkeit" ganzer Kategorien gegenüber dem allgemeinen Gedächtnis.

> **Namespace-Gewichtung wird ausschließlich hier gepflegt.** Die
> `embedding.config.json` hatte früher einen zweiten Weg dafür
> (`ranking.priorities`). Er wurde entfernt: beide speisten denselben
> Multiplikator und addierten sich still, sodass eine Regel mit sichtbaren
> +9 % tatsächlich +29 % bewirken konnte. Ist der Schlüssel noch vorhanden,
> wird er ignoriert und beim Start eine Warnung mit der Umrechnung
> (`Bonus = Priorität − 1`) geschrieben.

---

## 3. Gesamt-Algorithmus (Zusammenfassung)

Die Relevanz eines Treffers berechnet sich aus seiner Ähnlichkeit und einem Multiplikator, in den beide Faktoren einfließen:

$$relevance = similarity \times \left(1 + \sum Bonus_{rule} + Anteil_{age}\right)$$

Der Multiplikator ist damit **mindestens** 1 und in der Praxis fast immer größer — jeder Eintrag bekommt schon durch die Rezenz einen kleinen Anteil. Deshalb liegt `relevance` regelmäßig über `similarity` und kann 1 überschreiten.

> **Die Schwelle greift auf die *Relevanz***, nicht auf die Ähnlichkeit. Ein Treffer kann also über einen Bonus eine Schwelle überschreiten, die er aus eigener Ähnlichkeit nicht erreicht. Das ist beabsichtigt: die Schwelle wird gegen die Werte kalibriert, die in Admin-Konsole und Trace sichtbar sind.

### 3.1 Deduplizierung
Bevor Treffer an das LLM übergeben werden, findet eine inhaltsbasierte Deduplizierung statt (SHA-256 Hash des Contents).
*   Bei identischem Inhalt über verschiedene Namespaces hinweg gewinnt der Treffer mit der **höchsten Relevanz**.
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
*   **Audit-Log:** Lese- und Schreibvorgänge werden in `app.memory_audit` protokolliert, ebenso Änderungen an bestehenden Einträgen (`write` mit `operation: update`) und Statuswechsel (`status`, mit `from` und `to`).
