BEGIN;

-- Falls bereits Daten existieren, konvertiere UUID -> text
ALTER TABLE app.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_chat_id_fkey;

ALTER TABLE app.chats
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE app.chat_messages
  ALTER COLUMN chat_id TYPE text USING chat_id::text;

ALTER TABLE app.chats
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE app.chat_messages
  ADD CONSTRAINT chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES app.chats(id) ON DELETE CASCADE;

-- Indexe ggf. neu
DROP INDEX IF EXISTS chat_messages_chat_created_idx;
CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx ON app.chat_messages(chat_id, created_at);

COMMIT;
