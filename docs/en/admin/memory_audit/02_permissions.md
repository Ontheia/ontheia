# Visibility & Permissions

Ontheia uses a hybrid permission model for memory that combines isolation with collaboration.

## 1. Private Namespaces (Isolated)
Namespaces such as `vector.user.*` or `vector.agent.*` are **user-related**.
- **Read/Write:** Only the owner (`owner_id`) or an administrator has access.
- **Distinction:** 
  - `vector.user.*` contains data that the user has explicitly marked as private.
  - `vector.agent.*` contains system-generated histories and profiles optimized for the user.

## 2. Global Namespaces (`vector.global.*`)
Content in this area serves as a shared knowledge base and for collaboration.
- **Read:** All authorized users can read `vector.global.*` namespaces, provided they are entered in the memory policy of the agent/task.
- **Write:** Write access to global namespaces is **not automatically allowed**. It must be explicitly entered in `allowedWriteNamespaces` in the policy configuration (and `allowToolWrite` must be activated).
- **Hierarchy:** Sub-areas like `global.business`, `global.privat`, or `global.knowledge` enable thematic separation while maintaining readability.
- **Purpose:** Shared recipes, business projects, company manuals, and technical expertise.

## 3. Administrator Access & Data Privacy

Administrators have the technical ability to view namespaces via the console. However, Ontheia follows a "Privacy First" approach:

- **User Approval:** In their personal settings, users can activate or deactivate the option *"Admin may manage my memory namespaces"*.
- **Enforcement:** Without this explicit approval, administrator access to private user namespaces is blocked by RLS rules (unless global admin override is active in the DB).
- **Transparency (Audit):**
  - If access was **denied** (no `allow_admin_memory` approval), the action `warning` is written to the audit log.
  - If access was **allowed** (approval present), the action `read` is logged – with the additional field `admin_actor_id`, which records the identity of the administrator.
