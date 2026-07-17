# AI Workspace Agent Orchestration Design

**Date**: July 17, 2026  
**Status**: Design only — not yet implemented

---

## 1. Relevant Agents (7 of 16)

| Agent              | Role                                    | Trigger                           |
| ------------------ | --------------------------------------- | --------------------------------- |
| `game_designer`    | Mechanics, loop, progression            | "design", "game concept"          |
| `requirements`     | Structured requirements                 | "requirements", "features needed" |
| `roblox_architect` | Folder structure, services, data models | "structure", "architecture"       |
| `lua_generator`    | Lua/Luau code generation                | "generate", "code", "script"      |
| `ui_generator`     | UI layouts, HUD                         | "UI", "HUD", "menu"               |
| `asset_planner`    | 3D models, sounds, animations           | "assets", "models"                |
| `documentation`    | README, API docs                        | "docs", "README"                  |

## 2. Input/Output Contracts

All agents accept `{ blueprint: {name,genre,...}, ...context }` and return structured JSON (mechanics, scripts, architecture, etc.). No modifications needed.

## 3. Intent Detection

Latest user message → keyword match → agent selection.
No match → fall through to direct LLM (current behavior).

## 4. Response Flow

```
User → detectIntent() → agentRegistry.executeAgent() → format result → chat response
```

## 5. Agent Extensions

**None needed.** All 7 agents already accept the right inputs and produce useful outputs.

## 6. Implementation (When Approved)

- Add `detectIntent()`, `buildAgentInput()`, `formatAgentResult()` to `aiChat.ts`
- Pass `agentRegistry` to `createAiChatRouter()`
- Change: 1 file modified, 0 new files
- Fallback: always responds via LLM if no agent matches

No new frameworks. No duplicate orchestration. Uses existing AgentRegistry.
