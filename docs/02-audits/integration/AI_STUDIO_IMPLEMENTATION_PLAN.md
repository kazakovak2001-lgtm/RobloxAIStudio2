# AI Studio Implementation Plan

**Date**: July 15, 2026  
**Task**: F-2 (Connect AI Studio Chat to Backend)  
**Status**: PRE-AUDIT COMPLETE — Ready for implementation

---

## Answers to Key Questions

### 1. What is the intended AI Studio workflow?

User enters a prompt → Backend generates Lua code/game content → Response displayed in chat with code highlighting.

Two viable workflows:

- **Simple (recommended v1)**: User prompt → POST `/api/lua/generate` → Response with generated scripts → Display in chat
- **Full pipeline**: User prompt → POST `/api/generate/game` → Full end-to-end generation (blueprint+lua+assets+validation+export)

**Decision**: Use `/api/lua/generate` for v1. It's simpler, faster, and produces directly displayable Lua code. The full pipeline (`/api/generate/game`) is better suited for the Workspace feature (which already uses it).

### 2. Which backend endpoint should frontend use?

| Endpoint                    | Purpose                                              | Response Time | Best For                         |
| --------------------------- | ---------------------------------------------------- | ------------- | -------------------------------- |
| POST /api/lua/generate      | Generate Lua for specific systems                    | Fast (<2s)    | Quick code generation            |
| POST /api/lua/generate-full | Generate all core systems                            | Medium (3-5s) | Complete package                 |
| POST /api/generate/game     | Full pipeline (blueprint→lua→assets→validate→export) | Slow (5-15s)  | Full game generation (Workspace) |

**Recommended for AI Studio chat**: `/api/lua/generate` (quick, focused results)

### 3. Is streaming already supported?

**NO** — The Lua generation endpoints are synchronous (request → response). There is no SSE or chunked streaming for code generation.

**WebSocket streaming exists** for pipeline execution (Workspace uses `usePipelineStream`), but it's designed for multi-step pipeline progress — not for chat-style message streaming.

**Decision for v1**: Use standard fetch (POST → wait → display response). Show loading indicator during generation. No streaming needed for typical <2s responses.

### 4. Are websocket events required?

**NO** for the AI Studio chat. WebSocket events are used by:

- Workspace (pipeline progress)
- Real-time notifications

For AI Studio chat, standard HTTP request/response is sufficient. The response from `/api/lua/generate` is synchronous and fast enough.

### 5. What data model should chat messages use?

The `ChatMessage` interface already exists in `src/shared/ui/ai/AIChatPanel.tsx`:

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}
```

This is sufficient. For assistant messages, `content` will contain the generated Lua code (formatted with markdown code blocks for display).

### 6. How are generated artifacts represented?

Response from `/api/lua/generate`:

```typescript
{
  success: true,
  data: {
    projectId: string;
    gameName: string;
    genre: string;
    scripts: Array<{
      name: string;
      path: string;
      content: string;   // actual Lua code
      size: number;
      type: string;
    }>;
    totalScripts: number;
    totalSizeBytes: number;
    generationTimeMs: number;
    validationPassed: boolean;
  }
}
```

For chat display: Format scripts as markdown code blocks in the assistant message content.

### 7. Which existing frontend components can be reused?

| Component   | Location             | Purpose                            | Reusable?           |
| ----------- | -------------------- | ---------------------------------- | ------------------- |
| AIChatPanel | @/shared/ui/ai       | Chat message display               | ✅ Already imported |
| PromptInput | @/shared/ui/ai       | Prompt textarea with token counter | ✅ Already imported |
| AgentCard   | @/shared/ui/ai       | Agent display card                 | ✅ Already imported |
| Card        | @/shared/ui/Card     | Container                          | ✅ Already imported |
| Loader      | @/shared/ui/Loader   | Loading state                      | ✅ Available        |
| Badge       | @/shared/ui/Badge    | Status indicators                  | ✅ Available        |
| getAgents() | @/services/systemApi | Fetch real agent list              | ✅ Already exists   |

**NO new components needed.** All UI elements for the chat are already built.

---

## Implementation Plan

### Phase A: No new service needed

The `/api/lua/generate` endpoint can be called directly from the page using a simple fetch function (inline or add to existing `aiEngine.ts`). Since `aiEngine.ts` already has `runAgentPipeline()`, it's the natural home for a `generateLuaCode()` function.

**Option**: Add `generateLuaCode()` to existing `src/services/aiEngine.ts` (EXTENDS, not CREATE).

### Phase B: Update AiStudioPage.tsx

Replace:

1. Hardcoded `agents` array → `getAgents()` from `@/services/systemApi`
2. `setTimeout` simulation → Real POST to `/api/lua/generate`
3. Static agent status → Real agent data from backend
4. Console.log handlers → Actual agent selection logic (set selected agent context)

Add:

1. `useEffect` to fetch agents on mount
2. Loading state for initial agent fetch
3. Error handling for API failures
4. Format generated Lua code as markdown code blocks in chat messages

### Phase C: Chat → Generation Flow

```
1. User types prompt in PromptInput
2. User message added to chat (role: "user")
3. Loading state shown
4. POST /api/lua/generate with { projectId: "chat-session", gameName: prompt, genre: "from-prompt" }
5. Response received → format scripts as assistant message
6. Assistant message added to chat (role: "assistant")
7. Loading state cleared
```

---

## Effort Estimate

| Task                                                     | Effort       |
| -------------------------------------------------------- | ------------ |
| Add generateLuaCode() to aiEngine.ts                     | 15 min       |
| Update AiStudioPage.tsx (fetch agents + real generation) | 1.5 hours    |
| Error handling + edge cases                              | 30 min       |
| Testing/validation                                       | 30 min       |
| Documentation                                            | 30 min       |
| **Total**                                                | **~3 hours** |

---

## Files to Modify

| File                                                    | Action                                         |
| ------------------------------------------------------- | ---------------------------------------------- |
| `src/services/aiEngine.ts`                              | ADD `generateLuaCode()` function               |
| `src/pages/AiStudioPage.tsx`                            | MODIFY — replace setTimeout + hardcoded agents |
| `docs/00-project-control/CURRENT_STATE.md`              | UPDATE                                         |
| `docs/04-migrations/completed/ai-studio-integration.md` | CREATE                                         |

---

## Risk Assessment

| Risk                           | Level | Mitigation                                                   |
| ------------------------------ | ----- | ------------------------------------------------------------ |
| LLM not configured (stub mode) | LOW   | Backend returns mock data in stub mode — still works         |
| Response too large for chat    | LOW   | Truncate to first 3 scripts in chat, show "X more generated" |
| No streaming feels slow        | LOW   | Generation is typically <2s; loading indicator sufficient    |
| Agent list empty               | LOW   | Handle gracefully with "No agents registered" message        |

---

## Existing Resources (DO NOT RECREATE)

- `src/shared/ui/ai/AIChatPanel.tsx` — Chat display component ✅
- `src/shared/ui/ai/PromptInput.tsx` — Prompt input with token counter ✅
- `src/shared/ui/ai/AgentCard.tsx` — Agent card component ✅
- `src/services/systemApi.ts` — `getAgents()` function ✅
- `src/services/aiEngine.ts` — Place to add `generateLuaCode()` ✅
