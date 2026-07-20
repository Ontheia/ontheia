# 🛡️ Security Concept Ontheia (MCP Host/Agent)

## 1. Introduction & Objectives
This document describes the security concept for the "Ontheia" system, consisting of WebUI, host (backend) and database (Postgres). It serves as a reference for implementation and as a template for security audits.

### Protection goals:
- **Confidentiality:** Protection of user data, AI prompts and API keys.
- **Integrity:** Protection against unauthorized manipulation of agent configurations and memory contents.
- **Availability:** Protection against denial of service through resource limits (MCP servers, LLM quotas).
- **Isolation:** Strict separation between different users (multi-tenancy) and between the host system and the MCP servers (sandboxing).

---

## 2. Authentication (AuthN) & Session Management
- **Password storage:** bcrypt (`bcryptjs`) with a cost factor of 12; the salt is part of the hash.
- **Sessions:**
    - Opaque session tokens (UUID) stored in `app.sessions` — no JWT, no cookies.
    - The token is sent by the WebUI as `Authorization: Bearer <token>` and held in `localStorage`.
    - Session lifetime: 7 days; sessions can be revoked server-side (`revoked` flag).
- **CSRF:** Structurally not applicable — no credential is sent automatically by the browser, so a foreign origin cannot ride along on an existing session.
- **Trade-off:** A token in `localStorage` is readable by JavaScript, so it is exposed by a successful XSS. This is why the strict CSP in section 6 is a load-bearing control, not a nicety.
- **Multi-factor authentication (MFA):** (planned for phase 2).

---

## 3. Authorization (AuthZ) & Tenant Separation
- **Role-based access model (RBAC):**
    - `admin`: Full access to system configuration, MCP server management and all user resources.
    - `user`: Access to own chats, agents and assigned tools.
- **Database level (RLS):** PostgreSQL Row Level Security ensures that users can only access their own records in the `app` and `vector` schemas.
- **Tenant separation:** Isolation at namespace level in the memory adapter (`vector.user.<user_id>.*`).

---

## 4. MCP Server Sandboxing & Runtime Security
- **Runtime environment:** Docker Rootless by default for all MCP servers.
- **Hardening flags (enforced by the orchestrator):**
    - `--read-only`: The container file system is read-only.
    - `--tmpfs /tmp:rw,nosuid,nodev,size=64m`: Limited writable storage for temporary data.
    - `--cap-drop=ALL`: Drops all Linux capabilities.
    - `--security-opt no-new-privileges`: Prevents privilege escalation.
- **Resource limits:**
    - CPU: max. 1 core (configurable).
    - Memory: max. 512 MB (configurable).
    - PIDs: max. 256 processes.
- **Allowlists:**
    - **Docker images:** Only explicitly approved images (`config/allowlist.images`).
    - **Packages:** Validation of npm/PyPI packages when using `uvx` or `npx`.

---

## 5. Agent Skills — Security Model

| Protection | Description |
| :--- | :--- |
| **Path boundary (skill_dir)** | Every skill file access checks `resolved.startsWith(skill_dir)`. Path traversal attacks (`../../etc/passwd`) are blocked. |
| **Scope permissions** | User-scope skills: only owner can write. Global-scope skills: admin only. All authenticated users can read. |
| **Script execution (cli-tools)** | Scripts run exclusively via the `cli-tools` MCP server, which runs in Docker Rootless. The ALLOWED_COMMANDS allowlist limits which commands can be executed. |
| **Code adaptation by LLM** | The LLM adapts code templates from SKILL.md and passes them as arguments to `uv run` or `python3 -c`. No persistent script files are written by the LLM outside of explicit `write_skill_resource` calls. |
| **No self-installation** | The cli-server cannot install packages permanently. `uv run --with <package>` creates isolated environments that are discarded after the process ends. |
| **RLS on app.skills** | The `app.skills` table is subject to Row Level Security. Users see only global and their own skills. |
| **Content security** | Skills must not contain malware, exploit code, or misleading content (Principle of Lack of Surprise, agentskills.io standard). |

---

## 6. Network Security
- **Network isolation:** MCP servers run in a dedicated Docker network (`ontheia-net`) without direct access to the host or other containers (unless explicitly configured).
- **Egress control:** Global allowlist for outbound connections (`config/allowlist.urls`).
- **WebUI protection:**
    - Strict **Content Security Policy (CSP)** to prevent XSS — see [CSP template](/en/security/04_csp-template/).
    - `frame-ancestors 'none'` and `X-Content-Type-Options` against clickjacking and MIME sniffing.

---

## 7. Data Security & Encryption
- **In transit:** All connections (WebUI → host, host → LLM provider) must be encrypted via TLS (HTTPS/WSS).
- **At rest:** Encryption of database volumes and file systems (infrastructure level).
- **Secret management:**
    - API keys are never stored in plain text in configuration files.
    - Use of secret references (`secret:NAME`) resolved from environment variables at runtime.
    - Masking of secrets in logs and UI previews.

---

## 8. Input Validation & API Security
- **Schema validation:** All API requests are checked against JSON schemas (`contracts/schemas/`).
- **Sanitizing:** Cleaning of AI-generated content (Markdown, HTML) before display in the WebUI.
- **Rate limiting:** Protection of API endpoints against brute force and DoS attacks.

