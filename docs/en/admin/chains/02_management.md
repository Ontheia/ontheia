# Managing Chains

In the Admin Console, you can define the framework for new processes.

## 1. Creating a New Chain
Before steps can be defined, the base object must be created:
- **Agent:** The main agent this chain is assigned to (often used as an "entry point" or coordinator).
- **Name:** The display name in the system.
- **Description:** Explains the purpose of the workflow.

## 2. Visibility in the Composer
As with tasks, the **"Show in Composer"** field controls whether users can select this chain directly in the chat frontend.
- **Important:** A chain only appears in the composer if the assigned agent is visible to the user.

## 3. Versioning
Ontheia saves every change to the chain definition as a new version in the `app.chain_versions` table.
- **Auto-Save:** The designer saves progress automatically.
- **Activation:** Only the version marked as "active" is executed during a run.
