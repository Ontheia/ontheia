# System Status & Info

The "Info" area serves as a central dashboard for a technical overview of the Ontheia instance. It bundles key figures, security status, and version information.

## 1. Environment Status
Here you can see the current utilization of your configuration:
- **Registered Agents:** Number of AI identities stored in the database.
- **Available Providers/Models:** Total of configured AI connections.
- **Current Chain Steps:** Number of logical units across all active Chains.

## 2. Security & Compliance
Ontheia enforces several security layers, the status of which is confirmed here:
- **RBAC (Role Based Access Control):** Ensures that the Admin Console and sensitive APIs are only accessible to users with the `admin` role.
- **Secret Injection:** Confirms that API keys and passwords are isolated via the secure SecretRef pattern and Rootless Docker.
- **Audit Logging:** Refers to the `app.run_logs` table, where every Run and every tool call is unalterably logged.
- **System Hardening:** Confirms the application of security profiles (readonly file systems, removal of capabilities) for all MCP processes via `orchestrator.hardening.json`.

## 3. Software Version
Shows the currently installed version of the WebUI and the host service. This is particularly important for support and when planning updates.

## 4. Admin Session Token
For automated tests or external API access (e.g., via `curl` or scripts), the currently valid session token of the logged-in administrator is displayed here.
- **Security:** Treat this token like a password. It grants full administrative access to the API.
- **Copy Function:** The token can be conveniently copied to the clipboard via the "Copy" button.
- **Validity:** The token expires automatically after the session ends or upon logout.
