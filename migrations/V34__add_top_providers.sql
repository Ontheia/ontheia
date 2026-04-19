-- V34: Add and configure top providers (Google Gemini, xAI, OpenAI)
-- Consolidated migration replacing previous V34, V35, V36 attempts.

-- 1. Google Gemini (via OpenAI Compatibility)
INSERT INTO app.providers (slug, label, base_url, api_key_ref, auth_mode, test_path, test_method, metadata)
VALUES (
    'google', 
    'Google', 
    'https://generativelanguage.googleapis.com/v1beta/openai/', 
    'GOOGLE_API_KEY', -- User must set this environment variable or update via UI
    'bearer',
    '/chat/completions', -- Direct path for Google (OpenAI compat)
    'POST',
    '{"chat_path": "/chat/completions"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    label = EXCLUDED.label,
    base_url = EXCLUDED.base_url,
    test_path = EXCLUDED.test_path,
    test_method = EXCLUDED.test_method,
    metadata = jsonb_set(COALESCE(app.providers.metadata, '{}'::jsonb), '{chat_path}', '"/chat/completions"');

-- Google Models (Gemini 3.0 & 2.5)
WITH p AS (SELECT id FROM app.providers WHERE slug = 'google')
INSERT INTO app.provider_models (provider_id, model_key, label, active)
SELECT p.id, m.k, m.l, true
FROM p, (VALUES 
    ('gemini-3-flash-preview', 'Gemini 3.0 Flash Preview'),
    ('gemini-3-pro-preview', 'Gemini 3.0 Pro Preview'),
    ('gemini-2.5-flash', 'Gemini 2.5 Flash'),
    ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite')
) AS m(k, l)
ON CONFLICT (provider_id, model_key) DO UPDATE SET active = true, label = EXCLUDED.label;


-- 2. xAI (Grok)
INSERT INTO app.providers (slug, label, base_url, api_key_ref, auth_mode, test_path, test_method)
VALUES (
    'xai', 
    'xAI', 
    'https://api.x.ai', -- No /v1 suffix, as client appends it by default
    'XAI_API_KEY',
    'bearer',
    '/v1/models',
    'GET'
)
ON CONFLICT (slug) DO UPDATE SET
    label = EXCLUDED.label,
    base_url = EXCLUDED.base_url;

-- xAI Models
WITH p AS (SELECT id FROM app.providers WHERE slug = 'xai')
INSERT INTO app.provider_models (provider_id, model_key, label, active)
SELECT p.id, m.k, m.l, true
FROM p, (VALUES 
    ('grok-4-1-fast-reasoning', 'Grok 4.1 Fast Reasoning'),
    ('grok-4-1-fast-non-reasoning', 'Grok 4.1 Fast'),
    ('grok-code-fast-1', 'Grok Code Fast 1')
) AS m(k, l)
ON CONFLICT (provider_id, model_key) DO UPDATE SET active = true, label = EXCLUDED.label;


-- 3. OpenAI (Standard)
INSERT INTO app.providers (slug, label, base_url, api_key_ref, auth_mode, test_path, test_method)
VALUES (
    'openai', 
    'OpenAI', 
    'https://api.openai.com', -- No /v1 suffix
    'OPENAI_API_KEY',
    'bearer',
    '/v1/models',
    'GET'
)
ON CONFLICT (slug) DO UPDATE SET
    label = EXCLUDED.label,
    base_url = EXCLUDED.base_url;

-- OpenAI Models
WITH p AS (SELECT id FROM app.providers WHERE slug = 'openai')
INSERT INTO app.provider_models (provider_id, model_key, label, active)
SELECT p.id, m.k, m.l, true
FROM p, (VALUES 
    ('gpt-5.2', 'GPT-5.2'),
    ('gpt-5.2-pro', 'GPT-5.2 Pro'),
    ('gpt-5', 'GPT-5'),
    ('gpt-5-mini', 'GPT-5 Mini')
) AS m(k, l)
ON CONFLICT (provider_id, model_key) DO UPDATE SET active = true, label = EXCLUDED.label;