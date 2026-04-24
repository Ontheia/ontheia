---
title: Installation
description: Install Ontheia with Docker on your server.
---

Ontheia runs as a Docker stack. Prerequisites are a Linux server with Docker and Docker Compose.

## Requirements

- Docker ≥ 24
- Docker Compose ≥ 2.20
- PostgreSQL (included in the stack)
- 2 GB RAM minimum, 4 GB recommended

## Quick start

1. **Clone the repository**

   ```bash
   git clone https://github.com/Ontheia/ontheia.git
   cd ontheia
   ```

2. **Create configuration**

   ```bash
   cp .env.example .env
   ```

3. **Start the stack**

   ```bash
   docker compose up -d
   ```

4. **Open Ontheia**

   Visit `http://localhost:5173` in your browser.
