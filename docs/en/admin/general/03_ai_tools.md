# AI Tools (Standard Providers)

Here the administrator defines which AI models should be used for internal system tools.

## 1. Prompt Optimizer
The Prompt Optimizer automatically improves user requests before they are sent to the actual agent.
- **Configuration:** Selection of provider (e.g., OpenAI) and model (e.g., GPT-4o).
- **Requirement:** Since this step serves quality assurance, a powerful model should be chosen here.

## 2. Agent Builder
The Agent Builder supports administrators and users in creating new agent definitions and task contexts.
- **Configuration:** Selection of provider and model.
- **Purpose:** Based on short descriptions, the model generates complex system prompts and suggests suitable tools.

---

### Note on Selection
Changes to these providers take effect immediately. Ensure that the selected providers are correctly configured in the **"AI Provider"** tab and the associated API keys are stored.
