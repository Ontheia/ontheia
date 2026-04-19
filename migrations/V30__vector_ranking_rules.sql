CREATE TABLE IF NOT EXISTS app.vector_ranking_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern text NOT NULL,
    bonus double precision NOT NULL DEFAULT 0.0,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vector_ranking_rules_pattern_key UNIQUE (pattern)
);
