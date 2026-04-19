-- Strikte Privatsphäre für Chats: Admin-Zugriff entfernen
-- Auch Admins dürfen nicht mehr in die privaten Chatverläufe der Benutzer schauen.
-- Die Ausnahme "Admin darf Memory verwalten" (via allow_admin_memory Flag) bleibt unberührt,
-- da diese auf der vector.documents Tabelle geregelt ist.

BEGIN;

-- 1. CHATS: Nur der Besitzer darf zugreifen
DROP POLICY IF EXISTS chats_isolation_policy ON app.chats;
CREATE POLICY chats_strict_privacy_policy ON app.chats
  USING (user_id = app.current_user_id());

-- 2. CHAT_MESSAGES: Nur wenn man Zugriff auf den Chat hat
DROP POLICY IF EXISTS chat_messages_isolation_policy ON app.chat_messages;
CREATE POLICY chat_messages_strict_privacy_policy ON app.chat_messages
  USING (
    EXISTS (SELECT 1 FROM app.chats c WHERE c.id = app.chat_messages.chat_id AND c.user_id = app.current_user_id())
  );

-- 3. RUN_LOGS: Nur der Besitzer darf zugreifen
DROP POLICY IF EXISTS run_logs_isolation_policy ON app.run_logs;
CREATE POLICY run_logs_strict_privacy_policy ON app.run_logs
  USING (user_id = app.current_user_id());

COMMIT;
