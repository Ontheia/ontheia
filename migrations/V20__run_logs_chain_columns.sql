ALTER TABLE app.run_logs
  ADD COLUMN IF NOT EXISTS chain_id uuid,
  ADD COLUMN IF NOT EXISTS chain_version_id uuid;

-- Indexe für schnelle Filter/Joins
CREATE INDEX IF NOT EXISTS run_logs_chain_idx ON app.run_logs (chain_id);
CREATE INDEX IF NOT EXISTS run_logs_chain_version_idx ON app.run_logs (chain_version_id);
