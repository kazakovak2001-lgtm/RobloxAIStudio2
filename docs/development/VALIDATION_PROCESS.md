# Validation Process

**Reference:** See `AI_DEVELOPMENT_GOVERNANCE.md` Section 7 for the full checklist.

---

## Required Validation Steps

Every version must pass ALL of these checks before it can be considered complete.

### 1. TypeScript Compilation

```bash
# Frontend
npx tsc --noEmit

# Backend
npx tsc --project server/tsconfig.json --noEmit
```

**Expected:** Exit code 0, zero errors.

### 2. Architecture Boundary Validation

```bash
npx tsx scripts/validate-architecture.ts
```

**Expected:** System State: STABLE, Exit code 0.

### 3. Import Boundary Firewall

```bash
npx tsx scripts/validate-boundaries.ts
```

**Expected:** 0 critical violations, Exit code 0.

### 4. Import Graph Scan (Diagnostic)

```bash
npx tsx scripts/scan-imports.ts
```

**Expected:** Report generated to `import-graph.json`. Review circular dependencies.

### 5. ESLint (When Configured)

```bash
npm run lint
```

**Expected:** 0 errors, 0 warnings.

### 6. Build Verification

```bash
npm run build:server
```

**Expected:** Clean compilation with no errors.

---

## Failure Handling

If any validation step fails:

1. **Fix the issue** within the current scope
2. **Re-run all validations** from the beginning
3. **Do NOT commit** until all checks pass
4. If the issue is outside current scope, document it in the version report under "Known Issues"

---

## Automation

The following npm scripts run validation:

| Script                        | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `npm run validate:arch`       | Architecture structure validator                      |
| `npm run validate:boundaries` | Import boundary firewall                              |
| `npm run scan:imports`        | Full dependency graph scan                            |
| `npm run typecheck`           | Frontend + backend tsc                                |
| `npm run ci`                  | Full CI pipeline (typecheck + lint + validate + test) |
