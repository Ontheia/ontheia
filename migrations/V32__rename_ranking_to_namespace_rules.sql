-- Rename table from vector_ranking_rules to vector_namespace_rules
ALTER TABLE app.vector_ranking_rules RENAME TO vector_namespace_rules;

-- Add instruction_template column
ALTER TABLE app.vector_namespace_rules 
ADD COLUMN instruction_template text;

-- Add comment to clarify new purpose
COMMENT ON TABLE app.vector_namespace_rules IS 'Rules for vector namespaces: ranking bonuses and LLM instruction templates.';
