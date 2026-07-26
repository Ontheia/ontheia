# Technical Reference: Memory Ranking & Search Algorithm

This document describes the mathematical and logical operation of the Ontheia memory search. It serves as a reference for administrators and as a context document for LLMs when analyzing search results.

## 1. Mathematical Foundation (Phase 1: SQL)

The search is based on vector similarity within a Postgres database using the `pgvector` extension.

### 1.1 Similarity Measure
Ontheia uses **Cosine Similarity**. The database calculates the *Cosine Distance* (`<=>`). The base score is normalized as follows:

$$Score_{base} = 1 - (Vector_{Search} \cdot Vector_{Document})$$

Value range: `[0.0, 1.0]`. A value of `1.0` means identity. Due to the characteristics of modern embedding models (e.g. `text-embedding-3-small`), values from `0.4` are already considered thematically significant.

> **Minimum score (default `0.4`).** Hits below this threshold are discarded before they reach the context. Up to version 0.5.0 the threshold was `0.2`, which meant almost every request filled `top_k` completely — even when the namespace held nothing relevant — and every one of those hits was paid for as prompt tokens. The value can be overridden per agent in the memory policy via `min_score`; a corpus with uniformly low scores may warrant a lower one.
>
> Without a search term (plain browsing of a namespace, e.g. in the admin console) the threshold does not apply — there is no similarity to judge.

### 1.2 Namespace Mixing
Namespaces are not searched sequentially. The query runs across all target namespaces simultaneously (`namespace = ANY(...)`), enabling true relevance mixing across namespace boundaries.

---

## 2. Ranking Factors (Phase 2: Code)

After the database query, a re-ranking is performed to weight context relevance and recency.

> **All three factors are multiplicative.** They are summed into a *single*
> multiplier, which the base score is then multiplied by. A bonus of `0.1`
> therefore means **+10 % relative**, not `+0.1` absolute. On a base score of
> `0.5` that is `+0.05`; on `0.8` it is `+0.08`.

### 2.1 Recency Decay
To prefer recent information (e.g. from the current session), a time-dependent share is added to the multiplier.

**Formula:**
$$Share_{age} = \frac{recency\_decay}{1 + Age\_in\_Days}$$

*   **recency_decay:** Configurable in `embedding.config.json` (default: `0.05`).
*   **Characteristic:** The share halves after the first day and asymptotically approaches zero after 30 days.

| Age | Effect (at decay 0.05) |
| :--- | :--- |
| 0 days (today) | + 5 % |
| 1 day | + 2.5 % |
| 7 days | + 0.6 % |
| 30 days | + 0.1 % |

In practice this is the weakest of the three: for an entry six months old it falls below 0.03 %, and any namespace rule outweighs it by a wide margin.

### 2.2 Dynamic Namespace Bonuses
In the `app.vector_namespace_rules` table, bonuses can be defined per namespace pattern. Each matching rule raises the multiplier by its bonus.

*   **Example:** `vector.agent.*.howto` -> `bonus: 0.1` yields a 10 % surcharge.
*   **Multiple matches:** If several rules match the same namespace, their bonuses add up within the multiplier.
*   **Logic:** Increases the "visibility" of entire categories compared to general memory.

### 2.3 Static Priorities
In `embedding.config.json`, namespaces can be weighted additionally. A priority of `1.1` contributes `0.1` to the multiplier — it behaves exactly like a bonus of `0.1`, only from a different source.

*   **Example:** `priorities: { "vector.project": 1.1 }` -> 10 % surcharge.
*   **Note:** The database rules from 2.2 are the recommended path — they can be maintained at runtime through the admin UI, whereas changes to the configuration file require a restart.

---

## 3. Overall Algorithm (Summary)

The final score of a result is the base score times a multiplier that all factors feed into:

$$Score_{final} = Score_{base} \times \left(1 + \sum Bonus_{rule} + \sum (Priority_{config} - 1) + Share_{age}\right)$$

> **The minimum-score threshold applies to the *final* score**, not the base score. A result can therefore cross a threshold its own similarity would not reach. This is intended: the threshold is calibrated against the values visible in the admin console and the trace.

### 3.1 Deduplication
Before results are passed to the LLM, content-based deduplication takes place (SHA-256 hash of content).
*   For identical content across different namespaces, the result with the **highest score** wins.
*   The other instances are stored as `duplicates` in the winner result's metadata object.

### 3.2 Namespace Instructions
In addition to ranking, a namespace can store an `instruction_template`. When a result comes from such a namespace, the instruction (e.g. *"Always follow this SOP strictly: {{content}}"*) precedes the result.

**Grouping.** Results matched by the same rule are grouped, and the instruction appears **once per group** — not once per result. Five hits from `…preferences` therefore produce one instruction, not five. This saves tokens and stops a model from reading the repetition as emphasis.

Group order follows each group's best result, so grouping never changes the ranking. Results without a matching rule appear in the block with no preamble.

```
USER PREFERENCE (MEMORY): … take it into account in your answer:
--- MEMORY ENTRY (Stored on 1/19/2026, Namespace: vector.agent.<uuid>.preferences) ---
Alexandra's email address: …

--- MEMORY ENTRY (Stored on 5/11/2026, Namespace: vector.agent.<uuid>.preferences) ---
Default chat with Alexandra: …
```

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
*   **Audit log:** Read and write operations are recorded in `app.memory_audit` for analysis of relevance decisions. Changes to existing entries do not appear there.
