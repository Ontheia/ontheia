# Access & Visibility

Ontheia enables fine-grained control over which user can see and use which Agent.

## 1. Owner (Ownership)

Every Agent has exactly one **owner**. The owner always sees the Agent in their composer (as long as "Show in Composer" is enabled) and does not need an entry under "Authorized Users".

By default, the creating admin becomes the owner. When an admin creates an Agent **on behalf of another user**, they should select the target user in the **"Owner"** field — otherwise the Agent appears in the admin's composer instead of the target user's. Ownership can be transferred at any time when editing; admins retain full management access to all Agents via the Admin Console regardless.

**Rule of thumb:** Owner = the user *whose* Agent it is. Authorized Users = additional co-users.

## 2. Authorized Users

Access control is managed via the **"Authorized Users"** multiselect field in the Agent form.

| Selection | Effect |
|---|---|
| `* All users` | The Agent is accessible to all logged-in users (public). |
| Individual users | Access restricted to explicitly named accounts only. |
| No selection | Only the owner and administrators have access. |

**Quick links:**
- **Select all** — automatically sets `* All users`
- **Clear selection** — removes all permissions (owner/admin only)

## 3. Visibility in the Composer

The **"Show in Composer"** field controls whether the Agent appears in the Composer's Agent selection. An Agent can be authorized without appearing in the Composer — for example, delegation-only Agents that are exclusively called by other Agents.

The flag applies **globally per Agent** — it shows or hides the Agent for all visibility-authorized users alike, not per user. Who sees the Agent in the composer is determined by owner + authorized users; the flag only toggles the display as a whole.

## 4. Permission Check (RLS)

Technically, visibility is enforced via the PostgreSQL table `app.agent_permissions` and corresponding RLS Policies. Even if a user knows the UUID of an Agent, they cannot interact with it unless they have explicit permission.
