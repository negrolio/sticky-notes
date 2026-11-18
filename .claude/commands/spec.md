---
description: Draft SPEC.md for a feature by interview. Explores read-only, never implements.
argument-hint: <task>
---
Explore the code read-only. Interview me, one question at a time, on scope, non-goals,
constraints, prior decisions, acceptance criteria, edge cases and errors. Ask from what the
code and the requirements I give you leave open; do not ask what CLAUDE.md already answers.

Then draft SPEC.md with five sections:
- Goals: the end state in one or two sentences.
- Non-goals: areas this work will not touch.
- Constraints: cite CLAUDE.md, do not restate it; add only what is new.
- Prior decisions: each settled question with its reason, so a later session does not reopen it.
- Acceptance criteria: a numbered list, one checkable line each, with an observed value and an
  expected value.

Write TODO(owner) where you lack an answer. Do not implement. Stop after the draft.
Task: $ARGUMENTS
