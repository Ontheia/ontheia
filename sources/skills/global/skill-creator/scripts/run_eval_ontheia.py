#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg2-binary"]
# ///
# Added by Wolfgang Brangl, 2026 — AGPL-3.0 (Ontheia), separate from the
# Apache-2.0-licensed skill-creator components in this directory.
"""Ontheia-native skill trigger evaluator.

Replaces run_eval.py + claude -p for Ontheia environments.
No external API key needed — uses Ontheia's own DB and agent infrastructure.

Two-phase workflow (called by W_Skill_Creator, the orchestrator agent):

  Phase 1 — setup:
    Temporarily updates the skill description in app.skills so W_Skill_Test
    picks it up on the next run. Returns the original description for later restore.

  Phase 2 — analyze (call AFTER all delegate-to-agent calls to W_Skill_Test):
    Reads the orchestrator's OWN most recent app.run_logs row — delegated
    sub-agent runs do NOT get separate run_logs rows; the whole chain (every
    delegate-to-agent call plus the nested activate_skill / tool_call events
    triggered inside W_Skill_Test) is logged as one flat `events` array on the
    orchestrator's row. analyze() splits that array into per-delegation segments
    at "chain:delegate" / "chain:delegate:complete" markers, checks each segment
    for an `activate_skill` call with arguments.name == skill_name, matches
    segments to eval_queries by the exact prompt text (delegate-to-agent
    arguments.input), computes trigger stats, then restores the original
    description.

Input via stdin (JSON):

  setup:
  {
    "action": "setup",
    "skill_name": "my-skill",
    "owner_id": "uuid-of-skill-owner",   // required for user-scoped skills
    "candidate_description": "..."
  }

  analyze:
  {
    "action": "analyze",
    "skill_name": "my-skill",
    "owner_id": "uuid-of-skill-owner",
    "orchestrator_label": "W_Skill_Creator",  // agent whose run_logs row to read (= the agent calling this script)
    "original_description": "...",
    "eval_queries": [
      {"query": "...", "should_trigger": true},
      ...
    ]
  }
"""

import json
import os
import sys

import psycopg2


def get_conn():
    db_url = os.environ.get("DATABASE_URL", "postgresql://ontheia_app:ontheia_app_pwd_123@db:5432/ontheia")
    return psycopg2.connect(db_url)


def _set_rls_context(cur, owner_id: str | None) -> None:
    """Set session variables so RLS allows access to user-scoped skills and run_logs."""
    if owner_id:
        cur.execute("SET LOCAL app.user_role = 'admin'")
        cur.execute("SET LOCAL app.current_user_id = %s", (owner_id,))


def setup(skill_name: str, candidate_description: str, owner_id: str | None) -> dict:
    """Temporarily update skill description in DB. Returns original for restore."""
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            _set_rls_context(cur, owner_id)
            cur.execute(
                "SELECT id, description FROM app.skills WHERE name = %s AND active = true",
                (skill_name,)
            )
            row = cur.fetchone()
            if not row:
                return {"error": f"Skill '{skill_name}' not found in app.skills"}

            skill_id, original_description = row
            cur.execute(
                "UPDATE app.skills SET description = %s WHERE id = %s",
                (candidate_description, skill_id)
            )
        return {
            "status": "ok",
            "skill_id": str(skill_id),
            "original_description": original_description,
            "message": (
                f"Skill '{skill_name}' description updated for testing. "
                "Delegate test queries to W_Skill_Test now, then call analyze."
            )
        }
    finally:
        conn.close()


def _split_delegation_segments(events: list) -> list[dict]:
    """Split a flat run_logs events array into per-delegation segments.

    Each delegation is bounded by a "chain:delegate" step_start (start) and the
    following "chain:delegate" (or end of array). Within a segment we record:
      - prompt: the test prompt sent (delegate-to-agent arguments.input)
      - activated_skills: set of skill names activated via activate_skill inside it
    """
    starts = [
        i for i, e in enumerate(events)
        if e.get("type") == "step_start" and e.get("step") == "chain:delegate"
    ]
    segments = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(events)
        chunk = events[start:end]
        prompt = None
        activated_skills = set()
        for e in chunk:
            if e.get("type") != "tool_call":
                continue
            if e.get("tool") == "delegate-to-agent":
                prompt = e.get("arguments", {}).get("input")
            elif e.get("tool") == "activate_skill":
                name = e.get("arguments", {}).get("name")
                if name:
                    activated_skills.add(name)
        segments.append({"prompt": prompt, "activated_skills": activated_skills})
    return segments


