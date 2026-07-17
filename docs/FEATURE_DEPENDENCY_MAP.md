# Feature Dependency Map

**Date**: July 15, 2026

---

## Dependency Graph

```
                    ┌─────────────┐
                    │  F-11       │
                    │  Persistent │
                    │  Storage    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │   F-10    │ │  F-9  │ │   F-12    │
        │   Auth    │ │ Multi │ │  Collab   │
        │           │ │Project│ │           │
        └───────────┘ └───────┘ └───────────┘

Independent (no dependencies):
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│ F-1 │ │ F-2 │ │ F-3 │ │ F-4 │ │ F-5 │ │ F-6 │ │ F-7 │ │ F-8 │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

---

## Dependencies

| Feature                   | Depends On  | Reason                         |
| ------------------------- | ----------- | ------------------------------ |
| F-1 (Analytics)           | None        | Standalone data display        |
| F-2 (AI Chat)             | None        | Uses existing aiEngine service |
| F-3 (Plugin Manager)      | None        | Uses existing studioBridgeApi  |
| F-4 (Simulation)          | None        | New service, independent       |
| F-5 (Economy)             | None        | New page, independent          |
| F-6 (Autonomous)          | None        | Extension of workspace feature |
| F-7 (Knowledge Base)      | None        | New page, independent          |
| F-8 (Playtesting)         | F-4 (soft)  | Better with simulation data    |
| F-9 (Multi-Project)       | None        | UI-only, routing changes       |
| F-10 (Auth)               | F-11 (soft) | Needs persistent user storage  |
| F-11 (Persistent Storage) | None        | Backend infrastructure         |
| F-12 (Collaborative)      | F-10, F-11  | Needs auth + persistence       |

---

## Safe Parallel Tracks

Features that can be developed simultaneously:

- Track A: F-1 → F-4 → F-8 (Data & Insights)
- Track B: F-2 → F-6 (AI Capabilities)
- Track C: F-3 → F-5 → F-7 (Platform Services)
