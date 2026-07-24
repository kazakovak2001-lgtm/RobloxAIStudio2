# Frontend contract alignment

## Purpose

`kazakovak2001-lgtm/Frontend` consumes this repository as its only backend. The integration keeps UI-specific mapping in the frontend while this project owns domain behavior, persistence, authentication, execution and Roblox Studio transport.

## Aligned contracts

| Domain            | Contract                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | Shared `AuthService` singleton, httpOnly access/refresh cookies, refresh rotation, profile and preferences                                                                                                                            |
| Projects          | Owner-scoped CRUD with frontend fields (`gameType`, difficulty, players, audience, cover and lifecycle status)                                                                                                                        |
| Generation        | Start response with canonical `executionId`, status polling, history updates and project lifecycle transitions                                                                                                                        |
| Realtime          | Authenticated Socket.IO handshake, project rooms and payloads containing `projectId`, timestamp and canonical pipeline ID                                                                                                             |
| Chat              | Project conversations and persisted user/assistant messages                                                                                                                                                                           |
| Workspace modules | System, analytics, knowledge, simulation, economy, concept, planning, generation, compile, Lua/assets, world, lifecycle, memory, evaluation, playtest, repair, collaboration, domain, autonomous, distributed runtime and diagnostics |
| Roblox Studio     | Project connection status, guarded synchronization and deterministic manifest export                                                                                                                                                  |
| Controller        | Health, pre-check, architecture and duplicate checks without crossing the controller/provider boundary                                                                                                                                |

## API envelope

New frontend-facing routes return one of:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": "Human-readable message" }
```

The frontend adapter also supports legacy endpoints that return a successful JSON object directly. HTTP status remains authoritative; validation and disconnected external services use explicit 4xx responses.

## Authentication and realtime

The browser access token cookie is root-scoped because Socket.IO handshakes use `/socket.io`, not `/api`. The refresh cookie remains restricted to `/api/platform/auth/refresh`. Production sockets validate the same `AuthService` session as REST requests.

Clients join and leave rooms with:

```text
project:join  { projectId }
project:leave { projectId }
```

Pipeline and step events are emitted to `project:<projectId>`. Every project event includes `projectId`; `pipelineId` matches the REST generation `executionId`.

## Production runtime

```bash
npm run build:server
npm start
```

The start command loads the compiled ESM output through the production `tsx` loader so existing extensionless imports resolve on current Node releases. `tsx` is therefore a runtime dependency.

Recommended production variables:

```env
NODE_ENV=production
FRONTEND_URL=https://studio.example.com
STORAGE_PROVIDER=postgres
DATABASE_URL=postgres://...
```

Configure at least one supported LLM provider key for non-stub AI output. Configure the email provider for password-reset delivery and connect a Roblox Studio plugin session for live sync.

## Verification

The paired frontend integration suite exercises 40 production-mode checks covering cookie auth, REST contracts, project-room Socket.IO delivery, cross-user isolation and all user-facing module groups:

```bash
# backend
npm test
npm run typecheck
npm run validate:arch
npm run validate:boundaries
npm run build:server

# frontend, against the running backend
npm run test:e2e:integration
```

The Studio sync test intentionally expects a guarded error when no plugin bridge is connected; this confirms the UI does not report a false successful synchronization.
