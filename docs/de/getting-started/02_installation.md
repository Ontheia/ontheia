---
title: Installation
description: Ontheia mit Docker auf Ihrem Server installieren.
---

import { Steps } from '@astrojs/starlight/components';

Ontheia wird als Docker-Stack betrieben. Voraussetzung ist ein Linux-Server mit Docker und Docker Compose.

## Voraussetzungen

- Docker ≥ 24
- Docker Compose ≥ 2.20
- PostgreSQL (wird im Stack mitgeliefert)
- 2 GB RAM Minimum, 4 GB empfohlen

## Schnellstart

<Steps>

1. **Repository klonen**

   ```bash
   git clone https://github.com/Ontheia/ontheia.git
   cd ontheia
   ```

2. **Konfiguration anlegen**

   ```bash
   cp .env.example .env
   ```

3. **Stack starten**

   ```bash
   docker compose up -d
   ```

4. **Ontheia aufrufen**

   Öffnen Sie `http://localhost:5173` in Ihrem Browser.

</Steps>
