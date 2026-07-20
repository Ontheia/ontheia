# Metrics (`/metrics`)

The host exposes Prometheus metrics at `GET /metrics` on the API port (default `8080`). The endpoint returns the standard text exposition format and can be scraped directly.

> **The endpoint requires no authentication.** The labels contain agent and task IDs, and the Node.js default metrics reveal details about the process. Do not expose `/metrics` publicly — restrict it in the reverse proxy to your monitoring network. See [Reverse Proxy](/en/configuration/04_reverse_proxy/).

## Ontheia metrics

| Metric | Type | Labels | Meaning |
| :--- | :--- | :--- | :--- |
| `mcp_runs_total` | Counter | `agent_id`, `task_id`, `status` | Number of agent runs by status |
| `mcp_run_latency_seconds` | Histogram | `agent_id`, `task_id` | Duration of an agent run |
| `mcp_chain_runs_total` | Counter | `chain_id`, `chain_version_id`, `status` | Number of chain runs by status |
| `mcp_chain_run_latency_seconds` | Histogram | `chain_id`, `chain_version_id` | Duration of a chain run |
| `mcp_memory_hits_total` | Counter | `agent_id`, `task_id` | Memory hits delivered into the context |
| `mcp_memory_write_total` | Counter | `agent_id`, `task_id`, `items` | Memory entries written |
| `mcp_memory_warning_total` | Counter | `code` | Memory warnings by warning code |

Both histograms use the buckets `0.5, 1, 2, 5, 10, 30, 60` seconds.

In addition, `prom-client` collects the Node.js default metrics (`process_*`, `nodejs_*`) — event loop lag, heap usage, open handles.

## Example scrape config

```yaml
scrape_configs:
  - job_name: ontheia
    static_configs:
      - targets: ['ontheia-host:8080']
```

## Notes

- Counters start at `0` and only appear once the first run has been recorded — an empty response after a restart is expected.
- `status` distinguishes successful from failed runs, which makes an error rate the natural first alert: `rate(mcp_runs_total{status!="success"}[5m])`.
- Metrics live in the process. A restart resets them; use `increase()`/`rate()` rather than raw counter values.
