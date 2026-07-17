# Engineering Handbook Update

**Project**: Roblox AI Studio Control Center  
**Generated**: July 15, 2026 (Sprint 7)  
**Purpose**: Document what changed from the original Engineering Handbook  
**Status**: CURRENT ✅

---

## Overview

This document records all deviations and updates between the original Engineering Handbook specification and the current repository state after completing Sprints 1–7.

---

## Section 2: Project Structure — UPDATED ✅

The repository structure now matches the handbook's target architecture.

### Changes Made

| Original (Pre-Migration)  | Current (Post-Migration)                      | Sprint   |
| ------------------------- | --------------------------------------------- | -------- |
| `shared/` at project root | `src/shared/`                                 | Sprint 3 |
| `src/contexts/`           | `src/providers/`                              | Sprint 3 |
| `src/constants/` at root  | `src/shared/constants/`                       | Sprint 3 |
| `src/styles.css` (root)   | `src/styles/index.css`                        | Sprint 3 |
| No `src/app/` directory   | `src/app/` (config, providers, router)        | Sprint 3 |
| `src/components/ui/`      | Deleted (migrated to `src/shared/ui/`)        | Sprint 2 |
| `src/components/layout/`  | Deleted (migrated to `src/shared/ui/layout/`) | Sprint 2 |
| `src/layouts/`            | Deleted (consolidated to AppShell)            | Sprint 1 |
| `frontend-new/`           | Deleted                                       | Sprint 1 |
| `backup/`                 | Deleted                                       | Sprint 1 |

### Current Structure (Verified)

```
src/
├── app/              ← NEW (Sprint 3)
│   ├── config/
│   ├── providers/
│   └── router/
├── components/       (ErrorBoundary only)
├── features/
│   └── workspace/    ← REORGANIZED (Sprint 3)
├── hooks/
├── pages/
├── providers/        ← RENAMED from contexts/ (Sprint 3)
├── services/
├── shared/           ← MOVED from root (Sprint 3)
│   ├── constants/    ← MOVED from src/constants/ (Sprint 3)
│   ├── contracts/
│   ├── events/
│   ├── types.ts
│   └── ui/           ← MIGRATED from components/ui/ (Sprint 2)
├── styles/           ← REORGANIZED (Sprint 3)
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

---

## Section 6: Path Aliases — UPDATED ✅

### Changes Made

Path aliases are now fully configured and enforced.

**tsconfig.json**:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**vite.config.ts**:

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src')
  }
}
```

### Import Convention (Enforced Sprint 4)

| Context         | Strategy         | Example                                              |
| --------------- | ---------------- | ---------------------------------------------------- |
| Cross-directory | `@/` path alias  | `import { Button } from '@/shared/ui'`               |
| Intra-feature   | Relative path    | `import { AgentCard } from './components/AgentCard'` |
| Barrel exports  | Index re-exports | `import { usePipelineStream } from './hooks'`        |

---

## Section 1: Overview — NO CHANGES

Original handbook content remains accurate:

- Project name: Roblox AI Studio Control Center
- Technology: React + TypeScript + Vite + Tailwind CSS
- Purpose: AI-powered game development tool with Roblox Studio integration

---

## Section 3: Components — NO CHANGES NEEDED

Original handbook guidance on component patterns still applies:

- Functional components with TypeScript interfaces
- Props destructuring with default values
- Composition over inheritance
- Single responsibility principle

**Note**: Component implementations now comply with design system tokens (Sprint 6).

---

## Section 4: State Management — NO CHANGES NEEDED

Original handbook pattern still applies:

- Context-based global state (AuthContext, ToastProvider)
- Local state per component (useState, useEffect)
- No external state library (Redux, Zustand)

**Note**: Contexts renamed to "providers" (directory rename Sprint 3), but pattern unchanged.

---

## Section 5: Services — NO CHANGES NEEDED

Original handbook service patterns still apply:

- Axios-based REST client
- Socket.IO for real-time communication
- Service modules per domain (aiEngine, projectService, etc.)
- Error handling via try/catch with toast notifications

---

## Section 7: Styling — NO CHANGES NEEDED

Original handbook Tailwind CSS guidelines still apply:

- Utility-first approach
- Custom design tokens in tailwind.config.js
- `cn()` utility for conditional classes (clsx + tailwind-merge)

**Note**: Design system tokens now enforced across all components (Sprint 6).

---

## Section 8: Testing — NO CHANGES (DEBT ITEM)

Original handbook testing guidance remains aspirational:

- ⚠️ No test framework configured (Technical Debt #1)
- Handbook recommends Vitest — not yet implemented
- `src/services/__tests__/` directory exists but is empty/placeholder

---

## Section 9: Deployment — NO CHANGES NEEDED

Original handbook deployment guidance still applies:

- Vite production build (`vite build`)
- Environment variables via `.env`
- Backend API at localhost:5000

---

## Summary of Required Handbook Updates

| Section              | Status     | Action Needed                       |
| -------------------- | ---------- | ----------------------------------- |
| 1. Overview          | ✅ Current | None                                |
| 2. Project Structure | ⚠️ Updated | Update paths to match new structure |
| 3. Components        | ✅ Current | None                                |
| 4. State Management  | ✅ Current | Note: contexts/ → providers/ rename |
| 5. Services          | ✅ Current | None                                |
| 6. Path Aliases      | ⚠️ Updated | Document @/ configuration           |
| 7. Styling           | ✅ Current | None                                |
| 8. Testing           | ⚠️ Debt    | Still aspirational                  |
| 9. Deployment        | ✅ Current | None                                |

---

## Verification

- ✅ All structure changes verified against repository
- ✅ Path alias configuration verified in tsconfig.json and vite.config.ts
- ✅ Import patterns verified across all source files
- ✅ Only Sections 2 and 6 require handbook text updates
- ✅ No breaking changes to development workflow
