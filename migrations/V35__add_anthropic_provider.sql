-- V35: Add Anthropic Claude Provider and Models

-- 1. Anthropic Provider
INSERT INTO app.providers (slug, label, base_url, api_key_ref, auth_mode, header_name, test_path, test_method, test_model_id)
VALUES (
    'anthropic', 
    'Anthropic', 
    'https://api.anthropic.com', 
    'secret:ANTHROPIC_API_KEY', 
    'header',
    'x-api-key',
    '/v1/messages',
    'POST',
    'claude-haiku-4-5'
)
ON CONFLICT (slug) DO UPDATE SET
    label = EXCLUDED.label,
    base_url = EXCLUDED.base_url,
    auth_mode = EXCLUDED.auth_mode,
    header_name = EXCLUDED.header_name,
    test_model_id = EXCLUDED.test_model_id;

-- Anthropic Models (Claude 4.5)
WITH p AS (SELECT id FROM app.providers WHERE slug = 'anthropic')
INSERT INTO app.provider_models (provider_id, model_key, label, active)
SELECT p.id, m.k, m.l, true
FROM p, (VALUES 
    ('claude-sonnet-4-5', 'Claude 4.5 Sonnet'),
    ('claude-haiku-4-5', 'Claude 4.5 Haiku'),
    ('claude-opus-4-5', 'Claude 4.5 Opus')
) AS m(k, l)
ON CONFLICT (provider_id, model_key) DO UPDATE SET active = true, label = EXCLUDED.label;
