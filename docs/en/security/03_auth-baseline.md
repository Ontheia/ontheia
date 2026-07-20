# Authentication Baseline

Current state of authentication. For the wider picture see the [security concept](/en/security/01_security_concept/).

- **Password hashing:** bcrypt (`bcryptjs`), cost factor 12. Minimum length 8 characters.
- **Sessions:** Opaque UUID tokens in `app.sessions`, sent as `Authorization: Bearer <token>`. No cookies, no JWT.
- **Session lifetime:** 7 days. Server-side revocation via the `revoked` flag; `POST /auth/logout` revokes the current session.
- **CSRF:** Structurally not applicable, since no credential is sent automatically by the browser.
- **Password change:** `POST /auth/change-password` — requires the current password.
- **Password reset:** There is **no** self-service flow for forgotten passwords. An administrator has to recreate the account or replace the password directly in the database.
- **Roles:** `admin`, `user` — see [RBAC](/en/security/05_rbac/).
- **Account status:** `pending` (awaiting admin approval), `active`, blocked. Login is only possible while `active`.
- **Multi-factor authentication (MFA):** not implemented (phase 2).
