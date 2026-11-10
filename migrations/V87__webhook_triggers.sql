BEGIN;

-- Webhook-Trigger: ein eingehender POST auf /hooks/<id> startet einen Agenten
-- oder eine Chain im Hintergrund. Der Lauf gehört dem Besitzer des Triggers und
-- läuft mit dessen Rolle und Rechten.
--
-- Vom Token wird nur der SHA-256-Hash gespeichert. Es wird beim Anlegen einmal
-- angezeigt und lässt sich danach nur neu erzeugen, nicht wieder auslesen.
CREATE TABLE IF NOT EXISTS app.triggers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    token_hash text NOT NULL,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    task_id uuid REFERENCES app.tasks(id) ON DELETE SET NULL,
    chain_id uuid REFERENCES app.chains(id) ON DELETE SET NULL,
    prompt_template text NOT NULL DEFAULT '',
    -- 'inbox': Tool-Aufrufe warten im Posteingang auf Antwort (Standard, weil
    -- der Inhalt des Aufrufs von außen kommt). 'granted': alles erlaubt.
    -- 'denied': keine Tools.
    approval_mode text NOT NULL DEFAULT 'inbox'
        CHECK (approval_mode IN ('inbox', 'granted', 'denied')),
    inbox_result text NOT NULL DEFAULT 'always'
        CHECK (inbox_result IN ('always', 'errors', 'never')),
    chat_id text REFERENCES app.chats(id) ON DELETE SET NULL,
    chat_title_template text NOT NULL DEFAULT 'Trigger: {{name}} [{{timestamp}}]',
    rate_limit_per_min smallint NOT NULL DEFAULT 10
        CHECK (rate_limit_per_min BETWEEN 1 AND 600),
    prevent_overlap boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    last_triggered_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS triggers_user_idx ON app.triggers (user_id);

ALTER TABLE app.triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triggers_user_policy ON app.triggers;
CREATE POLICY triggers_user_policy ON app.triggers
    FOR ALL
    TO ontheia_app
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Der Webhook-Eingang kennt beim Eintreffen keinen Benutzer und liest den
-- Trigger deshalb mit der Systemrolle.
DROP POLICY IF EXISTS triggers_admin_policy ON app.triggers;
CREATE POLICY triggers_admin_policy ON app.triggers
    FOR ALL
    TO ontheia_app
    USING (current_setting('app.user_role', true) = 'admin');

-- Protokoll der angenommenen Aufrufe — für die Frage "warum ist nichts
-- passiert?". Aufrufe mit falschem Token bekommen keine Zeile, sonst könnte
-- jeder Fremde die Tabelle füllen.
CREATE TABLE IF NOT EXISTS app.trigger_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_id uuid NOT NULL REFERENCES app.triggers(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    received_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL
        CHECK (status IN ('started', 'success', 'error', 'rate_limited', 'overlap_skipped', 'busy')),
    source text NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook', 'test')),
    run_id text,
    chat_id text,
    payload jsonb,
    error text
);

CREATE INDEX IF NOT EXISTS trigger_events_trigger_idx
    ON app.trigger_events (trigger_id, received_at DESC);

ALTER TABLE app.trigger_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trigger_events_user_policy ON app.trigger_events;
CREATE POLICY trigger_events_user_policy ON app.trigger_events
    FOR ALL
    TO ontheia_app
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS trigger_events_admin_policy ON app.trigger_events;
CREATE POLICY trigger_events_admin_policy ON app.trigger_events
    FOR ALL
    TO ontheia_app
    USING (current_setting('app.user_role', true) = 'admin');

-- Globaler Schalter. Aus heißt: /hooks/* antwortet mit 404.
INSERT INTO app.system_settings (key, value, description)
VALUES (
    'triggers_enabled',
    'true'::jsonb,
    'Webhook-Trigger annehmen. Aus = der Eingang /hooks/<id> antwortet mit 404.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
