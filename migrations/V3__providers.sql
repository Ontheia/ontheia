-- Provider & Modell-Tabellen
BEGIN;

CREATE TABLE IF NOT EXISTS app.providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    label text NOT NULL,
    base_url text,
    auth_mode text NOT NULL DEFAULT 'bearer' CHECK (auth_mode IN ('bearer', 'header', 'query', 'none')),
    api_key_ref text,
    header_name text,
    query_name text,
    test_path text,
    test_method text NOT NULL DEFAULT 'GET' CHECK (test_method IN ('GET', 'POST')),
    test_model_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_status text CHECK (last_status IN ('unknown', 'ok', 'error')),
    last_checked_at timestamptz,
    last_message text,
    last_duration_ms integer,
    last_url text,
    last_preview text,
    warnings text[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.provider_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES app.providers(id) ON DELETE CASCADE,
    model_key text NOT NULL,
    label text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, model_key)
);

CREATE INDEX IF NOT EXISTS provider_models_provider_idx ON app.provider_models (provider_id);

COMMIT;
