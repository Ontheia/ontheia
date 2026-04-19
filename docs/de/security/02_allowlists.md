# Allowlist-Regeln

## Pakete
- Listen unter `config/allowlist.packages.{npm,pypi,bun}` unterstützen Wildcards (`@scope/*`).
- Einträge begin­nen alle neuen Zeilen; `#` dient als Kommentar.
- Validierung bricht ab, wenn Paket nicht mit einem Eintrag matcht.

## Docker-Images
- `config/allowlist.images` akzeptiert exakte Namen oder Prefix-Wildcards (`ghcr.io/org/*`).
- Images müssen der Allowlist entsprechen, sonst schlägt `/servers/validate` fehl.

## Sicherheitshinweise
- Nutze knappe, präzise Muster (z. B. `ghcr.io/org/service@sha256:...`) für Production.
- Ergänze neue Serverpakete/Images gezielt in den Allowlist-Dateien (PR + Review).
- Kommentare (`# Hinweis ...`) helfen, freigegebene Pakete zu dokumentieren.
