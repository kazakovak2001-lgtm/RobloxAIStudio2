# Workflow Integration Audit

**Date**: July 17, 2026  
**Purpose**: Map existing development workflow and identify AI Controller integration points.

---

## Current Development Workflow

### Git Hooks (Husky)

| Hook         | Script                                 | Purpose                                |
| ------------ | -------------------------------------- | -------------------------------------- |
| `pre-commit` | `npm run validate` + `npx lint-staged` | Validates before commit                |
| `commit-msg` | `npx commitlint --edit`                | Conventional commit format enforcement |

### CI Pipeline (GitHub Actions)

| Job                   | Command                                | Gate         |
| --------------------- | -------------------------------------- | ------------ |
| TypeScript Check      | `npx tsc --noEmit` (frontend + server) | ✅ Required  |
| ESLint                | `npm run lint`                         | ✅ Required  |
| Prettier              | `npm run format:check`                 | ✅ Required  |
| Test Suite            | `npm run test`                         | ✅ Required  |
| Repository Validation | `npm run validate`                     | ✅ Required  |
| Commit Lint           | `npx commitlint --from..--to`          | PR only      |
| Merge Gate            | All above pass                         | Blocks merge |

### Validation Scripts

| Script                     | Purpose                     | When Run                |
| -------------------------- | --------------------------- | ----------------------- |
| `validate-architecture.ts` | Dual-root boundary check    | Part of `npm run build` |
| `validate-boundaries.ts`   | Domain import firewall      | Part of `npm run build` |
| `scan-imports.ts`          | Dependency graph generation | Manual / CI             |
| `validate.ts`              | General validation          | pre-commit hook + CI    |

### Lint-Staged (on commit)

```json
"*.{ts,tsx}": ["eslint --fix", "prettier --write"]
```

---

## Integration Points for AI Controller

### Option A: Pre-Commit Hook Enhancement (NOT RECOMMENDED)

**Why not**: Pre-commit hooks run on every commit. Calling an API endpoint adds latency and requires the server to be running. This would break offline development.

### Option B: CI Pipeline Step (RECOMMENDED for enforcement)

Add a `pre-check` job to `.github/workflows/ci.yml`:

```yaml
ai-controller-check:
  name: AI Pre-Implementation Check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx tsx scripts/validate-controller.ts
```

**Why**: Runs on PR, doesn't block local development, catches issues before merge.

### Option C: Kiro Integration (RECOMMENDED for development-time)

The AI Controller API can be called by Kiro during task execution. When Kiro creates a spec task for a new component, it calls `POST /api/controller/pre-check` first. See: `docs/KIRO_CONTROLLER_INTEGRATION.md`

### Option D: Manual Developer CLI (RECOMMENDED for quick checks)

```bash
npx tsx scripts/pre-check.ts "I want to create a new Analytics module"
```

Simple CLI wrapper around the pre-check logic (no server needed).

---

## Recommended Approach

**Layer 1 (immediate)**: Developer CLI tool — no server dependency  
**Layer 2 (recommended)**: Kiro steering integration — automatic pre-check before tasks  
**Layer 3 (future)**: CI enforcement — WARN on PRs that skip pre-check

Do NOT add to pre-commit hooks (too slow, requires server).
