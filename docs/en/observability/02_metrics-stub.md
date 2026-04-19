# /metrics Stub (Prometheus)

```
# HELP mcp_runs_total Gesamtzahl der Agenten-Runs nach Status
# TYPE mcp_runs_total counter
mcp_runs_total{agent_id="agent-mail",task_id="task-mail-customers",status="success"} 0

# HELP mcp_run_latency_seconds Dauer eines Runs
# TYPE mcp_run_latency_seconds histogram
mcp_run_latency_seconds_bucket{le="0.5"} 0
mcp_run_latency_seconds_bucket{le="1"} 0
mcp_run_latency_seconds_bucket{le="2"} 0
mcp_run_latency_seconds_bucket{le="5"} 0
mcp_run_latency_seconds_bucket{le="10"} 0
mcp_run_latency_seconds_bucket{le="+Inf"} 0
mcp_run_latency_seconds_sum 0
mcp_run_latency_seconds_count 0

# HELP mcp_tool_calls_total Anzahl der Tool-Aufrufe nach Tool und Status
# TYPE mcp_tool_calls_total counter
mcp_tool_calls_total{tool="time",status="success"} 0
mcp_tool_calls_total{tool="echo",status="success"} 0
```
