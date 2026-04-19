-- V56: Provider type (http/cli) and model capability (chat/embedding/tts/stt/image)
--
-- provider_type: how Ontheia communicates with the provider
--   'http' = existing HTTP/OpenAI-compatible API (default, backward-compatible)
--   'cli'  = local CLI subprocess (gemini, claude, ...)
--
-- capability: what a specific model is used for
--   'chat'      = conversational completions (default, backward-compatible)
--   'embedding' = vector embeddings
--   'tts'       = text-to-speech
--   'stt'       = speech-to-text
--   'image'     = image generation

ALTER TABLE app.providers
  ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'http'
    CHECK (provider_type IN ('http', 'cli'));

ALTER TABLE app.provider_models
  ADD COLUMN IF NOT EXISTS capability text NOT NULL DEFAULT 'chat'
    CHECK (capability IN ('chat', 'embedding', 'tts', 'stt', 'image'));

COMMENT ON COLUMN app.providers.provider_type IS
  'Communication type: http = REST API, cli = local subprocess';

COMMENT ON COLUMN app.provider_models.capability IS
  'Model capability: chat, embedding, tts, stt, image';
