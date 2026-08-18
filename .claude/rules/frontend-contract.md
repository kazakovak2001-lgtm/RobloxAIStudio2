---
description: Cross-repo API contract consistency between the canonical backend and the separate canonical Frontend repository.
globs:
  - "server/src/routes/**"
  - "server/src/api/**"
  - "server/src/types/**"
  - "docs/00-project-control/FRONTEND_CUTOVER.md"
---

# Frontend contract

## Repository facts

- **`RobloxAIStudio2`** — canonical backend/runtime. This repo.
- **`../Frontend`** — canonical frontend. Separate git repository, own `main`, own toolchain (Vite/TS).
- Any embedded/legacy frontend inside this repo is **obsolete**. Do not revive it, extend it, restore it, import from it, or cite it as the contract.
- Do not copy Frontend source into the backend repo, or vice versa. They are coordinated, not merged.

## Establish the contract before changing it

For any API-surface change, read both sides first. Trace the whole chain and record what is actually there:

```
backend route  →  request schema/type  →  response schema/type
               →  frontend API client  →  frontend TS type
               →  UI consumer          →  auth / status / error handling
```

Never edit both repos speculatively from an assumed shape. Produce the gap first, then change.

## Drift classes to check

- **Endpoint** — path, method, versioning prefix
- **Field** — name, presence, casing (`snake_case` vs `camelCase` is a real and recurring source of drift here)
- **Enum** — value sets that diverge, or a backend value the frontend cannot render
- **Nullability** — optional/`| null` on one side only
- **Auth** — which routes require credentials, and what the client actually sends
- **Status codes** — what the backend returns vs what the client branches on
- **Error shape** — the failure envelope, not just the success one

Failure and empty-state shapes drift more than success shapes, because they are exercised less. Check them explicitly.

## Changing the contract

- Prefer additive changes. A removed or renamed field is a breaking change to a separately-deployed client.
- Backend and Frontend deploy independently — assume a window where old client meets new server, and vice versa. State which direction is safe.
- Update the frontend types and client in the same coordinated effort as the backend schema, but as **separate commits in separate repos**, each independently reviewable.
- Do not silently change a status code or error envelope; consumers branch on those.
- Large contract migrations (typed contract layer, OpenAPI, generated clients) are their own approved slice — never a side effect of a feature change.

## Reference

- `docs/00-project-control/FRONTEND_CUTOVER.md` — backend-side cutover authority
- `../Frontend/AGENTS.md`, `../Frontend/FRONTEND_BACKEND_INTEGRATION_STATUS.md` — frontend-side integration status

Verify both against current code; either may lag.
