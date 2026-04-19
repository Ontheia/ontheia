# Best Practices for Administrators

## Structuring Company Knowledge

1.  **Static Knowledge:** Upload documents such as HR policies, IT manuals, or general FAQs into namespaces under `vector.global.knowledge.*`. Agents of all employees can access this knowledge for reading.
2.  **Business Collaboration:** Use `vector.global.business.*` for company-wide knowledge collections, projects, and billing, where authorized users are permitted to make additions.
3.  **Thematic Separation:** Use the hierarchy consistently (e.g., `vector.global.privat.recipes` vs. `vector.global.business.marketing`). This allows agents to be given targeted access only to the "domains" relevant to their role.

## Configuring topK Correctly

The `topK` value determines how many memory hits are loaded into a run's context at most.

- **Too high** → The context fills with irrelevant entries; the LLM loses focus
- **Too low** → Important information is missing from the context
- **Recommendation:** Start with `topK = 5`; increase to `10` for agents with complex domain knowledge

## Using Auto-Write Deliberately

`allowWrite` determines whether the system automatically writes to the memory namespace after each run.

- **`allowWrite = true`** only for agents that actually generate new knowledge (e.g., analysis agents, research agents)
- **`allowWrite = false`** for pure execution agents (sending emails, reading calendars) — these produce no insights worth storing permanently
- **`allowToolWrite = true`** only when the agent should actively and deliberately build up knowledge

**Sub-agents:** By default, each sub-agent writes automatically after its run if its policy has `allowWrite = true`. To prevent this (e.g., because the sub-agent output is only an intermediate result), set `allowWrite: false` in the sub-agent memory policy.

## Monitoring & Security

-   **Dashboard:** Regularly check the dashboard under "Memory & Audit." A high number of warnings in the last 24h indicates misconfigured agents or attempted unauthorized access.
-   **Audit Log:** Use the namespace filter in the audit log to specifically search for access to sensitive areas (e.g., `global.business.billing`).
-   **Ranking Rules:** Use the "Namespace Rules Editor" to control the importance of certain sources. For example, `vector.global.knowledge.*` namespaces can receive a bonus so that verified company knowledge is preferred over fleeting chat notes.
