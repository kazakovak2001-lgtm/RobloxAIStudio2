# Knowledge Base Implementation Plan

**Date**: July 15, 2026  
**Task**: F-7 (Knowledge Base UI)  
**Status**: PRE-AUDIT COMPLETE — Ready for implementation

---

## 1. Backend API Analysis

### Available Endpoints (server/src/routes/knowledge.ts)

| Endpoint                 | Method | Input              | Output                                                | Use Case                  |
| ------------------------ | ------ | ------------------ | ----------------------------------------------------- | ------------------------- |
| /api/knowledge/patterns  | GET    | ?type= (optional)  | GamePattern[]                                         | List all learned patterns |
| /api/knowledge/prompts   | GET    | ?agent= (optional) | PromptRecord[] + stats                                | Top prompt rankings       |
| /api/knowledge/search    | GET    | ?genre=&systems=   | SimilarityResult[]                                    | Search knowledge base     |
| /api/knowledge/store     | POST   | GenerationRecord   | { success }                                           | Store new learning        |
| /api/knowledge/recommend | GET    | ?genre=&systems=   | { similarProjects, recommendedPatterns, bestPrompts } | Get recommendations       |

### Key Types (KnowledgeTypes.ts)

```typescript
GamePattern { id, type (PatternType), name, description, scripts[], dependencies[], genre[], successRate, usageCount, averageScore, createdAt, updatedAt }
PatternType = "inventory" | "quest" | "combat" | "dialogue" | "economy" | "save" | "lobby" | "multiplayer" | "progression" | "ui"
PromptRecord { id, promptId, agentType, genre, tokenUsage, cost, repairCount, playtestScore, successRate, usageCount, createdAt }
SimilarityResult { projectId, score, matchedSystems[], matchedGenre, recommendedPatterns[] }
```

### Answers to Key Questions

| Question               | Answer                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| CRUD operations?       | **Read-heavy**: list patterns, list prompts, search, recommend. Create via `store`. No update/delete exposed. |
| Search?                | ✅ YES — `/search` with genre + systems filters                                                               |
| Pagination?            | ❌ NO — returns all (top 20 for prompts)                                                                      |
| Tagging/categories?    | ✅ YES — PatternType (10 categories) + genre arrays                                                           |
| Versioning?            | ❌ NO — records are append-only                                                                               |
| Project-specific?      | ✅ YES — records have projectId, search by genre/systems                                                      |
| AI Studio integration? | YES — recommendations can inform generation prompts                                                           |
| Workspace integration? | YES — learn from completed generations                                                                        |

---

## 2. Frontend Architecture Decision

### Placement: **New Page** (/knowledge)

**Reasoning**:

- Knowledge Base is a **standalone resource** — not tied to a specific project/blueprint
- Users browse patterns/prompts across ALL projects
- Doesn't need pipeline context (unlike Simulation/Economy)
- Fits naturally in sidebar navigation (between Analytics and Settings)
- Other "browse" features (Projects, Analytics) are pages, not panels

**NOT a Workspace panel because**:

- Knowledge Base is cross-project (Workspace is per-project)
- Content is read-heavy (browsing/searching), not action-oriented
- Doesn't require active blueprint

---

## 3. Implementation Plan

### Phase A: Create src/services/knowledgeApi.ts

Functions:

- `getPatterns(type?)` → GET /api/knowledge/patterns
- `getPrompts(agent?)` → GET /api/knowledge/prompts
- `searchKnowledge(genre?, systems?)` → GET /api/knowledge/search
- `getRecommendations(genre, systems)` → GET /api/knowledge/recommend

Types (mirror backend):

- `GamePattern`
- `PatternType`
- `PromptRecord`
- `KnowledgeRecommendation`

### Phase B: Create src/pages/KnowledgePage.tsx

Layout:

```
KnowledgePage
├── Header: "Knowledge Base" + search input
├── Tab navigation: Patterns | Prompts | Recommendations
├── Patterns tab:
│   ├── Filter by PatternType (10 categories)
│   ├── Pattern cards (name, type badge, success rate bar, usage count)
│   └── Empty state
├── Prompts tab:
│   ├── Filter by agent
│   ├── Prompt cards (agentType, genre, score, cost)
│   └── Stats summary
├── Recommendations tab:
│   ├── Genre + systems input
│   ├── Similar projects list
│   ├── Recommended patterns
│   └── Best prompts
└── Loading / Error states
```

### Phase C: Add route

In `src/app/router/index.tsx` — add lazy-loaded route: `/knowledge` → KnowledgePage

### Phase D: Add sidebar navigation

In `src/shared/ui/layout/Sidebar.tsx` — add navigation item for Knowledge Base (after Analytics, before Settings).

### Phase E: Tests

`src/services/__tests__/knowledgeApi.test.ts`

---

## 4. Component Reuse

| Need            | Existing                | Import             |
| --------------- | ----------------------- | ------------------ |
| Layout          | AppShell, Workspace     | @/shared/ui/layout |
| Cards           | Card                    | @/shared/ui/Card   |
| Category badges | Badge                   | @/shared/ui/Badge  |
| Action buttons  | Button                  | @/shared/ui/Button |
| Tab navigation  | Tabs                    | @/shared/ui/Tabs   |
| Loading         | Loader                  | @/shared/ui/Loader |
| Search input    | Input                   | @/shared/ui/Input  |
| Progress bars   | CSS (same as Analytics) | Inline             |

**Tabs component** already exists in shared/ui — perfect for Patterns / Prompts / Recommendations tabs.

---

## 5. Files to Create/Modify

| File                                          | Action                        |
| --------------------------------------------- | ----------------------------- |
| `src/services/knowledgeApi.ts`                | CREATE — API service          |
| `src/pages/KnowledgePage.tsx`                 | CREATE — new page             |
| `src/app/router/index.tsx`                    | MODIFY — add /knowledge route |
| `src/shared/ui/layout/Sidebar.tsx`            | MODIFY — add nav item         |
| `src/services/__tests__/knowledgeApi.test.ts` | CREATE — tests                |

---

## 6. Effort Estimate

| Task                     | Effort         |
| ------------------------ | -------------- |
| Create knowledgeApi.ts   | 30 min         |
| Create KnowledgePage.tsx | 2.5 hours      |
| Add route + sidebar nav  | 15 min         |
| Tests                    | 30 min         |
| Documentation            | 30 min         |
| **Total**                | **~4.5 hours** |

---

## 7. Risks

| Risk                                 | Level  | Mitigation                                       |
| ------------------------------------ | ------ | ------------------------------------------------ |
| Empty knowledge base (no data)       | MEDIUM | Graceful empty states per tab                    |
| No pagination for large datasets     | LOW    | Backend returns limited results (top 20 prompts) |
| New page requires route + nav update | LOW    | Simple additions to existing files               |

---

## 8. Definition of Done

- [ ] knowledgeApi.ts created (4 functions + types)
- [ ] KnowledgePage.tsx with 3 tabs + states
- [ ] Route added (/knowledge)
- [ ] Sidebar nav item added
- [ ] Tests pass (5+ assertions)
- [ ] TypeScript PASS
- [ ] Vite PASS
- [ ] Documentation updated
