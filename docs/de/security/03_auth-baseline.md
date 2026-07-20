# Authentifizierungs-Basis

Ist-Zustand der Authentifizierung. Für die Einordnung ins Gesamtbild siehe [Sicherheitskonzept](/de/security/01_security_concept/).

- **Passwort-Hashing:** bcrypt (`bcryptjs`), Kostenfaktor 12. Mindestlänge 8 Zeichen.
- **Sitzungen:** Opake UUID-Tokens in `app.sessions`, gesendet als `Authorization: Bearer <token>`. Keine Cookies, kein JWT.
- **Session-Lebensdauer:** 7 Tage. Serverseitiger Widerruf über das `revoked`-Flag; `POST /auth/logout` widerruft die aktuelle Sitzung.
- **CSRF:** Strukturell nicht anwendbar, da kein Credential automatisch vom Browser mitgesendet wird.
- **Passwortwechsel:** `POST /auth/change-password` — verlangt das aktuelle Passwort.
- **Passwort-Reset:** Es gibt **keinen** Self-Service-Flow für vergessene Passwörter. Ein Administrator muss den Account neu anlegen oder das Passwort direkt in der Datenbank ersetzen.
- **Rollen:** `admin`, `user` — siehe [RBAC](/de/security/05_rbac/).
- **Account-Status:** `pending` (wartet auf Admin-Freigabe), `active`, gesperrt. Ein Login ist nur bei `active` möglich.
- **Multi-Faktor-Authentifizierung (MFA):** nicht implementiert (Phase 2).
