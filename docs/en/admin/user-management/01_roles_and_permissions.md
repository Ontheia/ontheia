# User Management, Roles & Status

Ontheia uses a role-based access model (RBAC) and a status-based approval system to secure the functions of the system.

## 1. User Types (Roles)

### Administrator (`admin`)
- Full access to all tabs of the Admin Console.
- Can start/stop MCP servers, configure providers, and change global system parameters.
- Can create public agents and global chains.
- Permission to manage vector storage and Audit Logs.
- **Self-Protection:** The system prevents administrators from deleting, blocking, or revoking their own admin rights.

### Standard User (`user`)
- Has no access to the Admin Console.
- Can only see agents and projects that have been shared with them.
- Manages their own API keys and personal settings.

## 2. User Status

Each user has a status that controls access to the system:

- **Active (`active`):** The user can log in and use all shared functions.
- **Pending (`pending`):** The account has been created (e.g., via self-signup) but is waiting for approval by an administrator. Login is not yet possible.
- **Suspended (`suspended`):** The account has been deactivated by an administrator. All active sessions are terminated and login is blocked.

## 3. Registration Workflow & Approval

The registration process can be controlled in the **General Settings** of the Admin Console:

### Self-Registration (Self-Signup)
- **Enabled:** New users can register via the `/signup` page.
- **Disabled:** New accounts can only be created manually by an administrator.

### Admin Approval
If the "Admin Approval Required" option is enabled, new users automatically receive the status `pending` after registration. 
An administrator must manually set the status to `active` in **User Management** before the user can use the system.

## 4. Agent Permissions
In Agent Management, administrators can assign agents to specific users:
- **Assignment:** Users are selected by their email address via the "User Picker".
- **Effect:** The agent immediately appears in the WebUI of the corresponding user.
- **Sharing:** By adding multiple users, agents can be effectively shared for teams without making them directly "public".
