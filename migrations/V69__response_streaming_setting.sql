BEGIN;

-- Globaler Schalter für Response-Streaming (SSE) auf allen Provider-Pfaden.
-- Aktiviert: Antworten erscheinen tokenweise im Chat, sobald der Provider sie
-- generiert. Deaktiviert: Antworten erscheinen als Block nach Abschluss der
-- Generierung. Einzelne OpenAI-kompatible Provider ohne SSE-Unterstützung
-- können per Provider-/Modell-Metadata (stream: false) ausgenommen werden.
-- Default: aktiviert.
INSERT INTO app.system_settings (key, value, description)
VALUES (
    'response_streaming',
    'true'::jsonb,
    'Aktiviert tokenweises Streaming der LLM-Antworten in den Chat (SSE). Deaktivieren, falls ein Provider mit Streaming-Anfragen Probleme hat.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
