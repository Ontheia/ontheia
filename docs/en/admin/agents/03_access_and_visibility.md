# Access & Visibility

Ontheia enables fine-grained control over which user can see and use which Agent.

## 1. Authorized Users

Access control is managed via the **"Authorized Users"** multiselect field in the Agent form.

| Selection | Effect |
|---|---|
| `* All users` | The Agent is accessible to all logged-in users (public). |
| Individual users | Access restricted to explicitly named accounts only. |
| No selection | Only the owner and administrators have access. |

**Quick links:**
- **Select all** — automatically sets `* All users`
- **Clear selection** — removes all permissions (owner/admin only)

## 2. Visibility in the Composer

The **"Show in Composer"** field controls whether the Agent appears in the Composer's Agent selection. An Agent can be authorized without appearing in the Composer — for example, delegation-only Agents that are exclusively called by other Agents.

## 3. Permission Check (RLS)

Technically, visibility is enforced via the PostgreSQL table `app.agent_permissions` and corresponding RLS Policies. Even if a user knows the UUID of an Agent, they cannot interact with it unless they have explicit permission.
