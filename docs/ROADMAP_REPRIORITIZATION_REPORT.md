# Roadmap Reprioritization Report

**Date**: July 15, 2026  
**Trigger**: Phase 2 Product Expansion Planning  
**Status**: COMPLETE

---

## Summary of Changes

| Item               | Original Priority | New Priority         | Reason                                                 |
| ------------------ | ----------------- | -------------------- | ------------------------------------------------------ |
| F-7 Knowledge Base | Sprint 17         | **Sprint 15 (next)** | Simplest, no deps, establishes standalone page pattern |
| F-8 Playtesting    | Sprint 18-19      | **Sprint 15-16**     | Builds on F-4, high value, parallel with F-7           |
| F-6 Autonomous     | Sprint 15-16      | **Sprint 16**        | Higher complexity, moved after quick wins              |
| F-11 Storage       | Future            | **Sprint 17-18**     | Prerequisite for F-10 and F-9                          |
| F-10 Auth          | Future            | **Sprint 19-20**     | Requires F-11, prerequisite for F-12                   |
| F-9 Multi-Project  | Future            | **Sprint 21-22**     | Requires F-10 + F-11                                   |
| F-12 Collaborative | Experimental      | **Sprint 23+**       | Requires everything above                              |

---

## New Roadmap Order

| Sprint | Feature                     | Type           | Effort     |
| ------ | --------------------------- | -------------- | ---------- |
| 15     | F-7 Knowledge Base UI       | Quick win      | 3h         |
| 15-16  | F-8 Playtesting Dashboard   | Quick win      | 4h         |
| 16     | F-6 Autonomous Pipeline     | Feature        | 6h         |
| 17-18  | F-11 Persistent Storage     | Infrastructure | 2 sprints  |
| 19-20  | F-10 Real Authentication    | Infrastructure | 2 sprints  |
| 21-22  | F-9 Multi-Project Workspace | Platform       | 2 sprints  |
| 23+    | F-12 Collaborative Dev      | Experimental   | 3+ sprints |

---

## Rationale

1. **Quick wins first** (F-7, F-8) — maintain development momentum, deliver visible features fast
2. **Complex features after simple ones** (F-6 after F-7/F-8) — F-6 is the most complex "Should Have"
3. **Infrastructure before platform** (F-11 before F-10) — persistent storage is prerequisite for real auth
4. **Platform features last** (F-9, F-12) — require auth + storage foundation

---

## Next Action

**Implement F-7: Knowledge Base UI**

- Backend `/api/knowledge` ready
- Simple CRUD page (list, view, create entries)
- ~3 hours estimated
- No dependencies on other features
