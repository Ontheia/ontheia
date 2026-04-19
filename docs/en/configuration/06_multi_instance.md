---
title: Multiple Organizations (Multi-Instance)
description: How to run multiple organizations or tenants on one infrastructure
---

# Running Multiple Organizations

Ontheia supports multiple users and roles within a single instance. For operating **multiple independent organizations**, however, we recommend dedicated instances — one per organization.

## Recommended Approach: Separate Instances

Each organization gets its own Ontheia installation:

```
Server
├── ontheia-company-a/   → Port 8081, Domain: ai.company-a.com
├── ontheia-company-b/   → Port 8082, Domain: ai.company-b.com
└── ontheia-company-c/   → Port 8083, Domain: ai.company-c.com
```

Each instance runs in its own Docker Compose stack with its own database, its own secrets, and its own `.env` configuration.

## Advantages Over a Shared System

| Aspect | Separate Instances |
|---|---|
| **Data isolation** | Complete separation at infrastructure level — no shared DB tables |
| **Security** | A fault or breach in instance A cannot affect instance B |
| **Updates** | Each organization can be updated independently |
| **Configuration** | Own MCP servers, own providers, own time zone per organization |
| **Simplicity** | No additional organization layer required in the code |

## Setup

1. Clone the repository into a new directory:
   ```bash
   git clone https://github.com/Ontheia/ontheia.git ontheia-company-a
   cd ontheia-company-a
   ```

2. Run the install script:
   ```bash
   bash scripts/install.sh
   ```

3. Adjust the ports in `.env` to avoid conflicts between instances:
   ```bash
   HOST_PORT=8081
   WEBUI_PORT=5174
   ```

4. Set up a reverse proxy so each instance is reachable under its own domain → see [Reverse Proxy](./04_reverse_proxy.md).

## Resources

Each instance requires its own PostgreSQL database and at least 2 GB of RAM. On a server with 16 GB RAM, 4–6 instances can easily run in parallel.
