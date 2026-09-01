-- V82: Allow one chat_messages row per agent turn
--
-- V52 declared "exactly one non-tool message per role per run" as a unique
-- index. Per-turn persistence (agent-turn-tracker.ts) writes one agent row
-- per completion turn of the main agent, and every turn after the first was
-- rejected by that index with a duplicate-key error — the run's final answer
-- silently never reached the database.
--
-- Turn uniqueness is guaranteed by the writer, not the database: each turn
-- holds one rowRef whose id is filled by exactly one INSERT; later writes to
-- the same turn are UPDATEs by id. The tool-side unique index from V52
-- (per tool_call_id) is unaffected.

BEGIN;

DROP INDEX IF EXISTS app.chat_messages_unique_run_role_non_tool;

COMMIT;