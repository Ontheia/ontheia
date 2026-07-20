# Metriken (`/metrics`)

Der Host stellt unter `GET /metrics` auf dem API-Port (Standard `8080`) Prometheus-Metriken bereit. Der Endpunkt liefert das übliche Text-Expositionsformat und kann direkt gescrapt werden.

> **Der Endpunkt verlangt keine Authentifizierung.** Die Labels enthalten Agenten- und Task-IDs, die Node.js-Standardmetriken geben Details über den Prozess preis. `/metrics` sollte daher nicht öffentlich erreichbar sein — im Reverse Proxy auf das Monitoring-Netz beschränken. Siehe [Reverse Proxy](/de/configuration/04_reverse_proxy/).

## Ontheia-Metriken

| Metrik | Typ | Labels | Bedeutung |
| :--- | :--- | :--- | :--- |
| `mcp_runs_total` | Counter | `agent_id`, `task_id`, `status` | Anzahl der Agenten-Runs nach Status |
| `mcp_run_latency_seconds` | Histogram | `agent_id`, `task_id` | Dauer eines Agenten-Runs |
| `mcp_chain_runs_total` | Counter | `chain_id`, `chain_version_id`, `status` | Anzahl der Chain-Runs nach Status |
| `mcp_chain_run_latency_seconds` | Histogram | `chain_id`, `chain_version_id` | Dauer eines Chain-Runs |
| `mcp_memory_hits_total` | Counter | `agent_id`, `task_id` | In den Kontext gelieferte Memory-Treffer |
| `mcp_memory_write_total` | Counter | `agent_id`, `task_id`, `items` | Geschriebene Memory-Einträge |
| `mcp_memory_warning_total` | Counter | `code` | Memory-Warnungen nach Warncode |

Beide Histogramme verwenden die Buckets `0,5, 1, 2, 5, 10, 30, 60` Sekunden.

Zusätzlich sammelt `prom-client` die Node.js-Standardmetriken (`process_*`, `nodejs_*`) — Event-Loop-Verzögerung, Heap-Auslastung, offene Handles.

## Beispiel-Scrape-Konfiguration

```yaml
scrape_configs:
  - job_name: ontheia
    static_configs:
      - targets: ['ontheia-host:8080']
```

## Hinweise

- Counter beginnen bei `0` und erscheinen erst, wenn der erste Run erfasst wurde — eine leere Antwort direkt nach einem Neustart ist normal.
- `status` trennt erfolgreiche von fehlgeschlagenen Runs; die Fehlerrate ist damit der naheliegendste erste Alarm: `rate(mcp_runs_total{status!="success"}[5m])`.
- Die Metriken liegen im Prozess. Ein Neustart setzt sie zurück — mit `increase()`/`rate()` arbeiten, nicht mit rohen Counter-Werten.
