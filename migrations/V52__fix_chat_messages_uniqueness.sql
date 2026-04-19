-- V52: Fix Chat Message Uniqueness
-- Allow separate entries for user and agent messages within the same run.
-- Also allow multiple tool responses per run, identified by tool_call_id.

BEGIN;

-- 1. Drop the original overly restrictive constraint from V51
ALTER TABLE app.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_unique_agent_run;

-- 2. Drop intermediate attempts if they exist
DROP INDEX IF EXISTS app.chat_messages_unique_run_role;

-- 3. Create improved uniqueness logic
-- For user/agent messages: exactly one per role per run
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_unique_run_role_non_tool 
    ON app.chat_messages (chat_id, run_id, role) 
    WHERE (role != 'tool');

-- For tool messages: unique per tool_call_id within a run
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_unique_run_tool_call 
    ON app.chat_messages (chat_id, run_id, role, (metadata->>'tool_call_id')) 
    WHERE (role = 'tool');

COMMIT;
