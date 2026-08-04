# Deep Dive: Namespace Rules

Namespace rules allow administrators to globally control the behavior of AI search without having to configure each agent individually.

## 1. Ranking Bonuses
With the ranking bonus, you can control which information sources should be preferred.
- **Principle:** A bonus between `0.0` and `1.0` acts as a **percentage surcharge** on the similarity, yielding the relevance. `0.2` therefore means +20 % — not `+0.2` as an absolute value.
- **Use Case:** Give `vector.global.knowledge.faq` a bonus of `0.2` so that official answers always appear above random chat notes.
- **Keep it moderate:** Values above `0.3` push weak results past the minimum-score threshold that their own similarity would never have reached. The rules shipped by default range from `0.03` to `0.12`.

## 2. LLM Instruction Templates
This is a powerful feature to increase response quality. When the AI finds a hit from a namespace with instruction text, that text precedes the hit in the context.
- **Example:** For the namespace `vector.global.business.legal`, you store: *"Always cite the corresponding paragraph for information from this area: {{content}}"*
- **Effect:** The agent automatically becomes a "legal advisor" as soon as it retrieves knowledge from this source.
- **Placeholder:** `{{content}}` marks where the results are inserted. If it is missing, they are appended to the text.
- **Once per group:** When several results match the same rule, the instruction appears **once** above all of them — not once per result.

### The `(SOURCE)` and `(MEMORY)` convention

The bundled templates open with a label in brackets, and it is not decoration: **it decides whether a hit gets cited.**

| Label | For | In the answer |
| :--- | :--- | :--- |
| `(SOURCE)` | Corpus — recipes, manuals, documentation, personal records | named as a source |
| `(MEMORY)` | Memory — notes, preferences, working instructions, scratch | **not** named |

The label tracks the memory class: every namespace of class `document` carries `(SOURCE)`, all others `(MEMORY)`. A template you write yourself should follow the same convention.

A cited corpus hit appears at the end of the answer as a third form beside a URL and a file path:

```
##### Sources
- Memory `vector.global.privat.recipes`
```

**Why this is needed.** The injected block is invisible to the user. Whether an answer comes from their own collection or from the model's general knowledge is not something they can see — both read as equally certain. Demonstrated by a case where the same agent, asked the same question twice, once invented a recipe and once returned the stored one, with nothing in either answer to tell them apart.

**What is never cited**, whatever the label: anything the user said in this conversation, anything the agent stored in this turn, and its own knowledge. An entry with no label is not cited either — when in doubt, stay silent.

> The text does not go into the system prompt but to the end of the last user message. The reason is prompt caching; details in the [technical reference](/en/admin/memory_audit/10_ranking_algorithm/).

## 3. Memory class

A rule can define a **default class** for its namespace. Every entry written there gets it automatically — the agent does not have to say anything.

| Class | For |
| :--- | :--- |
| **Episodic** | Something that happened, at a time |
| **Semantic** | A fact that holds until it is replaced |
| **Procedural** | A rule or how-to |
| **Working context** | Needed for the current task only |
| **Document (corpus)** | Ingested source material, not memory |

> **The rule is a default, not a verdict.** In practice a namespace holds mixed classes — `…preferences`, for instance, carries facts and working instructions alongside actual preferences. That is why any single entry may carry a different class when written, and why changing the rule later does **not** reclassify the existing rows.

> The class is deliberately **not** part of the namespace name. It can change — an episode that turns out to be a lasting fact changes class without leaving its namespace. Where no rule applies the field stays empty, which is more honest than a guess.

Leave the field on **"No default"** when a namespace is too mixed to carry a sensible one.

## 4. Pattern Matching
Rules apply to namespace patterns, not to individual namespaces:

| Notation | Meaning |
| :--- | :--- |
| `${user_id}` | exactly **one** segment — the rule applies to every user |
| `*` | any remainder, e.g. `vector.agent.*` |

A rule always covers the sub-namespaces of its pattern as well. When several instruction rules match, the longest one wins.

---

## 🛠️ Technical Background
For a detailed mathematical explanation of the search and ranking algorithm (including Cosine Similarity, Recency Decay, and namespace bonuses), please consult the:

👉 **[Technical Reference: Memory Ranking & Search Algorithm](/en/admin/memory_audit/10_ranking_algorithm/)**
