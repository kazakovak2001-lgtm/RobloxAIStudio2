# Storage Retry and Idempotency Policy

## Purpose

Durable storage failures must be observable without leaking PostgreSQL-specific details through public API contracts. The storage layer reports provider-neutral availability and failure categories; application services decide whether an operation may be retried.

## Operational states

- `available`: the provider is connected and no unresolved infrastructure failure is recorded.
- `degraded`: an infrastructure failure occurred and has not been cleared by an acknowledged durable operation or explicit successful readiness probe.
- `unavailable`: the provider is closed or has not established durable connectivity.

Expected `DurableStorageConflictError` outcomes are application-level concurrency results. They do not mark the provider degraded.

## Recovery rule

A connectivity probe may prove the database is reachable, but it does not by itself prove that the failed durable mutation completed. Degradation is cleared only by one of these explicit recovery boundaries:

1. a later acknowledged durable set, delete, or atomic batch;
2. an explicit readiness probe whose contract includes durable write-path verification.

A plain `SELECT 1` health check may update connectivity diagnostics but must not silently erase unresolved mutation degradation.

## Retry policy

### Single-record set

A caller may retry when the application contract is idempotent for the same collection, id, and payload. Callers must not automatically retry when a new identifier, timestamp, quota charge, or externally visible side effect would be generated.

### Single-record delete

Deleting the same record is idempotent when absence is an accepted final state. A caller using `requireExisting` semantics must treat absence as a conflict outcome rather than an infrastructure retry signal.

### Atomic batch

A rejected infrastructure batch is safe to retry only when every mutation is deterministic and the same idempotency identity is reused. Expected durable conflicts are terminal application outcomes for that attempt.

### Authentication refresh replay

Refresh-token consumption is intentionally single-winner. A replay conflict must not be retried as infrastructure failure and must not mark storage degraded.

### Bootstrap migration

Bootstrap migrations remain fail-closed. They are retried only by restarting the initialization sequence after the underlying infrastructure is healthy. Partial success must be prevented by atomic durable batches or idempotent migration records.

## Prohibited behavior

- no automatic retries for non-idempotent application mutations;
- no conversion of durable conflicts into HTTP 503 infrastructure failures;
- no public exposure of connection strings, SQL errors, driver names, or raw causes;
- no restoration of synchronous compatibility writes.
