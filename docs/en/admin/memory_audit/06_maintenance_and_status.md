# System Status & Maintenance

For performant and secure operation, Ontheia provides various status indicators and maintenance functions, summarized in the **Dashboard** tab of the "Memory & Audit" section.

## 1. Monitoring Dashboard

The dashboard shows the current state of health in two rows of metric cards.

### Row 1 – Overview
| Card | Description |
| --- | --- |
| **Security (24h)** | Number of blocked accesses / RLS violations. A value > 0 indicates that an agent or user has attempted to access data outside of their permissions. |
| **Vector Storage** | Total number of active documents across all tables. |
| **Maintenance** | Time of the last VACUUM / ANALYZE action. |

### Row 2 – Database Metrics
These cards are only shown when a database connection is available:

| Card | Description |
| --- | --- |
| **Tables / Indexes** | Number of vector tables and indexes as well as live and dead tuple counters. |
| **Data Volume** | Total size of the vector store and name of the largest table. |
| **Health** | Proportion of dead tuples. Green = unremarkable, Amber = >20% dead ratio (VACUUM recommended). |

### Hints
Below the metric cards, a hints box appears with recommended actions:
- Dead ratio > 20%? → Schedule VACUUM/REINDEX
- Index scans = 0? → Check utilization after re-indexing
- Autovacuum/Analyze counters show whether automatic maintenance is running
- Size information is sourced from `pg_stat_all_tables` / `-indexes`

## 2. Database Maintenance

The maintenance buttons are located in the Dashboard below the hints box:

- **VACUUM / ANALYZE:** Physically cleans up deleted entries ("dead tuples") and updates the statistics for the query optimizer. This is important for keeping search speeds high.
- **REINDEX:** Rebuilds the vector indices (HNSW). Recommended if the data distribution has changed massively or if the search accuracy declines.
- **Refresh:** Reloads the database metrics.

### Postgres Tables and Indexes
The lower section of the dashboard displays detailed tables:

**Postgres Tables** shows per table: name, total size, live/dead tuples, dead %, seq scans, idx scans, I/U/D counters, and the time and frequency of autovacuum/autoanalyze.

**Indexes** shows per index: name, associated table, scan count (Amber = 0 scans = possibly unused), tuples read/fetched, and size.

### Technical Details
- **Permissions:** Maintenance tasks require the application user (`ontheia_app`) to be the owner of the vector tables or to have corresponding privileges.
- **Transaction Isolation:** Maintenance commands such as `VACUUM` are executed outside of standard transaction blocks to circumvent PostgreSQL limitations.
- **Timestamp:** Successful completion is logged with a local timestamp (based on the system time zone).

## 3. Re-Embedding (Experimental)

> **⚠ Experimental:** This feature is not yet fully implemented. The underlying worker (`reembed_worker`) does not currently perform actual re-embedding — jobs are marked as completed without recalculating any vectors. Do not use in production.

The endpoint `POST /memory/reembed` is intended to re-embed existing documents using a different or updated embedding model. Use cases include:

- Switching embedding providers (e.g. from OpenAI to Ollama)
- Back-filling documents with a fallback provider
- Refreshing vectors after a model change

**Current status:** The worker is implemented as a stub (`setTimeout` 50 ms). Full implementation is planned for a future release (V60 migration + dual-write logic). Until then, triggering a re-embedding job has no effect on stored vectors.

### Job Table (`app.reembed_jobs`)

| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid PK | Unique job ID |
| `namespace` | text | Target namespace |
| `embedding_model` | text | Model to use |
| `chunk_id` | uuid | Affected chunk |
| `status` | text | `pending`, `running`, `completed`, `failed` |
| `attempts` | int | Number of attempts (default: 0) |
| `payload` | jsonb | Optional additional data |

### CLI

```bash
cd host && npm run memory:reembed -- --namespace vector.project.foo.docs
```

| Flag | Default | Description |
| --- | --- | --- |
| `--namespace` / `-n` | – | Namespace to schedule (required) |
| `--model` / `-m` | `text-embedding-3-small` | Embedding model |
| `--limit` / `-l` | 25 | Number of jobs per run |
| `--dry-run` | – | Shows pending jobs without changing status |
| `--schedule-only` | – | Creates jobs but does not process them |

**Check job status:**
```sql
SELECT status, count(*) FROM app.reembed_jobs GROUP BY status;
```

## 4. Technical Maintenance Checklist

The following checks should be performed monthly or after major import operations.

### 4.1 Index Health

```sql
SELECT relname AS index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       idx_scan,
       idx_tup_read,
       idx_tup_fetch
  FROM pg_stat_all_indexes
 WHERE schemaname = 'vector'
   AND relname LIKE 'vector_documents%';
```

- `idx_scan = 0` → Index possibly unused, run `ANALYZE vector.documents`.
- `idx_tup_fetch / idx_tup_read` significantly diverging → check reindex.

### 4.2 VACUUM/ANALYZE (Manual)

```sql
VACUUM (VERBOSE, ANALYZE) vector.documents;
VACUUM (VERBOSE, ANALYZE) vector.documents_768;
```

Can be automated via cron or pgAgent.

### 4.3 Check IVFFlat Probes

```sql
SELECT current_setting('ivfflat.probes') AS default_probes;
```

Increase probes if search accuracy declines (`SET ivfflat.probes = 15`).

### 4.4 Re-Embed After Model Change

```bash
npm run memory:reembed -- --namespace vector.project.example.docs --model text-embedding-3-large
```

Afterwards, verify via the **Audit Log** tab (filterable by agent/task).

## 5. RLS Enforcement
The system uses **FORCE Row Level Security**. This means that the isolation of user data takes effect even if the application user has administrative privileges. Exceptions are only explicitly shared namespaces (such as `vector.global.*`), to which all authorized system users have shared access.
