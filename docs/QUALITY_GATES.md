# Quality Gates

**Project**: Roblox AI Studio Control Center  
**Date**: July 15, 2026  
**Status**: ACTIVE ✅

---

## Pre-Merge Requirements

Every PR must pass ALL of the following before merge:

| Gate                    | Tool       | Command                                           | Status    |
| ----------------------- | ---------- | ------------------------------------------------- | --------- |
| TypeScript compilation  | tsc        | `npx tsc --noEmit`                                | ✅ Active |
| Server TypeScript       | tsc        | `npx tsc --noEmit --project server/tsconfig.json` | ✅ Active |
| ESLint                  | eslint     | `npm run lint`                                    | ✅ Active |
| Prettier                | prettier   | `npm run format:check`                            | ✅ Active |
| Test Suite              | vitest     | `npm run test`                                    | ✅ Active |
| Repository Validation   | custom     | `npm run validate`                                | ✅ Active |
| Architecture Validation | custom     | `npm run validate:arch`                           | ✅ Active |
| Boundary Validation     | custom     | `npm run validate:boundaries`                     | ✅ Active |
| Commit Messages         | commitlint | conventional commits                              | ✅ Active |

---

## Local Pre-Commit (Automatic)

Triggered by Husky on every commit:

```
1. npm run validate (architecture check)
2. lint-staged:
   - ESLint --fix on staged .ts/.tsx
   - Prettier --write on staged files
```

---

## CI Pipeline (Automatic on Push/PR)

```
┌─────────────┐  ┌────────┐  ┌──────────┐  ┌──────┐  ┌──────────┐
│  Typecheck  │  │  Lint  │  │  Format  │  │ Test │  │ Validate │
└──────┬──────┘  └───┬────┘  └────┬─────┘  └──┬───┘  └────┬─────┘
       │             │            │            │            │
       └─────────────┴────────────┴────────────┴────────────┘
                                  │
                          ┌───────┴───────┐
                          │  Merge Gate   │
                          │  (all pass)   │
                          └───────────────┘
```

---

## Architecture Rules (Enforced)

### Import Rules

- Cross-directory imports MUST use `@/` path aliases
- Intra-feature imports MAY use relative paths
- No circular dependencies allowed

### Component Rules

- New UI components MUST be placed in `src/shared/ui/`
- Feature-specific components go in `src/features/[name]/components/`
- Check Component Registry before creating new components

### Design System Rules

- Use design tokens: `success-*`, `error-*`, `warning-*`, `info-*`
- Use `brand-*` for primary colors, `slate-*` for neutrals
- Use `rounded-lg`, `rounded-2xl`, `rounded-full` for radius
- Never use raw `green-*`, `red-*`, `yellow-*` for status indicators

### Feature Rules

- New features go in `src/features/[name]/`
- Must have: components/, hooks/, types/, index.ts
- Must register in Feature Registry

---

## Documentation Rules

### On Every PR That Changes:

- **Components**: Update Component Registry
- **Features**: Update Feature Registry
- **Architecture**: Update Architecture Map
- **Dependencies**: Update relevant docs

---

## Failure Response

If any gate fails:

1. Fix the issue locally
2. Re-run the failing check
3. Push the fix
4. CI will re-run automatically

If architecture validation fails:

1. Check Engineering Handbook for correct patterns
2. Review Architecture Map for dependency direction
3. Fix import paths or file locations
4. Do NOT bypass validation scripts
