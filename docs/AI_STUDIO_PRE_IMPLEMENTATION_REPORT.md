# AI Studio Pre-Implementation Report

**Date**: July 15, 2026  
**Task**: F-2 Pre-Implementation Analysis  
**Status**: COMPLETE — Ready for implementation

---

## Key Findings

| Question                    | Answer                                                 |
| --------------------------- | ------------------------------------------------------ |
| Backend API exists?         | ✅ YES — /api/lua/generate (Lua code generation)       |
| Streaming needed?           | ❌ NO — synchronous response <2s is sufficient         |
| WebSocket needed?           | ❌ NO — standard HTTP for chat, not pipeline           |
| Existing service to extend? | ✅ YES — add to aiEngine.ts (don't create new)         |
| Existing UI components?     | ✅ YES — AIChatPanel, PromptInput, AgentCard all ready |
| Agent list API exists?      | ✅ YES — getAgents() in systemApi.ts                   |
| New dependencies needed?    | ❌ NO                                                  |

---

## Recommended Approach (v1)

1. **Extend** `src/services/aiEngine.ts` with `generateLuaCode()` function
2. **Replace** hardcoded agents with `getAgents()` from systemApi
3. **Replace** setTimeout with real POST to `/api/lua/generate`
4. **Format** generated Lua scripts as markdown code blocks in chat
5. **Preserve** existing AIChatPanel + PromptInput + AgentCard components

---

## Estimated Effort

~3 hours (1 service function added + 1 page rewritten)

---

## Architecture Decision

**Use `/api/lua/generate` NOT `/api/generate/game`**

Reason: The full game generation pipeline (/api/generate/game) is designed for the Workspace feature (multi-step, 5-15s, produces blueprint+lua+assets+validation+export). The AI Studio chat needs quick, focused code generation — `/api/lua/generate` returns Lua scripts in <2s.

---

## Next Action

Implement F-2 following the plan at:
`docs/02-audits/integration/AI_STUDIO_IMPLEMENTATION_PLAN.md`
