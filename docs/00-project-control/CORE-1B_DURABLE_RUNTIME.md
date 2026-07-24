# CORE-1b — Durable Runtime Records and Restart Acceptance

**Objective:** Persist blueprint, version, generation-execution, and project-chat records through the same configured storage boundary as identity and projects, then prove recovery and ownership isolation after a PostgreSQL provider restart.

**Dependencies:** CORE-1a merged into `feature/plugin-merge`.

**Status:** Implemented on draft PR; full CI validation pending.

## Reuse Audit

The project already contained the required domain contracts and API surfaces:

- `IBlueprintRepository` defines blueprint, version, and execution operations.
- `GameGenerationService` and the project routes already consume that repository contract.
- `ChatPersistenceService` already defines the stable conversation/message contract.
- `StorageProvider` and `PostgresStorageProvider` already provide process-wide cache-with-write-through persistence.
- `kv_store` and the migration runner already own the durable schema.

CORE-1b therefore adds no second persistence framework, no new frontend adapter, and no duplicate route group.

## Delivered Scope

- `StorageBlueprintRepository` persists game blueprints, blueprint snapshots, and generation executions through `StorageProvider` collections.
- Persisted JSON date values are rehydrated into `Date` instances before returning through the existing repository contract.
- The existing `InMemoryBlueprintRepository` name remains as a compatibility facade, but application bootstrap resolves it to the configured process-wide provider.
- `ChatPersistenceService` stores conversations and messages through the same provider instead of module-level maps.
- Blueprint deletion removes dependent versions and executions; conversation deletion removes dependent messages.
- Existing HTTP routes and response shapes remain unchanged.
- The canonical standalone `Frontend` repository requires no code change.

## Collections

| Collection | Record type | Primary key |
| --- | --- | --- |
| `game_blueprints` | `GameBlueprint` | blueprint ID |
| `blueprint_versions` | `BlueprintVersion` | version record ID |
| `generation_executions` | `GenerationExecution` | execution ID |
| `chat_conversations` | `Conversation` | conversation ID |
| `chat_messages` | `ConversationMessage` | message ID |

All collections use the existing `kv_store` write-through mechanism. No parallel database schema or ORM was introduced.

## Acceptance Coverage

### Provider Recreation

A deterministic in-memory storage test reconstructs repository and service instances over the same provider and verifies:

- blueprint recovery;
- version snapshot recovery;
- execution recovery with rehydrated dates;
- conversation and ordered message recovery;
- dependent-record deletion.

### PostgreSQL Restart E2E

The CI workflow starts PostgreSQL 16 and performs this sequence:

1. apply tracked migrations;
2. initialize the first strict PostgreSQL provider;
3. persist credentials, sessions, project ownership, blueprint, version, execution, and chat records;
4. flush and close the provider;
5. create and hydrate a second provider from PostgreSQL;
6. reconstruct authentication, project runtime, blueprint repository, and chat service;
7. verify all records are restored;
8. verify the original owner session still grants access;
9. verify a different persisted user still receives `403`.

The E2E test is skipped in the ordinary dependency-free test path and runs only when `RUN_POSTGRES_E2E=true` with a real `DATABASE_URL`.

## Contract Impact

No endpoint paths or response fields change. Production deployments using PostgreSQL now retain blueprint, generation-execution, and chat state across application restarts.

## Explicitly Out of Scope

- Replacing temporary Studio synchronization packages with generated artifact packages.
- Persisting every historical concept/pipeline implementation that is not part of the canonical project generation path.
- Workspace redesign.
- Legacy frontend removal.
- STUDIO-1 artifact lifecycle and Roblox Studio end-to-end validation.

## Rollback

Revert the CORE-1b change set. Existing records remain isolated in `kv_store`; reverting does not delete them. The previous compatibility classes return to process-local storage behavior.

## Next Objective

After all CI gates pass and CORE-1b is merged, mark CORE-1 complete and begin WORKSPACE-1. WORKSPACE-1 must consume real persisted project, blueprint, execution, and chat data without introducing duplicate frontend services or backend stores.
