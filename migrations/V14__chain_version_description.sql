-- Chain-Versionen um Beschreibung erweitern
ALTER TABLE app.chain_versions
    ADD COLUMN IF NOT EXISTS description text;
