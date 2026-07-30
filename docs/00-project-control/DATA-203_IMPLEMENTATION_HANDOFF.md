# DATA-203 Implementation Handoff

Tracks #114 and #63.

## Base

Apply this slice from release commit `11a78b96e10843f3d6c5cb23eeef4c81320f7a72` on `release/cutover-1e-candidate`.

## Required implementation

1. Change `AuthService.validateToken` to return `Promise<AuthSession | null>`.
2. Persist the refreshed `lastActivity` through awaited `storage.setDurable`.
3. Keep the previously acknowledged session visible while the write is pending.
4. Preserve the previous session if persistence rejects.
5. Convert `authMiddleware` to `async` and await both Bearer-token and cookie-token validation.
6. Fail closed with HTTP 503 when activity persistence rejects; do not call `next()`.
7. Update every production and test caller of `validateToken` to await the new contract.
8. Remove exactly `server/src/platform/auth/AuthService.ts#AuthService.validateToken#set` from `config/durability/compatibility-write-inventory.json`.
9. Add regressions for pending acknowledgement, rejection preservation, successful acknowledgement, token expiry and middleware failure propagation.

## Scope boundary

Do not migrate `createSession`, `deleteSession`, `login`, `refreshSession`, `register`, `migrateLegacyRefreshCredentials`, or `UserRepository.create`.

## Required checks

```bash
rg "validateToken\\(" server/src
npx prettier --write server/src/platform/auth/AuthService.ts server/src/common/middleware/security.ts server/src/__tests__/securityHardening.test.ts config/durability/compatibility-write-inventory.json
npm run typecheck
npm run lint
npm test
npm run validate:repository
```

The protected inventory must decrease from 14 calls / 8 groups to 13 calls / 7 groups. Remove this handoff document before the final merge candidate unless project-control documentation is intentionally retained and inventories are regenerated.
