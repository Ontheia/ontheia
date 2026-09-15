BEGIN;

-- Globale Obergrenze für Tool-Aufrufe pro Run ('max_tool_calls'). Greift auf
-- allen drei Provider-Pfaden (Anthropic, OpenAI Responses, OpenAI-kompatible
-- Chat-Completions). Der Wert NULL (oder eine nicht-positive Zahl) bedeutet
-- „nicht gesetzt" — dann gilt der einheitliche Default 50 (früher 25/25/50 je
-- Pfad, ein historischer Zufall ohne Grund). Der Admin stellt das Limit über
-- Admin → Settings ein; geleert wird es durch erneutes NULL.
INSERT INTO app.system_settings (key, value, description)
VALUES (
    'max_tool_calls',
    'null'::jsonb,
    'Maximale Anzahl von Tool-Aufrufen pro Run, global für alle Provider-Pfade. Leer = Default 50.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;