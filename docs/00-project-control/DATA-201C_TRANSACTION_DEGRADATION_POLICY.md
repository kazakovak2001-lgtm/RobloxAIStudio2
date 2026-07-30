# DATA-201C — Transaction and Degradation Policy

## Status

Foundation policy for multi-record durable mutations. This document defines the contract implemented by `StorageProvider.applyDurableBatch`; individual consumers are migrated in separate reviewed slices.

## Atomic batch contract

`applyDurableBatch` is the only storage-provider API that claims atomicity across multiple records.

- Every mutation in the batch executes on one transaction-affine database client.
- PostgreSQL executes `BEGIN`, all batch mutations, and `COMMIT` on that same client.
- The provider publishes no new cache state before `COMMIT` succeeds.
- After a successful commit, all corresponding cache changes are published synchronously as one acknowledgement boundary.
- Any mutation failure causes a best-effort `ROLLBACK` and rejects the batch with `DurableStorageError` using operation `transaction`.
- A rejected batch preserves the exact pre-transaction visible cache state.
- An empty batch succeeds without opening a database transaction.

Individual `setDurable` and `deleteDurable` calls remain single-record acknowledgement boundaries. Calling several of them sequentially does not create a transaction.

Compatibility writes that target the same key while a durable batch is awaiting commit are newer visible mutations. Post-commit batch publication must not overwrite that newer cache state; the queued compatibility write remains responsible for bringing PostgreSQL to the same final value.

## Delete semantics

A batch delete makes the record absent after a successful commit. Its result includes `deleted` to indicate whether the database contained a matching record at deletion time. Replaying a delete is therefore safe and may return `deleted: false`.

## Retry policy

The storage layer performs no automatic retry of rejected durable mutations or batches.

This is intentional:

- connection errors and ambiguous commit outcomes require caller-specific policy;
- hidden retry can duplicate non-idempotent business effects;
- request handlers must not report success until their chosen mutation boundary is acknowledged;
- operators must be able to distinguish a rejected operation from a delayed retry.

A caller may retry only when it has an explicit idempotency contract and can determine that replay is safe.

## Idempotency policy

- Record identifiers must be stable across retries.
- Replaying a set/upsert is safe only when the same identifier represents the same intended state.
- Replaying a delete is safe; the second result can report `deleted: false`.
- A multi-record batch must have a request-level idempotency key or equivalent domain guard before automated retry is introduced.
- Generating new identifiers, credentials, external side effects, events, or billing effects inside an unguarded retry is prohibited.
- Transaction commit ambiguity must be resolved by reading domain state through stable identifiers before retrying.

This foundation does not yet add a request idempotency registry. Consumers that need automatic replay must implement and review that registry separately.

## Degradation model

Every storage provider exposes a provider-neutral operational state:

- `available`: the configured persistence boundary is accepting acknowledged mutations;
- `degraded`: the provider encountered a persistence failure and cannot currently guarantee new durable mutations;
- `unavailable`: the durable provider is not initialized or has been closed.

The status also reports:

- durability mode: `durable` or `ephemeral`;
- number of pending accepted mutations;
- timestamp of the last persistence failure when known.

Public health responses may expose only this normalized state. They must not include connection strings, SQL, driver errors, credentials, stack traces, or underlying exception messages.

## In-memory provider

The in-memory provider implements the same batch visibility semantics by applying mutations to staged collection snapshots and publishing those snapshots only after all mutations validate successfully. Its durability mode is `ephemeral`.

## Consumer migration rules

A multi-record consumer may move to `applyDurableBatch` only when:

1. all records belong to one storage provider and one database transaction;
2. the domain operation has a stable replay identity;
3. success is returned only after the batch resolves;
4. rejection preserves the previous visible domain state;
5. event publication and external side effects occur after acknowledgement or have explicit compensation;
6. tests cover success, middle-operation rejection, rollback visibility, delete replay, and degradation reporting.

## Truth boundary

This policy and provider implementation establish the transaction and degradation foundation. They do not claim that blueprint cascades, chat conversation mutations, registration, generation history, or other existing multi-record consumers have already migrated. Each consumer remains compatibility debt until its own reviewed slice proves atomicity and acknowledgement behavior.
