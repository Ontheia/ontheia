# Contributing to Ontheia

Thank you for your interest in contributing. This document covers how to set up a development environment, coding conventions, and the pull request process.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [License](#license)

---

## Getting Started

1. Fork the repository and clone your fork.
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. Make your changes, test them, and open a pull request.

Please **open an issue first** before starting work on large features or architectural changes. This avoids wasted effort if the direction doesn't align with the project roadmap.

---

## Development Setup

### Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ and npm
- PostgreSQL client tools (optional, for direct DB access)
- pre-commit (`pip install pre-commit`)

### Install pre-commit hooks

```bash
pre-commit install
```

The hooks run Prettier (formatting), gitleaks (secret scanning), and basic file checks on every commit.

### Backend (`host/`)

```bash
cd host
npm install
npm run dev        # starts ts-node-dev with hot reload
npm run lint       # ESLint
npm run test       # build + run Node test runner
```

### Frontend (`webui/`)

```bash
cd webui
npm install
npm run dev        # starts Vite dev server
npm run lint       # ESLint
npm run build      # production build
```

### Database

Database migrations are managed by Flyway. Migration files live in `migrations/` and follow the naming convention `V{number}__{description}.sql`.

To apply migrations locally:
```bash
docker compose up -d db
docker compose run --rm migrator
```

---

## Code Style

- **Formatter:** Prettier (enforced via pre-commit hook). Configuration is in the root `.prettierrc` if present, otherwise Prettier defaults apply.
- **Indentation:** 2 spaces — all file types (enforced by `.editorconfig`).
- **Line endings:** LF.
- **TypeScript:** Strict mode. No `any` without a comment explaining why.
- **SQL:** Migration files must be idempotent where possible. Use `IF NOT EXISTS` / `IF EXISTS` guards.

---

## Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

Examples:
```
feat(agents): add visibility filter for admin users
fix(memory): resolve circular RLS dependency in agent_permissions
docs(readme): add requirements table
```

---

## Pull Request Process

1. Ensure `npm run lint` passes in both `host/` and `webui/`.
2. Ensure `npm run test` passes in `host/`.
3. Keep PRs focused — one concern per PR.
4. Update documentation in `docs/` if your change affects user-facing behavior.
5. Add a migration file if your change requires a schema change (`migrations/V{next}__{description}.sql`).
6. Request a review. PRs are merged by a maintainer once approved.

---

## Reporting Issues

Use [GitHub Issues](https://github.com/Ontheia/ontheia/issues).

When reporting a bug, please include:
- Ontheia version (or commit hash)
- OS and Docker version
- Steps to reproduce
- Expected vs. actual behavior
- Relevant log output (`docker compose logs`)

---

## Contributor License Agreement (CLA)

Ontheia is dual-licensed (AGPL-3.0 + commercial). To allow this, **all contributors must sign the Ontheia CLA before their pull request can be merged.**

The CLA is a short, one-page document. It means: you keep your copyright, but grant Ontheia the right to also distribute your contribution under a commercial license.

> A CLA Assistant bot will automatically comment on your pull request with a link to sign the CLA. Merge is blocked until signing is complete.

Read the full CLA: [CLA.md](./CLA.md) — questions: [ontheia.ai/contact](https://ontheia.ai/en/#contact)

---

## License

By contributing, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0](./LICENSE) and subject to the Ontheia CLA described above.
