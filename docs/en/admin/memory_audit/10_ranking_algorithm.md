# Technical Reference: Memory Ranking & Search Algorithm

This document describes the mathematical and logical operation of the Ontheia memory search. It serves as a reference for administrators and as a context document for LLMs when analyzing search results.

## 1. Mathematical Foundation (Phase 1: SQL)

The search is based on vector similarity within a Postgres database using the `pgvector` extension.

### 1.0 Two Numbers, Two Questions

A hit carries **two** values, and they are regularly confused:

| Field | Meaning | Range |
| :--- | :--- | :--- |
| `similarity` | Cosine similarity between query and entry. What the vector search actually measured. | `[0.0, 1.0]` |
| `relevance` | What the entry is worth for **this** query, after namespace bonus and recency. Ranking sorts on it, `min_score` filters it, and it is what the trace and the admin console display. | **can exceed 1** |

> ⚠️ **`relevance` is not a similarity.** As soon as a bonus or the recency
> share applies, the multiplier is greater than 1, so the value can exceed the
> similarity. `1.03` was observed on a correction whose wording nearly matched
> the stored entry (`similarity` 0.994, plus the same-day recency share).
>
> Up to version 0.6.0 this field was called `score` — carrying the name of the
> similarity measure without being one — and the raw similarity was overwritten
> during re-ranking, so it could not be retrieved at all. Both values are kept
> now. **Breaking change** for anyone reading `hit.score`.

### 1.1 Similarity Measure
Ontheia uses **Cosine Similarity**. The database calculates the *Cosine Distance* (`<=>`). Similarity is normalized as follows:

$$similarity = 1 - (Vector_{Search} \cdot Vector_{Document})$$

Value range: `[0.0, 1.0]`. A value of `1.0` means identity. Due to the characteristics of modern embedding models (e.g. `text-embedding-3-small`), values from `0.4` are already considered thematically significant.

> **Minimum relevance (default `0.4`, config key `min_score`).** Hits below this threshold are discarded before they reach the context. Up to version 0.5.0 the threshold was `0.2`, which meant almost every request filled `top_k` completely — even when the namespace held nothing relevant — and every one of those hits was paid for as prompt tokens. The value can be overridden per agent in the memory policy via `min_score`; a corpus with uniformly low values may warrant a lower one. The key is still named `min_score` — it sits in existing policies in the database and was not renamed along with the field; what it checks is the **relevance**, not the similarity (see 3.).
>
> Without a search term (plain browsing of a namespace, e.g. in the admin console) the threshold does not apply — there is no similarity to judge.

### 1.3 Relative Cutoff (default `0.7`)

A second filter after the minimum relevance, answering a **different** question. The minimum relevance asks: *is this hit related to the topic at all?* The relative cutoff asks: *is it still competitive within this result list?* It works on `relevance` too.

Hits below 70 % of the best hit are discarded. With a top hit of `0.81` everything below `0.57` drops out — even though it clears `0.4`.

**Why both are needed.** Measured across 3786 hits from 906 runs: in 227 runs even the *best* hit scored below `0.4`. A purely relative filter would have let 750 hits through there, because it only knows the distance to the best hit, not its quality. Conversely the minimum relevance alone keeps hits that stand no chance in comparison. The two do not replace each other.

**Characteristic.** The filter acts as a *tail trimmer*: the gap between the first two hits is irrelevant to it. A list of `0.999 / 0.999 / 0.994 / 0.688` loses only its last entry. In practice it fires in roughly 7 % of runs and removes 3.6 % of hits there — cosine scores sit close together by nature.

The value can be overridden per agent in the memory policy via `relative_cutoff`; `0` disables it. Values from `0.8` upwards are risky: at `0.9` every third hit would vanish, many of them legitimate.

### 1.4 Exclusion criteria, applied before scoring

Three groups drop out of the query before anything is scored — as a condition in the `WHERE` clause, not as a penalty:

| Condition | Meaning |
| :--- | :--- |
| `deleted_at IS NULL` | soft-deleted |
| `expires_at IS NULL OR expires_at > now()` | expired |
| `superseded_by IS NULL` | **replaced by a newer entry** |

The third arrived with version 0.6.0. A superseded entry is not "less relevant" — it is no longer the statement that holds. Penalising it through the relevance would leave it to the cosine to decide whether the old or the new version wins.

The superseded entry is kept and stays readable by its id. It disappears from search, not from the database.

### 1.2 Namespace Mixing
Namespaces are not searched sequentially. The query runs across all target namespaces simultaneously (`namespace = ANY(...)`), enabling true relevance mixing across namespace boundaries.

---

## 2. Ranking Factors (Phase 2: Code)

After the database query, a re-ranking is performed to weight context relevance and recency.

> **Both factors are multiplicative.** They are summed into a *single*
> multiplier, which the similarity is then multiplied by. A bonus of `0.1`
> therefore means **+10 % relative**, not `+0.1` absolute. On a similarity of
> `0.5` that is `+0.05`; on `0.8` it is `+0.08`.
>
> The calculation always starts from `similarity`, never from an already
> weighted `relevance` — otherwise the bonus would compound on repeated
> evaluation.

### 2.1 Recency Decay
To prefer recent information (e.g. from the current session), a time-dependent share is added to the multiplier.

**Formula:**
$$Share_{age} = \frac{recency\_decay}{1 + Age\_in\_Days}$$

