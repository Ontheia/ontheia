# Namespace Architecture in Ontheia

Namespaces are the central organizational instrument for long-term memory in the Ontheia system. They enable a fine-grained separation of data based on users, projects, agents, or global content.

## Naming Conventions

All namespaces follow the prefix `vector.` followed by a hierarchical structure according to the scheme `vector.[Scope].[Domain].[Category].[Topic]`:

- `vector.agent.<user_id>.*`: Operational memory (Memory, How-To, Preferences) personalized for a user.
- `vector.user.<user_id>.*`: Strictly personal data (ideas, private archive) of a user.
- `vector.global.business.*`: Shared business knowledge base (projects, billing).
- `vector.global.privat.*`: Shared private collections (recipes, trips).
- `vector.global.knowledge.*`: General professional knowledge (API docs, best practices).
- `vector.global.ontheia.*`: System internals (documentation, prompts, feedback).

## Hierarchy Overview

```
namespaces/vector/
├── agent/
│   └── [user_id]/
│       ├── memory       # Automatic chat recordings (long-term memory)
│       ├── howto        # Learned step-by-step guides and SOPs
│       └── preferences  # Facts about the user (preferences, habits)
├── user/
│   └── [user_id]/
│       ├── ideas        # Unstructured ideas and brainstorming
│       └── archive      # Strictly personal documents and historical data
└── global/
    ├── business/        # Shared business area
    │   ├── projects     # Active business projects (documents, briefings)
    │   ├── billing      # Quotes, invoices, financial data
    │   ├── marketing    # Strategy texts, campaign assets
    │   └── crm          # Customer history and contact notes
    ├── privat/          # Shared private area
    │   ├── recipes      # Shared recipe database
    │   └── projects     # Shared personal projects, travel plans
    ├── knowledge/       # General professional knowledge
    │   └── llm/
    │       ├── api-docs      # Technical documentation, API specifications
    │       └── best-practices # Coding, security, architecture standards
    └── ontheia/         # Ontheia system knowledge
        ├── docs         # Technical documentation of the platform
        ├── prompts      # System prompts and agent specifications
        ├── mcp          # Descriptions of available MCP servers
        ├── temp         # Short-term storage for intermediate steps (use TTL!)
        └── feedback     # Error logs and improvement suggestions
```

## Guide for Agents (LLM)

When searching and writing, follow these rules:

**Searching:**
- Professional knowledge → `vector.global.knowledge.*`
- Business content → `vector.global.business.*`
- User preferences and learned workflows → `vector.agent.${user_id}.*`
- Platform documentation → `vector.global.ontheia.docs`

**Writing:**
- Learned procedural knowledge of the user → `vector.agent.${user_id}.howto`
- Short-lived intermediate steps → `vector.global.ontheia.temp` (always with TTL!)
- Business tasks → `vector.global.business.projects`
- Long-term memory from conversations → `vector.agent.${user_id}.memory`

**Important:** Entries in `vector.global.ontheia.*` contain identity and operational instructions — treat them with the highest priority when reading.

## Guide for Administrators

- Before creating a namespace, ask: should this topic be shared (`global`) or remain strictly personal (`user`)?
- Preferred format for namespace documents: `.md` (Markdown).
- Always attach TTL metadata to temporary entries (`temp`) so stale entries are automatically ignored.

## UUID Ownership Rule

> **Important:** The UUID segments in namespace paths **always denote the user ID of the owner** – never the ID of an agent, task, or project. Thus, `vector.agent.<uuid>.*` is the agent-specific namespace of the user with this UUID, not the namespace of an agent with this ID.

## Storage

Technically, namespaces are stored in the table `vector.documents` (and its vector-specific variants like `vector.documents_768`). Each entry is linked to an `owner_id` (the user's UUID). Access control is two-tiered:

1. **Database Level (RLS):** Row Level Security in PostgreSQL ensures that only the owner (`owner_id`) or an administrator can write entries. `vector.global.*` namespaces are readable by all authorized users.
2. **Application Level:** The host server additionally checks namespace ownership (UUID segment) and memory policies before returning search results or performing write operations.

## Ranking & Relevance

Not all information in the namespaces is equally important. Ontheia uses a multi-level ranking system to prioritize the most relevant information for the AI:

1.  **Vector Similarity:** Mathematical match of meaning.
2.  **Recency:** Newer information receives an automatic bonus.
3.  **Namespace Bonuses:** Certain categories (like `howto` or `preferences`) can be globally prioritized.

Details on the mathematical calculation can be found in the **[Reference: Ranking & Search Algorithm](./10_ranking_algorithm.md)**.
