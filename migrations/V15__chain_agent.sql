-- Chains um Agent-Zuordnung erweitern
ALTER TABLE app.chains
    ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES app.agents(id);
