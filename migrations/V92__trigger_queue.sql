BEGIN;

-- Warteschlange für Webhook-Trigger. Bisher wurde ein Aufruf, der während
-- eines laufenden Laufs eintraf, übersprungen (prevent_overlap) oder parallel
-- gestartet, und ab drei gleichzeitigen Läufen pro Benutzer abgewiesen.
-- Jetzt entscheidet overlap_mode:
--   'queue'    — jedes Ereignis wartet und läuft der Reihe nach (Aufträge, z. B. Mails)
--   'coalesce' — höchstens ein Ereignis wartet, ein neueres ersetzt es
--                (Weckrufe für Agenten, die ihre Arbeit selbst suchen)
--   'skip'     — ein Aufruf während eines Laufs wird übersprungen (bisher prevent_overlap)
ALTER TABLE app.triggers
    ADD COLUMN IF NOT EXISTS overlap_mode text NOT NULL DEFAULT 'queue'
        CHECK (overlap_mode IN ('queue', 'coalesce', 'skip'));

-- Bestehende Trigger behalten ihr Verhalten beim Überlappen: wer überspringen
-- ließ, überspringt weiter. Parallel laufende Trigger gibt es nicht mehr, sie
-- warten jetzt der Reihe nach.
UPDATE app.triggers SET overlap_mode = CASE WHEN prevent_overlap THEN 'skip' ELSE 'queue' END;
ALTER TABLE app.triggers DROP COLUMN prevent_overlap;

-- Neue Zustände eines Ereignisses:
--   queued      wartet auf seinen Lauf
--   superseded  wartete und wurde von einem neueren ersetzt (coalesce)
--   expired     wartete zu lange oder der Trigger wurde abgeschaltet
--   cancelled   von Hand verworfen
--   queue_full  abgewiesen, weil schon zu viele warten
ALTER TABLE app.trigger_events DROP CONSTRAINT IF EXISTS trigger_events_status_check;
ALTER TABLE app.trigger_events ADD CONSTRAINT trigger_events_status_check
    CHECK (status IN ('queued', 'started', 'success', 'error', 'rate_limited', 'overlap_skipped', 'busy',
                      'superseded', 'expired', 'cancelled', 'queue_full'));

-- Der vollständige Inhalt eines wartenden Aufrufs. payload ist nur die
-- (ab 64 KB gekürzte) Fassung fürs Protokoll; der Lauf braucht das Original.
-- Wird geleert, sobald das Ereignis die Warteschlange verlässt.
ALTER TABLE app.trigger_events ADD COLUMN IF NOT EXISTS queued_payload jsonb;
ALTER TABLE app.trigger_events ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Header Idempotency-Key des Absenders: ein zweiter Aufruf mit demselben
-- Schlüssel wird nicht noch einmal ausgeführt. Gilt, solange das erste
-- Ereignis im Protokoll steht.
ALTER TABLE app.trigger_events ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS trigger_events_idempotency_idx
    ON app.trigger_events (trigger_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS trigger_events_queued_idx
    ON app.trigger_events (trigger_id, received_at)
    WHERE status = 'queued';

COMMIT;
