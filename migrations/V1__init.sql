-- Baseline-Migration: Schemas, Extensions, Kern-Tabellen
BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- vector must be in public schema so ontheia_app can resolve the type
-- (ontheia_app search_path: "$user", public — does not include app schema)
SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
RESET search_path;

-- Agenten
CREATE TABLE IF NOT EXISTS app.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    visibility text NOT NULL DEFAULT 'private',
    owner_id uuid NOT NULL,
    persona text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.agent_config (
    agent_id uuid PRIMARY KEY REFERENCES app.agents(id) ON DELETE CASCADE,
    model jsonb NOT NULL DEFAULT '{}'::jsonb,
    limits jsonb NOT NULL DEFAULT '{}'::jsonb,
    defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
    memory jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.agent_tools (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    server text NOT NULL,
    tool text NOT NULL,
    scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (agent_id, server, tool)
);

-- Tasks & Zuweisungen
CREATE TABLE IF NOT EXISTS app.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    prompt text,
    tone text,
    policies jsonb NOT NULL DEFAULT '{}'::jsonb,
    memory jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.agent_task (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES app.tasks(id) ON DELETE CASCADE,
    overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, task_id)
);

CREATE TABLE IF NOT EXISTS app.task_tools (
    task_id uuid NOT NULL REFERENCES app.tasks(id) ON DELETE CASCADE,
    server text NOT NULL,
    tool text NOT NULL,
    scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (task_id, server, tool)
);

-- Chains
CREATE TABLE IF NOT EXISTS app.chains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.chain_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id uuid NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
    version int NOT NULL,
    kind text NOT NULL,
    spec jsonb NOT NULL,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (chain_id, version)
);

CREATE TABLE IF NOT EXISTS app.task_chains (
    task_id uuid NOT NULL REFERENCES app.tasks(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('pre','main','post')),
    chain_version_id uuid NOT NULL REFERENCES app.chain_versions(id) ON DELETE RESTRICT,
    overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (task_id, role)
);

-- User Settings
CREATE TABLE IF NOT EXISTS app.user_settings (
    user_id uuid PRIMARY KEY,
    settings jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Embedding-Tabellen
CREATE TABLE IF NOT EXISTS vector.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace text NOT NULL,
    content text NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vector_documents_namespace_idx ON vector.documents (namespace);
CREATE INDEX IF NOT EXISTS vector_documents_embedding_ivf
    ON vector.documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS vector.documents_768 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace text NOT NULL,
    content text NOT NULL,
    embedding vector(768) NOT NULL,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vector_documents_768_namespace_idx ON vector.documents_768 (namespace);
CREATE INDEX IF NOT EXISTS vector_documents_768_embedding_ivf
    ON vector.documents_768 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMIT;
