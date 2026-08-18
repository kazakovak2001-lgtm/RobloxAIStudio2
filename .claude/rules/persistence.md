---
description: Durable acknowledgement, restart recovery, atomicity, idempotence, and runtime-handle separation for storage providers and durable services.
globs:
  - "server/src/platform/storage/**"
  - "server/src/pipeline/**"
  - "server/src/projects/repository/**"
  - "server/src/repair/**"
  - "server/src/studio/v2/**"
  - "server/src/distributed/**"
---

# Persistence — durability and restart correctness

## Acknowledge before you claim

Success is reported **after** the durable write is acknowledged, never before.

- `await` the durable write, then update in-memory caches — that order, always. A cache populated ahead of the write publishes state that a crash would erase.
- A write that was not acknowledged did not happen. Do not return an id, emit an event, or mark a step complete on the strength of an in-flight write.

## Atomicity and publication boundaries

- Prefer the storage provider's real transaction/batch when several records must land together. A "marker written last" ordering is a _publication_ boundary, not atomicity — it leaves orphans on crash.
- If you use a last-write marker, say so explicitly and account for the orphans: who else can still read the un-marked records, and is that safe?
- Publish by making one durable record the gate. Readers must resolve through that gate, and every read path must honor it — a single unguarded reader defeats the boundary.
- Validate shape **before** persisting, not after. Shape validation that runs post-write turns a valid operation into a failed one with durable side effects already committed.

## Restart recovery

- Recovery is **idempotent**: running it twice produces the same state as running it once.
- Recovery is **concurrency-safe**: two instances starting together must not double-claim, double-execute, or corrupt. Use fencing/claims, not "check then act".
- Reconstruct from durable state only. Anything reachable only from the previous process's memory is gone.
- A record written by a newer schema must not be silently read as an older one. Absence of a field may mean "legacy"; an _unrecognized_ value is an error.

## Durable state contains data, not handles

Never serialize into durable state:

- sockets, streams, file descriptors
- timers, intervals, `AbortController`
- class instances with behavior, closures, callbacks
- live provider/client objects

Durable state is plain serializable data. Process-local runtime handles are rebuilt on startup from that data and held separately. If a "state" object cannot survive `JSON.parse(JSON.stringify(x))` with its meaning intact, it is not durable state.

## Failure separation

Distinguish, and surface, these as different outcomes:

- **Execution failure** — the work itself failed. Report it as such.
- **Persistence failure** — the work succeeded but could not be recorded durably.
- **Publication withheld** — everything is durable but the package is not deliverable.

Collapsing these produces the worst debugging experience in the system: a validated run reported as "failed" with an internal exception string, or a withheld package indistinguishable from an empty one.

## Caches

- In-memory caches mirror durable state; they never _are_ it.
- A cache that is never invalidated is acceptable only if nothing deletes the underlying record. If a delete path is ever added, the caches must be updated in the same slice.
- Read-through caches must re-verify tenant/identity on the way out, not only on the way in.

## Review checklist

- Is every `setDurable`/write awaited before its cache update and before success is reported?
- Does a crash between any two writes leave a state a reader would misinterpret?
- Would running recovery twice change anything?
- Does any durable payload contain something non-serializable?
