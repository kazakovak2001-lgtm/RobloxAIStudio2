# AI Workflow Rules

These rules apply to ALL AI agent interactions with this project.

---

## Before Any Implementation

1. **Read** `docs/00-project-control/CURRENT_STATE.md`
2. **Check** existing implementation — search the repository
3. **Search** existing components in `src/shared/ui/` before creating new ones
4. **Search** existing services in `src/services/` before creating API clients
5. **Check** previous audits in `docs/02-audits/` and `docs/audits/`
6. **Check** `docs/00-project-control/DECISION_LOG.md` for related decisions
7. **Avoid** creating duplicate functionality

---

## Never

- Overwrite audit documents
- Delete architecture history
- Create duplicate components without analysis
- Ignore existing backend APIs when building frontend
- Skip build validation after changes
- Bypass quality gates (TypeScript, Vite, CI)

---

## Always

- Update `CURRENT_STATE.md` after significant changes
- Log architectural decisions in `DECISION_LOG.md`
- Check Component Registry before creating UI components
- Check Feature Registry before creating features
- Use @/ path aliases for cross-directory imports
- Use design tokens (success/error/warning, not green/red/yellow)
- Follow Engineering Handbook conventions
- Validate builds after every change

---

## Document Discovery Priority

When researching the project, read in this order:

1. `docs/00-project-control/CURRENT_STATE.md` — What is the current state?
2. `docs/00-project-control/ROADMAP_STATUS.md` — What's planned?
3. `docs/00-project-control/DECISION_LOG.md` — What was decided and why?
4. `docs/ENGINEERING_HANDBOOK.md` — What are the standards?
5. `docs/UPDATED_COMPONENT_REGISTRY.md` — What components exist?
6. `docs/UPDATED_FEATURE_REGISTRY.md` — What features exist?
7. `docs/UPDATED_ARCHITECTURE_MAP.md` — How does the system work?

---

## Reuse Before Create

Before creating ANY new:

- **Component**: Search `src/shared/ui/` → Is there an equivalent?
- **Service**: Search `src/services/` → Is there an API client already?
- **Hook**: Search `src/hooks/` → Does this logic exist?
- **Feature**: Check if backend already has the capability (`server/src/routes/`)
- **Page**: Check if a placeholder already exists that just needs wiring

---

## Backend API Awareness

The backend has 30 API route groups. Many are NOT connected to the frontend yet.
Before building a new backend endpoint, check `server/src/index.ts` — it likely already exists.

Currently unused backend routes (frontend not connected):

- /api/analytics, /api/simulate, /api/economy, /api/world
- /api/playtest, /api/knowledge, /api/autonomous, /api/repair
- /api/domain, /api/agents, /api/lua, /api/distributed
- /api/lifecycle, /api/compile, /api/platform
