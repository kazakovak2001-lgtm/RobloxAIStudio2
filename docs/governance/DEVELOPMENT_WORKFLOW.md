# Development Workflow

Mandatory implementation lifecycle for every task.

## Workflow Stages

```
Analyze → Design → Implement → Build → TypeScript → Tests → Runtime → Architecture Review → Document → Commit → Tag → Next Sprint
```

### 1. Analyze

- Read existing code in the affected area.
- Understand current behavior.
- Identify what needs to change and why.

### 2. Design

- Plan the minimal safe change.
- Identify files to create, modify, or delete.
- Confirm approach fits architecture.

### 3. Implement

- Write production-ready code.
- Follow existing patterns and conventions.
- One logical change per commit.

### 4. Build Verification

- Run `npm run build` (or equivalent).
- Must exit with code 0.

### 5. TypeScript Verification

- Run `npx tsc --noEmit` (frontend).
- Run `npx tsc --project server/tsconfig.json --noEmit` (backend).
- Both must report 0 errors.

### 6. Tests

- Run `npx vitest run`.
- All tests must pass.
- New functionality must include tests.

### 7. Runtime Validation

- Start backend. Verify no startup errors.
- Test affected API endpoints.
- Verify frontend displays correct data.

### 8. Architecture Review

- Run boundary validator: `npx tsx scripts/validate-boundaries.ts`.
- Must report 0 violations.
- No new circular dependencies introduced.

### 9. Document

- Update relevant documentation.
- Produce sprint report if completing a sprint.

### 10. Commit

- Stage only related files.
- Write descriptive commit message.
- Follow Conventional Commits format.

### 11. Tag (when appropriate)

- Tag version milestones.
- Use semantic versioning.

### 12. Next Sprint

- Do not begin next task until current is complete.

---

## Definition of Ready

A task is ready to begin when:

- [ ] Objective is clearly defined.
- [ ] Affected modules are identified.
- [ ] Dependencies are verified.
- [ ] No blocking issues exist.

## Definition of Done

A task is done when:

- [ ] Build passes.
- [ ] TypeScript: 0 errors.
- [ ] All tests pass.
- [ ] Runtime validation confirms functionality.
- [ ] Architecture boundaries respected.
- [ ] No new warnings introduced.
- [ ] Code committed and (optionally) tagged.
- [ ] Report generated (for sprints).
