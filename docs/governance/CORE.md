# Core Engineering Rules

These rules are permanent and apply to every change in this repository without exception.

## Mandatory Standards

1. **Production-ready code only.** Every commit must be deployable. No experimental code on main.
2. **Architecture first.** Understand the existing architecture before making changes. Never bypass layers.
3. **One responsibility per module.** Each file, class, and function does exactly one thing.
4. **No duplicate implementations.** Before creating anything new, verify it does not already exist.
5. **No placeholder code.** Every function must have a complete implementation or must not exist.
6. **No mock implementations as final solutions.** Mocks are only for tests. Production code calls real services.
7. **Fix root cause, not symptoms.** If a bug appears, trace it to the source. Do not patch around it.
8. **Preserve architecture consistency.** Follow existing patterns. Do not introduce alternative approaches.
9. **One task at a time.** Complete the current task before starting the next. No parallel half-implementations.
10. **Minimal safe changes.** Make the smallest change that solves the problem correctly.
11. **Verify before continuing.** After every change: build, typecheck, test, run. Fix failures immediately.

## Layer Integrity

```
Frontend → API Client → REST/Socket → Controllers → Services → Business Logic → Pipeline → Storage
```

- No layer may be bypassed.
- Frontend never calls Services directly.
- Controllers never contain business logic.
- Services never contain UI logic.
- Business logic never depends on transport layer.

## Forbidden Practices

- Committing code that does not compile.
- Leaving TODO as a final implementation.
- Creating alternative implementations alongside existing ones.
- Modifying unrelated files in a focused task.
- Introducing new dependencies without explicit justification.
- Hardcoding secrets or environment-specific values.

## Reference

See also:

- [GOVERNANCE.md](./GOVERNANCE.md) — Mandatory workflow
- [QUALITY_GATE.md](./QUALITY_GATE.md) — Validation requirements
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) — Implementation lifecycle
