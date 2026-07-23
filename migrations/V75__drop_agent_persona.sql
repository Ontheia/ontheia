-- Agents: drop the persona column
--
-- An agent's system prompt lives in its task's context_prompt — that is what
-- the UI edits and what every run actually uses. app.agents.persona was a
-- second source, written only by bootstrap and read only as a fallback that
-- the task overrode immediately. No route and no webui component ever touched
-- it, so it could not be inspected or corrected: it just went stale while
-- looking authoritative (personas still named agent labels retired long ago).
--
-- The fallback is removed in code (RunService, chain-runner); an agent without
-- a task context now gets a neutral default instead of an invisible prompt.

BEGIN;

ALTER TABLE app.agents DROP COLUMN persona;

COMMIT;
