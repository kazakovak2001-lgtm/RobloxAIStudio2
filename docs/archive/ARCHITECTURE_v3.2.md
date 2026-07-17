# Architecture — v3.2 Productization Layer

## New Platform Modules

```
server/src/platform/
├── users/
│   ├── UserTypes.ts          — Account tiers, limits, usage tracking
│   ├── UserRepository.ts     — CRUD + limit enforcement
│   └── index.ts
├── versioning/
│   ├── VersionHistory.ts     — Project version snapshots + rollback
│   └── index.ts
├── registry/
│   ├── AgentRegistryService.ts — Agent metadata, health, metrics
│   └── index.ts
└── index.ts
```

## Account Tiers

| Tier       | Projects  | Generations/Day | Tokens/Day | Storage   | Concurrent |
| ---------- | --------- | --------------- | ---------- | --------- | ---------- |
| Free       | 3         | 5               | 50K        | 50MB      | 1          |
| Starter    | 10        | 20              | 200K       | 200MB     | 2          |
| Pro        | 50        | 100             | 1M         | 1GB       | 5          |
| Enterprise | Unlimited | Unlimited       | Unlimited  | Unlimited | 20         |

## API Endpoints Added

- `POST /api/platform/users` — create account
- `GET /api/platform/users/:id` — get user
- `GET /api/platform/users/:id/limits` — check rate limits
- `GET /api/platform/versions/:projectId` — version history
- `POST /api/platform/versions/:projectId` — save version
- `GET /api/platform/registry/agents` — list active agents
- `GET /api/platform/registry/agents/:id` — agent details

## Monetization Architecture (Ready, Not Active)

```
User Request → Limit Check → Generation → Usage Tracking → Billing Event (future)
```

- Usage is tracked per-user per-day
- Tier limits enforced before generation starts
- Token/cost data accumulated for billing
- No payment integration yet — architecture only
