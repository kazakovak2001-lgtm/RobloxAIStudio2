# AI Workspace Conversational Architecture

**Date**: July 17, 2026  
**Status**: Phase 1 implemented, Phase 2 designed (not yet built)

---

## Current Flow (Implemented)

```
Frontend messages[] → POST /api/ai/chat → serialize → LLMProvider.generate() → response
```

Endpoint: `server/src/routes/aiChat.ts`  
Frontend: `src/pages/AiStudioPage.tsx` sends full history  
Fallback: `/api/lua/generate` (template engine, always works)

---

## Request/Response Contract

**POST /api/ai/chat**

```json
Request:  { "messages": [{"role":"user","content":"..."}], "gameContext": {"name":"","genre":""} }
Response: { "success": true, "data": {"role":"assistant","content":"...","model":"gpt-4o"} }
```

---

## Context Storage

| Phase  | Storage                             | Persistence     |
| ------ | ----------------------------------- | --------------- |
| Now    | Frontend `messages[]` React state   | Lost on refresh |
| Future | Existing `MemoryEngine` per session | Persistent      |

---

## Agent Delegation (Future Phase 2)

When implemented, the chat handler will detect intent and delegate:

- "generate scripts" → `agentRegistry.executeAgent("lua_generator", ...)`
- "design architecture" → `agentRegistry.executeAgent("roblox_architect", ...)`
- General conversation → direct LLM call (current behavior)

No new agent framework needed. Uses existing `AgentRegistry`.

---

## Migration Path

`/api/lua/generate` is NEVER removed. Chat is additive.

- Phase 1 ✅: Conversation via LLM
- Phase 2: Agent delegation for specialized tasks
- Phase 3: Session persistence via existing MemoryEngine

---

## Files

| File                          | Status                         |
| ----------------------------- | ------------------------------ |
| `server/src/routes/aiChat.ts` | ✅ Created                     |
| `server/src/index.ts`         | ✅ Modified (+2 lines)         |
| `src/pages/AiStudioPage.tsx`  | ✅ Modified (sends messages[]) |

No new frameworks. No duplicate providers. Reuses existing infrastructure.
