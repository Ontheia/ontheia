# Allowlist Rules

## Packages
- Lists under `config/allowlist.packages.{npm,pypi,bun}` support wildcards (`@scope/*`).
- Each entry starts on a new line; `#` serves as a comment.
- Validation fails if a package does not match an entry.

## Docker Images
- `config/allowlist.images` accepts exact names or prefix wildcards (`ghcr.io/org/*`).
- Images must match the allowlist, otherwise `/servers/validate` will fail.

## Security Notes
- Use short, precise patterns (e.g., `ghcr.io/org/service@sha256:...`) for production.
- Add new server packages/images specifically to the allowlist files (PR + Review).
- Comments (`# Note ...`) help document approved packages.
