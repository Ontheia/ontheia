/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import { Pool } from 'pg';
import { loadConfig } from '../config.js';
import {
  claimReembedJobs,
  enqueueReembedJobs,
  markReembedJobCompleted,
  markReembedJobFailed,
  peekReembedJobs
} from '../memory/reembed.js';

type CLIOptions = {
  namespace?: string;
  model?: string;
  limit: number;
  dryRun: boolean;
  scheduleOnly: boolean;
};

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {
    limit: 25,
    dryRun: false,
    scheduleOnly: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--namespace' || arg === '-n') {
      options.namespace = argv[++i];
    } else if (arg === '--model' || arg === '-m') {
      options.model = argv[++i];
    } else if (arg === '--limit' || arg === '-l') {
      const value = Number.parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--schedule-only') {
      options.scheduleOnly = true;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const namespace = options.namespace;
  const embeddingModel = options.model ?? 'text-embedding-3-small';

  try {
    if (namespace) {
      const inserted = await enqueueReembedJobs(pool, {
        namespace,
        embeddingModel
      });
      console.log(`Re-embed jobs scheduled (${inserted}) for ${namespace}`);
      if (options.scheduleOnly) {
        return;
      }
    }

    if (options.dryRun) {
      const jobs = await peekReembedJobs(pool, options.limit);
      console.table(
        jobs.map((job) => ({
          id: job.id,
          namespace: job.namespace,
          model: job.embeddingModel,
          status: job.status,
          attempts: job.attempts
        }))
      );
      return;
    }

    const jobs = await claimReembedJobs(pool, options.limit);
    if (jobs.length === 0) {
      console.log('No re-embed jobs found.');
      return;
    }

    console.log(`Starting processing of ${jobs.length} jobs...`);
    for (const job of jobs) {
      console.log(`[${job.id}] Namespace=${job.namespace} Model=${job.embeddingModel}`);
      try {
        // TODO: As soon as EmbeddingProvider / MemoryAdapter are available,
        //       read old embedding here, write new embedding.
        await new Promise((resolve) => setTimeout(resolve, 50));
        await markReembedJobCompleted(pool, job.id);
        console.log(`✓ Job ${job.id} completed`);
      } catch (error) {
        console.error(`✗ Job ${job.id} failed`, error);
        await markReembedJobFailed(pool, job.id, error instanceof Error ? error : String(error));
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Re-Embed worker error:', error);
  process.exitCode = 1;
});