def analyze(
    skill_name: str,
    original_description: str,
    orchestrator_label: str,
    eval_queries: list[dict],
    owner_id: str | None,
) -> dict:
    """Read the orchestrator's own latest run_logs row, match delegations to
    eval_queries by prompt text, compute trigger stats, restore description."""
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            _set_rls_context(cur, owner_id)

            cur.execute(
                """
                SELECT rl.run_id::text, rl.events
                FROM app.run_logs rl
                JOIN app.agents a ON rl.agent_id = a.id::text
                WHERE a.label = %s
                ORDER BY rl.created_at DESC
                LIMIT 1
                """,
                (orchestrator_label,),
            )
            row = cur.fetchone()
            if not row:
                return {"error": f"No run_logs row found for orchestrator agent '{orchestrator_label}'"}
            run_id, events = row

            # Restore original description
            cur.execute(
                "UPDATE app.skills SET description = %s WHERE name = %s",
                (original_description, skill_name)
            )

        segments = _split_delegation_segments(events)
        by_prompt = {s["prompt"]: s for s in segments if s["prompt"] is not None}

        results = []
        for query_def in eval_queries:
            query = query_def.get("query", "")
            should_trigger = query_def.get("should_trigger", True)
            segment = by_prompt.get(query)
            triggered = bool(segment and skill_name in segment["activated_skills"])
            matched = segment is not None
            correct = triggered == should_trigger
            results.append({
                "query": query,
                "should_trigger": should_trigger,
                "triggered": triggered,
                "correct": correct,
                "matched_segment": matched,
            })

        total = len(results)
        correct_count = sum(1 for r in results if r["correct"])
        false_negatives = [r for r in results if r["should_trigger"] and not r["triggered"]]
        false_positives = [r for r in results if not r["should_trigger"] and r["triggered"]]
        unmatched = [r["query"] for r in results if not r["matched_segment"]]

        return {
            "status": "ok",
            "description_restored": True,
            "run_id": run_id,
            "segments_found": len(segments),
            "total": total,
            "correct": correct_count,
            "accuracy": round(correct_count / total, 3) if total else 0,
            "false_negatives": false_negatives,
            "false_positives": false_positives,
            "unmatched_queries": unmatched,
            "results": results,
            "summary": (
                f"{correct_count}/{total} correct — "
                f"{len(false_negatives)} missed triggers, {len(false_positives)} false triggers"
                + (f" — {len(unmatched)} queries had no matching delegation segment" if unmatched else "")
            ),
        }
    finally:
        conn.close()


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    action = data.get("action")
    skill_name = data.get("skill_name", "")
    owner_id = data.get("owner_id") or None

    if not skill_name:
        print(json.dumps({"error": "skill_name is required"}))
        sys.exit(1)

    if action == "setup":
        candidate = data.get("candidate_description", "")
        if not candidate:
            print(json.dumps({"error": "candidate_description is required for setup"}))
            sys.exit(1)
        print(json.dumps(setup(skill_name, candidate, owner_id)))

    elif action == "analyze":
        original = data.get("original_description", "")
        orchestrator_label = data.get("orchestrator_label", "")
        eval_queries = data.get("eval_queries", [])
        if not original:
            print(json.dumps({"error": "original_description is required for analyze"}))
            sys.exit(1)
        if not orchestrator_label:
            print(json.dumps({"error": "orchestrator_label is required for analyze"}))
            sys.exit(1)
        if not eval_queries:
            print(json.dumps({"error": "eval_queries is required for analyze"}))
            sys.exit(1)
        print(json.dumps(analyze(skill_name, original, orchestrator_label, eval_queries, owner_id)))

    else:
        print(json.dumps({"error": f"Unknown action '{action}'. Use 'setup' or 'analyze'."}))
        sys.exit(1)


if __name__ == "__main__":
    main()
