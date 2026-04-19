# Access & Visibility

Ontheia enables fine-grained control over which user can see and use which Agent.

## 1. Visibility Modes

### Private (Default)
The Agent is generally visible only to its owner (Owner) and administrators. 
- **Assignment:** Additional persons can be explicitly authorized via the "Authorized Users" field.
- **Advantage:** Ideal for specialized Agents of individual employees or confidential test setups.

### Public
The Agent is available to **all authenticated users** of the system.
- **Display:** Automatically appears for every user in the Agent selection.
- **Advantage:** Perfect for general assistants (e.g., "Standard Chat" or "HR Information").

## 2. Permission Check (RLS)
Technically, visibility is enforced via the PostgreSQL table `app.agent_permissions` and corresponding RLS Policies. Even if a user knows the UUID of an Agent, they cannot interact with it unless they have explicit permission.
