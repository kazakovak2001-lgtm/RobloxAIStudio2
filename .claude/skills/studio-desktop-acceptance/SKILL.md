---
name: studio-desktop-acceptance
description: Runs guarded operator-observed acceptance in the real Roblox Studio desktop with screenshots and explicitly approved input.
argument-hint: "[acceptance objective and disposable/local place target]"
disable-model-invocation: true
---

# Guarded Roblox Studio desktop acceptance

Read `docs/testing/CLAUDE_STUDIO_DESKTOP_CONTROL.md` and delegate the requested visual workflow to `studio-operator`. Do not weaken its boundaries or use shell-based UI automation as a fallback.

Require a concrete objective in `$ARGUMENTS`. If none is supplied, stop and ask for the acceptance objective and disposable/local place target. Loading a published place never authorizes saving or publishing it.

The operator must:

1. inspect branch, HEAD, worktree, scope, and current authority;
2. list eligible Studio windows and pin the acceptance session to the selected PID;
3. capture a screenshot before every input;
4. request the built-in Claude Code approval for every click, typed text, key press, and evidence capture, using a verified screenshot coordinate for each key's intended focus target;
5. stop on account, credential, purchase, upload, publish, Save to Roblox, moderation, or external-link UI;
6. capture only approved local evidence under `artifacts/studio-acceptance/operator/`;
7. separate visual facts from backend, persistence, receipt, multiplayer, and subjective-quality claims.

Never approve tools on the user's behalf. Never convert a visual observation into release authority without the required identifiers and non-visual evidence. End with `PASS`, `FAIL`, or `BLOCKED` and the exact scope.
