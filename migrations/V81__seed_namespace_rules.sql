-- The namespace rules a memory needs to be more than a pile of text.
--
-- V76 gave every entry a memory class, a ranking bonus applies per namespace,
-- and each namespace can frame its hits with an instruction template. All three
-- are read from app.vector_namespace_rules — and that table starts empty. A
-- fresh install got the rules from bootstrap.ts, but bootstrap does not run on
-- update: update.sh calls it with --skills-only, deliberately, so that a tuned
-- configuration is never overwritten. The rules rode along in the part that is
-- skipped on purpose.
--
-- The consequence went unnoticed until 0.6.0 was tested on an existing
-- installation: the columns arrived, the configuration did not. Every entry
-- written after the update carried no class, no bonus and no framing, because
-- resolveClassForNamespace found nothing to match.
--
-- A migration is the right home because it runs on both paths. ON CONFLICT DO
-- NOTHING keeps it additive: an installation that has edited its rules, or
-- deleted one on purpose, is left alone.
--
-- ⚠️ chr(36) builds the dollar sign of the user-id placeholder that five of
-- these patterns contain. Flyway substitutes dollar-brace expressions anywhere
-- in a migration file — comments included — and aborts when it has no value for
-- one. Writing the placeholder literally here made this migration unparseable,
-- which is why the sign is assembled instead of typed. V57 relies on that
-- substitution for the app password, so it cannot simply be switched off.
-- The adapter resolves the placeholder per request; it is not SQL.

INSERT INTO app.vector_namespace_rules (pattern, bonus, memory_class, description, instruction_template)
VALUES
  ('vector.agent.' || chr(36) || '{user_id}.preferences',
   0.09,
   NULL,
   $rule$Preferences, facts and standing instructions about the user.$rule$,
   $rule$ABOUT THE USER (MEMORY): Preferences, facts and standing instructions about this person, kept from earlier conversations. Let them shape your answer; where a current instruction contradicts them, the current one wins: {{content}}$rule$),
  ('vector.agent.' || chr(36) || '{user_id}.howto',
   0.06,
   $rule$procedural$rule$,
   $rule$Procedural knowledge: how you carry out a task for this user.$rule$,
   $rule$WORKING INSTRUCTION (MEMORY): A way of doing something recorded for this user. Follow it as long as it fits the task; where the situation differs, say so instead of stretching the instruction: {{content}}$rule$),
  ('vector.agent.' || chr(36) || '{user_id}.memory',
   0.03,
   $rule$episodic$rule$,
   $rule$Observations from earlier conversations, each with a point in time.$rule$,
   $rule$CONVERSATION NOTE (MEMORY): Recorded in an earlier conversation — a record, not a verified fact. Mind the date given; the situation may have changed since: {{content}}$rule$),
  ('vector.user.' || chr(36) || '{user_id}.ideas',
   0.03,
   NULL,
   $rule$Thoughts that assert nothing: ideas, drafts, the undecided. No class fits.$rule$,
   $rule$THOUGHT (MEMORY): An idea, a draft, something not yet decided — neither fact nor rule. Present it as a consideration rather than as settled, and do not derive anything from it the user has not decided: {{content}}$rule$),
  ('vector.user.' || chr(36) || '{user_id}.archive',
   0,
   $rule$document$rule$,
   $rule$Strictly personal documents. A place to file things, not a memory.$rule$,
   $rule$PERSONAL RECORD (SOURCE): An extract from a strictly personal document of the user. Take figures, names and dates verbatim; add nothing that is not there. If the extract is not enough, search the same namespace again — with the full question in whole sentences: {{content}}$rule$),
  ($rule$vector.global.ontheia.temp$rule$,
   0.12,
   $rule$working$rule$,
   $rule$Scratch space bound to the running task. Always written with a TTL.$rule$,
   $rule$SCRATCH NOTE (MEMORY): Stored temporarily and tied to the task in progress. Do not treat it as lasting knowledge, and stop drawing on it once the task is done: {{content}}$rule$),
  ($rule$vector.global.ontheia.docs$rule$,
   0,
   $rule$document$rule$,
   $rule$Ontheia product documentation.$rule$,
   $rule$ONTHEIA DOCUMENTATION (SOURCE): An extract from the product documentation, not from a conversation. Base statements about Ontheia on it, and say when the extract does not cover the question instead of filling the gap: {{content}}$rule$),
  ($rule$vector.global.ontheia.feedback$rule$,
   0,
   $rule$episodic$rule$,
   $rule$Reported errors and suggestions — a record, not current system state.$rule$,
   $rule$FEEDBACK RECORD (MEMORY): An error or suggestion reported at a point in time — not the current state of the system. It may long since be fixed; check the date before building on it: {{content}}$rule$),
  ($rule$vector.global.knowledge.general.facts$rule$,
   0,
   $rule$document$rule$,
   $rule$Collected subject knowledge, not conversation.$rule$,
   $rule$KNOWLEDGE BASE (SOURCE): Collected subject knowledge, not conversation. Use it as evidence and flag when it answers the question only in part: {{content}}$rule$),
  ($rule$vector.global.knowledge.llm.api-docs$rule$,
   0,
   $rule$document$rule$,
   $rule$Cached library and API documentation.$rule$,
   $rule$LIBRARY DOCUMENTATION (SOURCE): Cached documentation for a library or API. Take signatures, parameter names and version numbers verbatim; add nothing that is not there. Mind the date — stale documentation is worse than none: {{content}}$rule$),
  ($rule$vector.global.knowledge.llm.best-practices$rule$,
   0,
   $rule$procedural$rule$,
   $rule$Agreed rules for code, security and architecture.$rule$,
   $rule$CODING STANDARD (MEMORY): An agreed rule for code, security or architecture. Shape your proposal accordingly; depart from it only when the user asks explicitly: {{content}}$rule$),
  ($rule$vector.global.privat.manuals$rule$,
   0,
   $rule$document$rule$,
   $rule$Ingested operating and user manuals, private sphere.$rule$,
   $rule$MANUAL (SOURCE): An extract from an ingested operating or user manual. Treat it as a handbook — take figures, type designations and limits verbatim, add nothing that is not there. If the extract is not enough, search the same namespace again and ask the full question in whole sentences — single keywords stay below the relevance threshold and return nothing: {{content}}$rule$),
  ($rule$vector.global.privat.recipes$rule$,
   0,
   $rule$document$rule$,
   $rule$Shared recipe collection.$rule$,
   $rule$RECIPE (SOURCE): From the shared recipe collection. Take quantities, times and ingredients verbatim; do not present a variant as available that is not there: {{content}}$rule$),
  ($rule$vector.global.business.manuals$rule$,
   0,
   $rule$document$rule$,
   $rule$Ingested operating and user manuals, business sphere.$rule$,
   $rule$MANUAL (SOURCE): An extract from an ingested operating or user manual from the business sphere. Treat it as a handbook — take figures, type designations and limits verbatim, add nothing that is not there. If the extract is not enough, search the same namespace again and ask the full question in whole sentences — single keywords stay below the relevance threshold and return nothing: {{content}}$rule$)
ON CONFLICT (pattern) DO NOTHING;