> **Measured on `updated_at`, not `created_at`.** Up to version 0.6.0 the write path set `created_at` to now() whenever the same content was written again — the field already behaved like a modification date, and the ranking was calibrated on that. Now that the creation time is preserved, `updated_at` carries the role explicitly.
>
> `observed_at` is deliberately **not** used here: recency means how fresh the entry is in the system, not how old the fact is.

*   **recency_decay:** Configurable in `embedding.config.json` (default: `0.05`).
*   **Characteristic:** The share halves after the first day and asymptotically approaches zero after 30 days.

| Age | Effect (at decay 0.05) |
| :--- | :--- |
| 0 days (today) | + 5 % |
| 1 day | + 2.5 % |
| 7 days | + 0.6 % |
| 30 days | + 0.1 % |

In practice this is the weaker of the two: for an entry six months old it falls below 0.03 %, and any namespace rule outweighs it by a wide margin.

### 2.2 Dynamic Namespace Bonuses
In the `app.vector_namespace_rules` table, bonuses can be defined per namespace pattern. Each matching rule raises the multiplier by its bonus.

*   **Example:** `vector.agent.*.howto` -> `bonus: 0.1` yields a 10 % surcharge.
*   **Multiple matches:** If several rules match the same namespace, their bonuses add up within the multiplier.
*   **Logic:** Increases the "visibility" of entire categories compared to general memory.

> **Namespace weighting is maintained here and nowhere else.**
> `embedding.config.json` used to offer a second path for it
> (`ranking.priorities`). It was removed: both fed the same multiplier and
> added up silently, so a rule showing +9 % could actually apply +29 %. If the
> key is still present it is ignored, and a warning at startup spells out the
> conversion (`bonus = priority - 1`).

---

## 3. Overall Algorithm (Summary)

The relevance of a result is its similarity times a multiplier that both factors feed into:

$$relevance = similarity \times \left(1 + \sum Bonus_{rule} + Share_{age}\right)$$

The multiplier is therefore **at least** 1, and in practice almost always more — every entry picks up a small share from recency alone. That is why `relevance` regularly sits above `similarity` and can pass 1.

> **The threshold applies to the *relevance***, not to the similarity. A result can therefore cross a threshold its own similarity would not reach. This is intended: the threshold is calibrated against the values visible in the admin console and the trace.

### 3.1 Deduplication
Before results are passed to the LLM, content-based deduplication takes place (SHA-256 hash of content).
*   For identical content across different namespaces, the result with the **highest relevance** wins.
*   The other instances are stored as `duplicates` in the winner result's metadata object.

### 3.2 Namespace Instructions
In addition to ranking, a namespace can store an `instruction_template`. When a result comes from such a namespace, the instruction (e.g. *"Always follow this SOP strictly: {{content}}"*) precedes the result.

**Grouping.** Results matched by the same rule are grouped, and the instruction appears **once per group** — not once per result. Five hits from `…preferences` therefore produce one instruction, not five. This saves tokens and stops a model from reading the repetition as emphasis.

Group order follows each group's best result, so grouping never changes the ranking. Results without a matching rule appear in the block with no preamble.

```
USER PREFERENCE (MEMORY): … take it into account in your answer:
--- MEMORY ENTRY (Stored on 1/19/2026, confirmed by the user on 5/2/2026, Namespace: vector.agent.<uuid>.preferences) ---
Alexandra's email address: …

--- MEMORY ENTRY (Stored on 5/11/2026, Namespace: vector.agent.<uuid>.preferences) ---
Default chat with Alexandra: …
```

### 3.2.1 The maturity marker

A confirmed entry carries `confirmed by the user` in its header, with a date when the confirmation fell on a different day than the write. **Only `confirmed` is emitted.** `unconfirmed` is the state every entry starts in — not a denial but "maturity not established". Printing it would spend tokens on nearly every hit to say nothing, and a caveat that appears everywhere stops being read as one.

The **absence** therefore carries the meaning. So that it can be read, the note at the end of the block states it once rather than per entry:

> An entry marked "confirmed by the user" was verified by them; the others are records nobody has checked since they were written.

`superseded` never appears — superseded entries are already excluded by the search.

> **Where the block goes.** Not into the system prompt, but at the end of the last user message. The reason is prompt caching: results are request-dependent and would invalidate the cached system prefix on every request. Details in [Context and Memory Flow](/en/admin/memory_audit/00_context_and_memory_flow/).

### 3.3 Pattern Syntax
Rules from 2.2 and 3.2 share one syntax:

| Notation | Meaning | Example |
| :--- | :--- | :--- |
| `${...}` | exactly **one** namespace segment | `vector.agent.${user_id}.howto` matches every user |
| `*` | any remainder | `vector.agent.*` matches everything below |
| literal | exact segment | `vector.global.ontheia.temp` |

A rule always covers the **sub-namespaces** of its pattern as well: `vector.agent.${user_id}.howto` therefore also applies to `vector.agent.<uuid>.howto.sql`. When several instruction rules match, the **longest** one wins — the more specific rule beats the more general one.

---

## 4. Configuration & Audit

*   **Configuration file:** `config/embedding.config.json`
*   **Database rules:** `SELECT * FROM app.vector_namespace_rules;`
*   **Audit log:** Read and write operations are recorded in `app.memory_audit`, as are edits to existing entries (`write` with `operation: update`) and status changes (`status`, with `from` and `to`).
