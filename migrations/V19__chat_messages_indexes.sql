-- Add indexes to speed up chat message lookups and search

-- Ordered fetch per chat
CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx
  ON app.chat_messages (chat_id, created_at);

-- Filter by role within a chat (e.g., tool/user/agent)
CREATE INDEX IF NOT EXISTS chat_messages_chat_role_created_idx
  ON app.chat_messages (chat_id, role, created_at);

-- Fulltext over content (simple)
CREATE INDEX IF NOT EXISTS chat_messages_content_fts_idx
  ON app.chat_messages
  USING GIN (to_tsvector('simple', content));

-- Metadata GIN for flexible filters (provider_id, model_id, agent_id, task_id, chain_id, tool info)
CREATE INDEX IF NOT EXISTS chat_messages_metadata_idx
  ON app.chat_messages
  USING GIN (metadata);
