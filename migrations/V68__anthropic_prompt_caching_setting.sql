BEGIN;

-- Globaler Schalter für Prompt-Caching auf dem Anthropic-API-Pfad.
-- Nur dort kann Caching Mehrkosten verursachen: cache_creation (Write) kostet
-- ~1,25× normaler Input-Token. Wird der gecachte Prefix innerhalb der 5-Minuten-
-- TTL nicht wiedergelesen (z. B. sporadische Single-Shot-Runs), entsteht +25 %
-- statt Ersparnis. OpenAI/xAI cachen ohne Write-Aufschlag und automatisch — dort
-- gibt es nichts zu schalten. Default: aktiviert (rückwärtskompatibel).
INSERT INTO app.system_settings (key, value, description)
VALUES (
    'anthropic_prompt_caching',
    'true'::jsonb,
    'Aktiviert Prompt-Caching (cache_control) auf dem Anthropic-API-Pfad. Bei sporadischer Einzelnutzung kann Caching dort teurer sein (Write-Aufschlag) — dann deaktivieren.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
