# Implementation Task Template

**Version**: 1.0  
**Usage**: Copy this template for every feature, bugfix, integration, refactoring, or infrastructure task.

---

## 1. Context

<!-- Describe the task: what, why, and any background information -->

**Task**: [Feature/Bug/Integration name]  
**Type**: [ ] Feature [ ] Bugfix [ ] Integration [ ] Refactoring [ ] Testing [ ] Infrastructure  
**Priority**: [ ] Critical [ ] High [ ] Medium [ ] Low  
**Roadmap ID**: [F-X / UX-X.X / — ]

---

## 2. Required Reading

Before any implementation, read these documents:

**Always required:**

- [ ] `docs/00-project-control/CURRENT_STATE.md`
- [ ] `docs/00-project-control/ROADMAP_STATUS.md`
- [ ] `docs/00-project-control/DECISION_LOG.md`
- [ ] `docs/AI_WORKFLOW_RULES.md`

**Task-specific documents:**

- [ ] <!-- Add relevant audit, plan, or spec documents -->

---

## 3. Goal

<!-- Clear, measurable objective -->

**Success criteria**: <!-- What must be true when this task is complete? -->

---

## 4. Pre-Implementation Checklist

Before writing ANY code, verify:

- [ ] Functionality does NOT already exist in the repository
- [ ] Existing services in `src/services/` are checked for reuse
- [ ] Existing components in `src/shared/ui/` are checked for reuse
- [ ] Existing hooks in `src/hooks/` and feature hooks are checked
- [ ] Existing API clients cover the needed endpoints
- [ ] Existing types/interfaces are compatible (no duplication)
- [ ] Existing design system tokens are used (not raw colors)
- [ ] Existing tests are reviewed for affected areas
- [ ] Backend API already exists (check `server/src/index.ts`)

**Rule**: If existing implementation is found, EXTEND it. Do not create duplicates.

---

## 5. Implementation Rules

### Always

- Follow established project architecture (`@/` path aliases, feature structure)
- Reuse existing services, components, hooks, and types
- Use design tokens (`success-*`, `error-*`, `warning-*`, `brand-*`, `slate-*`)
- Keep UI consistent with existing pages and panels
- Preserve backwards compatibility
- Handle loading, error, and empty states
- Add tests for new code

### Never

- Redesign unrelated UI
- Introduce unnecessary npm dependencies
- Replace working architecture patterns
- Remove or overwrite existing documentation
- Create duplicate services/components/types
- Skip build validation
- Bypass quality gates

---

## 6. Implementation

<!-- Describe the specific changes -->

### Files to Create

| File          | Purpose              |
| ------------- | -------------------- |
| <!-- path --> | <!-- description --> |

### Files to Modify

| File          | Change               |
| ------------- | -------------------- |
| <!-- path --> | <!-- description --> |

### API Endpoints

| Endpoint          | Method            | Service Function        |
| ----------------- | ----------------- | ----------------------- |
| <!-- /api/... --> | <!-- GET/POST --> | <!-- functionName() --> |

---

## 7. Validation

Execute after implementation:

- [ ] `npx tsc --noEmit` — TypeScript PASS
- [ ] `npx vite build` — Vite PASS
- [ ] `npx vitest run` — Tests PASS (or specific test file)
- [ ] No regressions in affected pages

---

## 8. Documentation

After implementation:

- [ ] Update `docs/00-project-control/CURRENT_STATE.md` (last changes, status)
- [ ] Update `docs/00-project-control/ROADMAP_STATUS.md` (if roadmap item)
- [ ] Update `docs/00-project-control/DECISION_LOG.md` (if architectural decision made)
- [ ] Create `docs/04-migrations/completed/[task-name].md` (migration record)
- [ ] Create `[TASK_NAME]_REPORT.md` (implementation report)

---

## 9. Definition of Done

Implementation is complete ONLY when ALL are checked:

- [ ] Existing implementation verified before coding
- [ ] Existing code/services/components reused where possible
- [ ] No duplicated logic, services, or components
- [ ] Loading state implemented
- [ ] Error state implemented
- [ ] Empty state implemented
- [ ] Frontend tests added or updated
- [ ] TypeScript build PASS ✅
- [ ] Vite build PASS ✅
- [ ] Tests PASS ✅
- [ ] Documentation updated
- [ ] Report created

---

## 10. Output Format

Every completed task must end with:

```
## Implementation Summary
- [What was done]

## Files Modified
- [list]

## Files Created
- [list]

## Validation Results
- TypeScript: PASS/FAIL
- Vite: PASS/FAIL
- Tests: X/X pass

## Documentation Updated
- [list of docs changed]

## Known Limitations
- [any caveats]

## Next Recommended Step
- [what should happen next]
```
