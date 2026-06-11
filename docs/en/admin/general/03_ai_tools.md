# AI Tools (Standard Providers)

Here the administrator defines which AI models should be used for internal system tools.

## 1. Prompt Optimizer
The Prompt Optimizer automatically improves user requests before they are sent to the actual agent.
- **Configuration:** Selection of provider (e.g., OpenAI) and model (e.g., GPT-5).
- **Preset:** The installer sets provider/model to the install default (same provider as the example agents); the underlying chain binds the optimize step to the Personal Assistant.
- **Requirement:** Since this step serves quality assurance, a powerful model should be chosen here.

## 2. Context Compression (Rolling Summary)
The Summarizer automatically compresses older chat history once the context exceeds a configurable token threshold. This keeps conversations running smoothly even over very long sessions.
- **Configuration:** Selection of provider, model, token threshold and minimum plaintext window (default: 20).
- **Preset:** The installer sets provider/model to the install default and the token threshold to 8,000 — compression is active out of the box.
- **Recommendation:** A capable model improves summary quality; a fast and cost-efficient model reduces latency during compression.

Full description: [Context Compression](/en/admin/general/04_rolling_summary/)

---

### Note on Selection
Changes to these providers take effect immediately. Ensure that the selected providers are correctly configured in the **"AI Provider"** tab and the associated API keys are stored.
