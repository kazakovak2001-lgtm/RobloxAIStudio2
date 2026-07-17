# Playtesting Implementation Plan

**Date**: July 15, 2026  
**Task**: F-8 (Playtesting Dashboard)  
**Status**: PRE-AUDIT COMPLETE

---

## Backend API

| Endpoint                 | Method | Input                                                | Output                |
| ------------------------ | ------ | ---------------------------------------------------- | --------------------- |
| /api/playtest/run        | POST   | { projectId, scripts[], assets[], dependencyGraph? } | PlaytestReport        |
| /api/playtest/:projectId | GET    | projectId param                                      | Stored PlaytestReport |

---

## Frontend Plan

### playtestApi.ts

- `runPlaytest(input)` → POST /api/playtest/run
- `getPlaytestReport(projectId)` → GET /api/playtest/:projectId

### PlaytestPanel.tsx

```
PlaytestPanel
├── Header: "Quality Playtest" + Run button
├── Overall Score (0-100) + classification badge
├── Score breakdown grid (6 categories: architecture, lua, assets, dependencies, gameplay, performance)
├── Performance estimate (init time, script count, risk areas)
├── Issues list (with severity + recommended fix)
├── Summary text
└── "Production Ready" / "Needs Work" / "Critical Issues" banner
```

### States

- idle: "Run Playtest" button
- running: Loader
- success: Full report
- error: Error + retry

### Workspace placement

Right column, after ValidationResults.

---

## Component Reuse

Card, Badge, Button, Loader — all from @/shared/ui. No new components.

---

## Definition of Done

- [ ] playtestApi.ts (2 functions + types)
- [ ] PlaytestPanel.tsx (4 states)
- [ ] Workspace.tsx modified (right column)
- [ ] Tests (5+ assertions)
- [ ] TypeScript PASS
- [ ] Vite PASS
- [ ] Docs updated
