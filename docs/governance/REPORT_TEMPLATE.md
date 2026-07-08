# Sprint Report Template

Use this template for every completed sprint.

---

```markdown
# Sprint [VERSION] — [TITLE]

## Executive Summary

[One paragraph describing what was accomplished and why.]

## Objective

[Clear statement of the sprint goal.]

## Analysis

### Root Cause

[For fixes: what caused the problem.]
[For features: what gap existed.]

### Affected Modules

- [module/path]
- [module/path]

### Architectural Impact

[None | Minimal | Moderate | Significant]
[Explain if not "None".]

## Implementation

### Files Added

- `path/to/file.ts` — [purpose]

### Files Modified

- `path/to/file.ts` — [what changed and why]

### Files Removed

- `path/to/file.ts` — [why removed]

## Validation

| Check                   | Result       |
| ----------------------- | ------------ |
| Build                   | PASS / FAIL  |
| TypeScript (frontend)   | X errors     |
| TypeScript (backend)    | X errors     |
| Tests                   | X/X pass     |
| Architecture boundaries | X violations |
| Runtime (backend)       | PASS / FAIL  |
| Runtime (frontend)      | PASS / FAIL  |
| API endpoints           | PASS / FAIL  |

## Risks

- [Risk description and mitigation]

## Technical Debt

- [Any debt introduced or discovered]

## Recommendations

### Required (before next sprint)

- [Must-fix items]

### Recommended (should address soon)

- [Important improvements]

### Optional (nice to have)

- [Low-priority improvements]

### Future Ideas

- [Long-term possibilities]
```
