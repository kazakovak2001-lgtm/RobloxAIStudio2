# AI Studio Chat Bug Report — "Thinking" Hangs Indefinitely

**Date**: July 17, 2026  
**Severity**: HIGH  
**Status**: Root cause identified, fix defined

---

## Root Cause

**Response shape mismatch** + **missing error handling**.

Backend returns `{ artifacts: [...] }` but frontend accesses `data.scripts.slice(0, 3)`. Since `data.scripts` is `undefined`, a TypeError is thrown. There is no try/catch in `handleSubmit()`, so `setGenerating(false)` is never reached. The UI stays in "thinking" state forever.

---

## Failure Point

**File**: `src/pages/AiStudioPage.tsx`, line ~46  
**Expression**: `data.scripts.slice(0, 3)`  
**Error**: TypeError — `scripts` is undefined (backend field is `artifacts`)

---

## Field Mismatch

| Frontend expects | Backend returns       |
| ---------------- | --------------------- |
| `data.scripts`   | `data.artifacts`      |
| `script.size`    | `artifact.sizeBytes`  |
| `script.type`    | `artifact.scriptType` |
| `data.gameName`  | Not included          |
| `data.genre`     | Not included          |

---

## Key Finding

No LLM is involved. `LuaGenerationEngine` is synchronous template-based generation. Always succeeds in ~10ms. The bug is purely a frontend field mapping error.

---

## Minimal Fix

**Option A** (in `src/services/aiEngine.ts`): Map `artifacts` to `scripts` in the response transform.

**Option B** (in `src/pages/AiStudioPage.tsx`): Wrap `handleSubmit` body in try/finally to guarantee `setGenerating(false)`.

**Recommended**: Apply both.

---

## Files Involved

- `src/pages/AiStudioPage.tsx` — crash site
- `src/services/aiEngine.ts` — missing response mapping
- `server/src/routes/luaGeneration.ts` — returns raw engine output
- `server/src/generation/lua/LuaGenerationEngine.ts` — returns `artifacts`

## No New Architecture Required

Fix is ~15 lines total across 2 existing files.
