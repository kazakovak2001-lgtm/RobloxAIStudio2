# Architecture Decision — CORE-1b Durable Runtime Records

**Date:** 2026-07-24

**Status:** Accepted and verified

## Decision

Use the single process-wide `StorageProvider` for canonical runtime records beyond identity and projects: game blueprints, blueprint versions, generation executions, project conversations, and conversation messages.

Retain the existing repository and HTTP contracts. Introduce no parallel ORM, route family, frontend adapter, or second persistence subsystem.

## Context

CORE-1a made authentication, ownership, projects, generation history, and API keys durable, but the canonical generation path still instantiated process-local blueprint storage and the chat service used module-level maps. Restarting a PostgreSQL-backed deployment could therefore restore the project while losing its blueprint, execution, and conversation state.

## Implementation

- Added `StorageBlueprintRepository` over the existing `StorageProvider` collections.
- Preserved `InMemoryBlueprintRepository` as a compatibility facade that resolves the configured provider during application bootstrap.
- Reworked `ChatPersistenceService` to use the configured provider instead of module-level maps.
- Rehydrated JSON date values before returning domain records.
- Cascaded deletion of blueprint versions/executions and conversation messages.
- Added deterministic provider-recreation coverage.
- Added a PostgreSQL 16 CI job that writes all canonical records, closes the first provider, reconstructs a second provider, reloads records, and verifies owner/foreign-user isolation.

## Consequences

- PostgreSQL deployments retain the complete canonical project runtime across application restarts.
- Existing API paths and response shapes remain stable.
- The standalone `Frontend` repository requires no CORE-1b compatibility change.
- WORKSPACE-1 can consume persisted project, execution, manifest, and chat state without introducing fallback client stores.

## Verification

GitHub Actions run `30110367078` passed TypeScript, ESLint, Prettier, full tests, repository validation, commitlint, PostgreSQL restart E2E, and the merge gate.

## Next Decision Boundary

WORKSPACE-1 owns workflow-oriented presentation in the standalone frontend. STUDIO-1 remains responsible for proving that real generated artifacts, not structural or fallback packages, synchronize into Roblox Studio.
