# Deep Dive: Namespace Rules

Namespace rules allow administrators to globally control the behavior of AI search without having to configure each agent individually.

## 1. Ranking Bonuses
With the ranking bonus, you can control which information sources should be preferred.
- **Principle:** A bonus between `0.0` and `1.0` is added to the score of the search results.
- **Use Case:** Give `vector.global.knowledge.faq` a bonus of `0.2` so that official answers always appear above random chat notes.

## 2. LLM Instruction Templates
This is a powerful feature to increase response quality. When the AI finds a hit from a namespace with instruction text, this text is automatically injected into the system prompt.
- **Example:** For the namespace `vector.global.business.legal`, you store: *"Always cite the corresponding paragraph for information from this area."*
- **Effect:** The agent automatically becomes a "legal advisor" as soon as it retrieves knowledge from this source.

## 3. Pattern Matching
Rules are defined via wildcards (e.g., `vector.agent.*`). This allows rules to be efficiently applied to entire groups of namespaces.

---

## 🛠️ Technical Background
For a detailed mathematical explanation of the search and ranking algorithm (including Cosine Similarity, Recency Decay, and static priorities), please consult the:

👉 **[Technical Reference: Memory Ranking & Search Algorithm](./10_ranking_algorithm.md)**
