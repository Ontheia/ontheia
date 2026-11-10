BEGIN;

-- Posteingang: Sammelstelle für alles, was ein Hintergrundlauf (Zeitplaner,
-- später Webhook-Trigger) dem Benutzer vorlegen muss — eine offene
-- Tool-Freigabe, ein Ergebnis, ein Fehler. Läufe aus dem Chat schreiben hier
-- nichts; dort sitzt der Benutzer davor.
--
-- chat_id ist bewusst ohne Fremdschlüssel: ein Freigabe-Eintrag kann entstehen,
-- bevor der Chat des Laufs gespeichert ist. Ob der Chat noch existiert, prüft
-- die Abfrage beim Lesen.
CREATE TABLE IF NOT EXISTS app.inbox_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('approval', 'result', 'error')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'expired')),
    run_id text,
    chat_id text,
    trigger_type text,
    trigger_id uuid,
    title text NOT NULL,
    summary text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    resolution text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS inbox_items_user_status_idx
    ON app.inbox_items (user_id, status, created_at DESC);

ALTER TABLE app.inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_items_user_policy ON app.inbox_items;
CREATE POLICY inbox_items_user_policy ON app.inbox_items
    FOR ALL
    TO ontheia_app
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Der Host räumt beim Start abgelaufene Freigaben aller Benutzer auf; dafür
-- läuft er mit der Systemrolle. Die Routen filtern immer auf den eigenen
-- Benutzer, auch für Admins.
DROP POLICY IF EXISTS inbox_items_admin_policy ON app.inbox_items;
CREATE POLICY inbox_items_admin_policy ON app.inbox_items
    FOR ALL
    TO ontheia_app
    USING (current_setting('app.user_role', true) = 'admin');

COMMIT;
