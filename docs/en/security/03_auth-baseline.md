# Authentications-Basis (Vorbereitung)

- Lokaler Admin-Login mit Passwort (PBKDF2/Argon2)
- Sitzungen: HTTP-only, Secure Cookies, SameSite=Lax
- CSRF-Schutz: Double Submit Token oder SameSite + Anti-CSRF Header
- Passwort-Reset (später) via CLI oder Admin-Endpoint
- Multi-User/Rollen: Admin, User (weitere projektbezogene Rollen später)
- Session-Timeout: 12h (konfigurierbar)
