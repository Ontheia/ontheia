-- V62: Rolling Summary — persist compressed chat context in app.chats.
-- rolling_summary: structured summary text (max 8000 chars).
-- rolling_summary_covers_until: count of messages covered by the summary (stored as text);
--   messages after this count are passed as plaintext to the LLM.
ALTER TABLE app.chats
  ADD COLUMN IF NOT EXISTS rolling_summary text,
  ADD COLUMN IF NOT EXISTS rolling_summary_covers_until text;
