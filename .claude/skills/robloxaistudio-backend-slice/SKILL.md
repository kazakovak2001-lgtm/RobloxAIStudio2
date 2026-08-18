---
name: robloxaistudio-backend-slice
description: Orchestration workflow for implementing one narrow, coherent backend vertical slice in RobloxAIStudio2 — inspect implementation and direct dependencies, preserve architectural invariants, implement the smallest correct change, validate narrowly, report gaps. Use when asked to implement, fix, or extend a specific scoped backend behavior (not for open-ended exploration, audits, or reviews — those are covered by architecture-auditor/security-reviewer/persistence-engineer/test-engineer).
disable-model-invocation: true
argument-hint: "[the exact slice to implement, e.g. a ticket/finding id or a one-sentence scope]"
---

# RobloxAIStudio2 backend slice

This skill is an **orchestration workflow**, not a knowledge base. It does not duplicate backend/API/security/persistence expertise — pull in the relevant `.claude/rules/*.md` and existing agents for that. Its job is to keep a scoped change scoped.

## 0. Read the invariants that apply

Before touching code, identify which of `.claude/rules/security.md`, `persistence.md`, `pipeline-v2.md`, `studio.md` govern the files you're about to touch (match against each rule's `globs`). Load only those — not all four by default.

## 1. Establish the exact slice

State, in one or two sentences, what is being implemented and what is explicitly **not** in scope. If the request is ambiguous about scope, ask rather than guess wide.

## 2. Inspect implementation

- `grep`/`glob` for the exact symbols involved. Do not broad-read the repository.
- Read the current implementation of what you're changing — never infer its behavior from a filename, comment, or doc claim.
- Identify direct dependencies: callers, callees, the types that cross the boundary.

## 3. Inspect relevant tests

Find and read the tests that already cover this code. They are the executable spec. A test whose name overstates its assertions is worse than no test — if you find one, note it.

## 4. Identify affected invariants

Cross-check against the loaded rules: tenant ownership, durability ordering, pipeline determinism, Studio delivery boundaries — whichever apply. Name the specific invariant your change must preserve.

## 5. Implement the smallest coherent change

- Touch only the files the slice requires.
- No unrelated cleanup, no drive-by refactors, no formatting-only diffs mixed into logic changes.
- Match the surrounding code's idiom, comment density, and naming.
- If mid-implementation you find a second, adjacent-but-separate problem: **stop, name it, and ask** whether to fold it in or leave it for later. Do not silently expand scope.

## 6. Targeted validation

Run only what this change requires:

- The specific test file(s) covering the change (`vitest ... run path/to.test.ts`), not the full suite by default.
- `npm run typecheck` if types changed.
- `git diff --check` before anything gets staged.

Escalate to the full suite / `npm run validate` / `npm run ci` only when the caller asks for release-readiness, or when the change plausibly has cross-cutting effects the targeted run can't see.

## 7. Report

- Exact files changed, and why each one needed to change.
- Test results (targeted, and full-suite only if run).
- Any invariant that was at risk and how the change addresses it.
- Anything you decided was out of scope and left alone.
- Remaining gaps, honestly labeled (`SCAFFOLDING`, `PARTIALLY IMPLEMENTED`, etc. — see `CLAUDE.md`).

## Git

No commit, push, or merge unless the caller explicitly authorizes it for this exact change. See `CLAUDE.md` → Git safety.
