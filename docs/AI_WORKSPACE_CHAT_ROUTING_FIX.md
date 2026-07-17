# AI Workspace Chat Routing Fix

**Date**: July 17, 2026 | **Status**: FIXED ✅

## Fixed

1. Removed `generateLuaCode()` fallback from chat submit — shows error instead
2. Intent detection uses RegExp (was broken `includes()` with literal regex strings)

## Files Changed

- `src/pages/AiStudioPage.tsx` — removed fallback + dead code
- `server/src/routes/aiChat.ts` — RegExp patterns

## Validation: TypeScript ✅ | Build ✅ (14.85s)
