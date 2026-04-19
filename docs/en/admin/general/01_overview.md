# General System Settings

The "General" area in the admin console is used to control global parameters that affect the behavior of the AI agents, the user interface, and the API load for the entire Ontheia system.

## How it Works

In contrast to personal user settings, these values are centrally defined by the administrator and apply system-wide. They override the application's default values.

## Technical Background

Although these are global settings, they are technically stored in the `app.user_settings` table. To do this, the system uses a reserved **System User ID** (UUID: `00000000-0000-0000-0000-000000000000`) to maintain consistency with the rest of the permission system.

### Persistence Details:
- **Table:** `app.user_settings`
- **Column:** `settings` (JSONB)
- **Fields:** `runtime`, `uiFlags`, `promptOptimizer`, `builder`.
