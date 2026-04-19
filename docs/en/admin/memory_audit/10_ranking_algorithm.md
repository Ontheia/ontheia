# Technical Reference: Memory Ranking & Search Algorithm

This document describes the mathematical and logical operation of the Ontheia memory search. It serves as a reference for administrators and as a context document for LLMs when analyzing search results.

## 1. Mathematical Foundation (Phase 1: SQL)

The search is based on vector similarity within a Postgres database using the `pgvector` extension.

### 1.1 Similarity Measure
Ontheia uses **Cosine Similarity**. The database calculates the *Cosine Distance* (`<=>`). The base score is normalized as follows:

$$Score_{base} = 1 - (Vector_{Search} \cdot Vector_{Document})$$

Value range: `[0.0, 1.0]`. A value of `1.0` means identity. Due to the characteristics of modern embedding models (e.g. `text-embedding-3-small`), values from `0.4` are already considered thematically significant.

### 1.2 Namespace Mixing
Namespaces are not searched sequentially. The query runs across all target namespaces simultaneously (`namespace = ANY(...)`), enabling true relevance mixing across namespace boundaries.

---

## 2. Ranking Factors (Phase 2: Code)

After the database query, a re-ranking is performed to weight context relevance and recency.

### 2.1 Recency Decay
To prefer recent information (e.g. from the current session), a time-dependent bonus is added.

**Formula:**
$$Bonus_{age} = \frac{recency\_decay}{1 + Age\_in\_Days}$$

*   **recency_decay:** Configurable in `embedding.config.json` (default: `0.05`).
*   **Characteristic:** The bonus halves after the first day and asymptotically approaches zero after 30 days.

| Age | Effect (at decay 0.05) |
| :--- | :--- |
| 0 days (today) | + 0.050 |
| 1 day | + 0.025 |
| 7 days | + 0.006 |
| 30 days | + 0.001 |

### 2.2 Dynamic Namespace Bonuses (Additive)
In the `app.vector_namespace_rules` table, bonuses can be defined per namespace pattern (wildcards supported). These bonuses are added to the score.

*   **Example:** `vector.agent.*.howto` -> `bonus: 0.1`
*   **Logic:** Increases the "visibility" of entire categories compared to general memory.

### 2.3 Static Priorities (Multiplicative)
In `embedding.config.json`, namespaces can be weighted. This factor amplifies the current total score.

*   **Example:** `priorities: { "vector.project": 1.1 }` -> 10% surcharge on the final score.

---

## 3. Overall Algorithm (Summary)

The final score of a result is calculated from the combination of all factors:

$$Score_{final} = (Score_{base} + Bonus_{rule} + Bonus_{age}) \times Priority_{config}$$

### 3.1 Deduplication
Before results are passed to the LLM, content-based deduplication takes place (SHA-256 hash of content).
*   For identical content across different namespaces, the result with the **highest score** wins.
*   The other instances are stored as `duplicates` in the winner result's metadata object.

### 3.2 Namespace Instructions
In addition to ranking, namespaces can store `instruction_templates`. When a result comes from such a namespace, the instruction (e.g. *"Always follow this SOP strictly: {{content}}"*) is automatically injected into the system prompt.

---

## 4. Configuration & Audit

*   **Configuration file:** `config/embedding.config.json`
*   **Database rules:** `SELECT * FROM app.vector_namespace_rules;`
*   **Audit log:** All read and write operations are recorded in `app.memory_audit_logs` for analysis of relevance decisions.
