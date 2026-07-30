# DATA-202 Role Mutation Slice

Tracks #112 and #63.

## Scope

- Replace `AuthService.setRole` compatibility storage with an awaited durable mutation.
- Preserve the prior role until persistence acknowledgement.
- Preserve the prior role when persistence rejects.
- Remove exactly one protected compatibility-write group.

## Compatibility ordering guard

`PostgresStorageProvider.setDurable` captures the compatibility-mutation version before persistence and publishes the acknowledged value to cache only when no later compatibility write has occurred for the same record.

## Expected inventory

The compatibility inventory decreases from 15 calls in 9 groups to 14 calls in 8 groups.

## Exit gate

Protected CI must pass on the exact merge-candidate head, with no temporary migration workflow remaining in the final tracked set.
