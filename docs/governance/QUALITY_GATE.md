# Quality Gate

No task may be considered complete unless every mandatory check passes.

## Mandatory Checks

| #   | Check                   | Command                                           | Passing Criteria  |
| --- | ----------------------- | ------------------------------------------------- | ----------------- |
| 1   | Build                   | `npm run build`                                   | Exit code 0       |
| 2   | TypeScript (frontend)   | `npx tsc --noEmit`                                | 0 errors          |
| 3   | TypeScript (backend)    | `npx tsc --project server/tsconfig.json --noEmit` | 0 errors          |
| 4   | Tests                   | `npx vitest run`                                  | All tests pass    |
| 5   | Architecture boundaries | `npx tsx scripts/validate-boundaries.ts`          | 0 violations      |
| 6   | Runtime (backend)       | Start server, verify health endpoint              | HTTP 200          |
| 7   | Runtime (frontend)      | Start dev server, verify page loads               | No console errors |
| 8   | API communication       | Test affected endpoints                           | Correct responses |

## Conditional Checks

Apply when the change touches the relevant area:

| Check              | When                        | Criteria                            |
| ------------------ | --------------------------- | ----------------------------------- |
| ESLint             | Lint rules configured       | 0 errors                            |
| Performance        | Data-heavy endpoints        | Response < 500ms                    |
| Security           | Auth/secrets/input handling | No exposed secrets, validated input |
| Duplicate code     | New module created          | No pre-existing equivalent          |
| Dead code          | Module removed/refactored   | No orphan imports                   |
| Breaking changes   | Public API modified         | Backward compatibility preserved    |
| Frontend rendering | UI components changed       | No visual regressions               |

## Failure Policy

- If any mandatory check fails: **stop and fix before continuing**.
- If a conditional check reveals a problem outside the current scope: **document it, do not fix it**.
- Never commit code that fails the quality gate.

## Reporting

After passing the quality gate, record results in the sprint report:

```
## Validation
- Build: PASS
- TypeScript: 0 errors
- Tests: X/X pass
- Architecture: 0 violations
- Runtime: PASS
```
