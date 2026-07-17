# AI Workspace Conversation Capability Audit

**Date**: July 17, 2026  
**Status**: Audit complete

---

## Answers

### 1. Does conversation history already exist?

**YES — frontend only.** `AiStudioPage.tsx` maintains `messages: ChatMessage[]` array. But it's never sent to the backend. Lost on page refresh.

### 2. Is chat UI only displaying without sending context?

**YES.** `handleSubmit()` sends only the current prompt: `generateLuaCode({ prompt: currentPrompt })`. Previous messages are ignored.

### 3. Does backend receive previous messages?

**NO.** `/api/lua/generate` receives `{ gameName, genre, systems, features }`. No messages/history/context field.

### 4. Can existing AI providers handle multi-turn?

**YES.** All providers (OpenAI, Anthropic, OpenRouter, Groq) use chat/completions API with `messages: [{role, content}]`. But they're currently called with a single user message only: `messages: [{ role: "user", content: prompt }]`.

### 5. Smallest change for contextual conversations?

**Three layers:**

1. Frontend: Send `messages[]` to backend (already exists in state)
2. Backend: New chat endpoint that accepts messages array, routes to LLM
3. Provider: Serialize messages into prompt string (or extend interface to accept array)

---

## Root Cause

| Layer            | Current                     | Needed                              |
| ---------------- | --------------------------- | ----------------------------------- |
| Frontend state   | ✅ `messages[]` maintained  | Send to backend                     |
| Frontend request | ❌ Only current prompt sent | Include history                     |
| Backend endpoint | ❌ Template engine (no LLM) | LLM-backed chat endpoint            |
| LLM interface    | `generate(prompt: string)`  | `generate(messages[])` or serialize |
| Persistence      | ❌ In-memory only           | Use existing MemoryEngine           |

---

## Existing Reusable Systems

- `messages[]` state (AiStudioPage) — conversation history
- `LLMProvider` + 5 implementations — chat-capable providers
- `BaseAgent.generateWithRetry()` — reliable LLM calls
- `MemoryEngine` / `ProjectMemory` — session state persistence
- `AgentRegistry` — could host a "ChatAgent"

## What Does NOT Exist

- Chat-specific API endpoint
- Multi-message LLM call format
- Session persistence for chat
- Context window management (trimming old messages)
