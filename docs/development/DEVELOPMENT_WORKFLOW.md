# Development Workflow

**Reference:** See `AI_DEVELOPMENT_GOVERNANCE.md` (repository root) for the canonical governance rules.

---

## Version-by-Version Development

Every change to this repository follows a structured version workflow:

1. **Scope Definition** — Clear objectives for the version
2. **Implementation** — Code changes within scope only
3. **Validation** — TypeScript compilation, boundary checks
4. **Documentation** — Version report and validation proof
5. **Commit** — Atomic, Conventional Commits format

---

## Branching Strategy

- `main` — stable, validated code only
- Feature branches for multi-step work
- Tags for each version milestone (e.g., `v1.8-runtime`, `v1.9-governance`)

---

## Commit Format

```
type(scope): brief description

- Detail line 1
- Detail line 2
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Pre-Commit Checks

Before committing, verify:

```bash
npx tsc --project server/tsconfig.json --noEmit
npx tsc --noEmit
npx tsx scripts/validate-boundaries.ts
npx tsx scripts/validate-architecture.ts
```

All must exit with code 0.

---

## Post-Implementation

After completing a version:

1. Generate version report in `reports/`
2. Update `repository_manifest.json` if version numbers change
3. Tag the commit with the version identifier