---

## 9. Observability & Auditing
- **Audit logs:** Logging of all security-relevant actions (logins, MCP server starts, access to memory namespaces).
- **Metrics:** Monitoring of error rates and resource consumption via Prometheus.
- **Alerting:** Notification on suspicious activity (e.g. repeated failed logins, sandbox escape attempts).

---

## 10. Audit Checklist (review template)

| Area | Check | Status | Note |
| :--- | :--- | :--- | :--- |
| **AuthN** | Are passwords securely hashed? | [x] | bcrypt (cost 12) |
| **AuthN** | Are session tokens opaque, server-side revocable and expiring? | [x] | `app.sessions`, 7 days, `revoked` flag |
| **AuthZ** | Does RLS take effect correctly in the database? | [x] | Verified via rls_audit.sql |
| **Sandbox** | Do MCP servers really run as rootless Docker? | [x] | Enforced by orchestrator |
| **Sandbox** | Are resource limits (`cpu`, `mem`) enforced? | [x] | Configurable via config |
| **Network** | Is the CSP in the WebUI active and strict? | [x] | Via Fastify Helmet |
| **Network** | Does the egress allowlist work for MCP servers? | [x] | Enforced by orchestrator |
| **Secrets** | Are API keys masked/referenced in the DB/config? | [x] | SecretRef pattern active |
| **Input** | Are all API inputs validated against schemas? | [x] | Ajv integration active |
| **Audit** | Are MCP server starts recorded in the audit log? | [x] | Logging active in the host |
| **Skills** | Is path traversal blocked for skill file access? | [x] | `safeSkillPath()` in SkillService |
| **Skills** | Are skill scope permissions enforced server-side? | [x] | Via RLS + handler check |
| **Skills** | Does skill script execution run through cli-tools (Docker Rootless)? | [x] | cli-tools in own container |


---

## 11. Implementation Roadmap (critical weaknesses)

### 1. API hardening (`/runs` & authorization)
- [x] **Strict authentication for `/runs`:** Enforce `requireSession` in the `POST /runs` handler.
- [x] **Agent permission check:** Validate access protection for agents before the run starts.
- [x] **Rate limiting fix:** Ensure consistent rate limiting for all users.
- [x] **Authorized policy lookup:** Secure database lookups for memory policies.

### 2. WebUI & browser security
- [x] **Fastify Helmet integration:** Enable security headers (CSP, HSTS, etc.) via `@fastify/helmet`.
- [x] **Strict CSP:** Restrict `connect-src` to the necessary provider endpoints.
- [x] **Frame & clickjacking protection:** Set `X-Frame-Options` and `X-Content-Type-Options`.

### 3. Session & connection hardening
- [x] **Bearer tokens instead of cookies:** Authentication uses opaque session tokens sent via the `Authorization` header — no cookie flags to tune.
- [x] **CORS restriction:** Switched from `origin: true` to an explicit allowlist.
- [x] **CSRF protection:** Addressed structurally by the move to bearer tokens.

### 4. Database & multi-tenancy (Row Level Security)
- [x] **RLS framework:** Migration `V36` created and `withRls` helper implemented in the backend.
- [x] **Core entities (read/write):**
    - [x] **Chat system:** `GET /chats`, `GET /chats/:id`, `PATCH /chats/:chatId`, `DELETE /chats/:chatId` and automatic isolation of chat messages implemented via RLS.
    - [x] **Project management:** Full RLS protection for projects (`GET`, `POST`, `PATCH`, `DELETE`).
    - [x] **Agent management:** `GET /agents`, `POST /agents`, `PATCH /agents/:id`, `DELETE /agents/:id` use `withRls`. Visibilities (public/private) are enforced at DB level through policies.
- [x] **History & settings:**
    - [x] **Run logs:** Access to `/runs/:id` and `/runs/recent` secured via RLS. `requireSession` added for all run endpoints.
    - [x] **User settings:** Personal settings and profile data (`/auth/me`) protected via RLS.
- [x] **Extended resources:**
    - [x] **Chain protection:** RLS policies for `app.chains` and `app.chain_versions` implemented (`V37`) and all routes switched to `withRls`.
    - [x] **Task isolation:** `app.tasks` extended with `owner_id` and secured via RLS.
- [x] **Vector data & memory:**
    - [x] **RLS for the `vector` schema:** Namespace isolation at DB level implemented via `owner_id` and RLS policies. `MemoryAdapter` and API routes were switched to `withRls`.
- [x] **Completion & validation:**
    - [x] **Security audit:** Systematic test runs to verify tenant separation completed successfully (`scripts/rls_audit.sql`). Recursion errors in policies fixed.
    - [x] **RLS cleanup:** Redundant filters reviewed; RLS enforcement enabled via `FORCE ROW LEVEL SECURITY`.


### 5. Observability & auditing
- [x] **Security auditing:** Logging of unauthorized access attempts.
- [x] **Security monitoring & dashboard (minimal solution):**
    *   **Backend integration:** Done. `GET /memory/stats` returns aggregated security warnings.
    *   **Admin console:** Done. Monitoring widgets integrated into "Memory & Audit".
    *   **User info:** Done. Separation between admin status and user status preserved.
