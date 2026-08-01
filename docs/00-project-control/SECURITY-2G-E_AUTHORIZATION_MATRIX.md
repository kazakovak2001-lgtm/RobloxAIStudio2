<!-- prettier-ignore-start -->

# SECURITY-2G-E Authorization Matrix

**Status:** Active baseline — incomplete inventory  
**Tracker:** issue #156  
**Backend baseline:** `release/cutover-1e-candidate@d55fdb4d7eb920d0271d1ee7affe08666cdb270a`  
**Paired Frontend contents:** `kazakovak2001-lgtm/Frontend@022788ace31982e2b08ea099800de784b4dbe482`

## Purpose

This document is the authoritative authorization inventory for SECURITY-2G-E. An operation is not complete until it has an explicit principal model, resource scope, allow evidence, deny evidence and REST/Socket.IO parity disposition where an equivalent operation exists.

The initial table records only behavior verified from the current source. It is intentionally incomplete and must not be interpreted as full RBAC coverage.

## Principal classes

| Principal | Current authentication mechanism | Current authorization identity | Status |
| --- | --- | --- | --- |
| Browser/user session | Bearer token or `roblox_ai_token` httpOnly cookie | Durable session `userId` | Implemented authentication; role model not yet authoritative |
| Studio/CLI API key | `X-API-Key` | No user, role or resource-scope principal attached to the request | Authentication implemented; authorization scope missing |
| Socket.IO browser/user session | Auth token, query token or shared httpOnly cookie | Durable session `userId` in `socket.data.user` | Implemented authentication |
| Development compatibility client | Authentication bypass outside production | Query `userId` or socket ID compatibility identity | Non-production only; must not be treated as production authorization evidence |

## Verified current operations

| Surface | Operation | Authentication | Resource authority | Positive evidence | Negative evidence | Parity status |
| --- | --- | --- | --- | --- | --- | --- |
| REST | Public health/status operations | Public allowlist | None | Existing health and contract tests | Public-route classification validation pending | Not applicable |
| REST | Protected API routes, general | Global production auth middleware | Generic project ownership check only when `projectId`, `gameId`, `blueprint.id` or query `projectId` is present | Existing HARDEN-2A auth contract | Exhaustive per-route denial evidence missing | Inventory incomplete |
| REST | Protected API-key request | Registered API key | No attached principal, role, project scope or tenant scope | API-key authentication tests exist | Insufficient-scope and cross-project denial model missing | Gap |
| Socket.IO | Connection handshake | Production token/cookie required | Authenticated session attached to socket | Existing HARDEN-2A auth contract | Missing/invalid/expired token rejection exists | Authentication only |
| Socket.IO | `project:join` | Authenticated production socket | `projectRepository.verifyOwnership(projectId, userId)` for user sessions | Existing room-join ownership behavior | Invalid/empty/cross-owner project emits `project:error` | REST equivalent mapping pending |
| Socket.IO | `project:leave` | Connected socket | No explicit ownership or current-room membership assertion before leave/broadcast | Compatibility behavior exists | Negative authorization evidence missing | Gap |
| Socket.IO | Server-emitted pipeline/project events | Server process | Project-room targeting when `projectId` exists; global broadcast otherwise | Existing production contract | Unauthorized global-fallback exposure analysis missing | Gap |

## Required inventory fields

Every protected REST route and Socket.IO event must record:

1. stable operation ID;
2. method/event name and source registration point;
3. public or protected classification;
4. accepted principal classes;
5. required role or capability;
6. resource identifier source;
7. ownership, tenant and project-scope rule;
8. positive authorization test;
9. missing-authentication denial test;
10. malformed/expired authentication denial test;
11. insufficient-role or insufficient-capability denial test;
12. cross-owner/cross-tenant denial test where a resource is scoped;
13. equivalent REST or Socket.IO operation and parity disposition;
14. exact evidence file and test name.

## Blocking gaps at baseline

- No one authoritative route/event inventory exists.
- No application-wide role/capability vocabulary is currently attached to authenticated sessions or API keys.
- API keys authenticate requests without an explicit owner, tenant, project or capability scope.
- The generic REST ownership guard infers project identifiers from selected body/query fields and therefore cannot prove coverage for every route shape.
- Socket.IO authorization is explicit for `project:join` only; other client-originated events require inventory and negative evidence.
- Equivalent REST and Socket.IO operations are not yet linked by a deterministic parity validator.
- Development bypass behavior is compatibility behavior, not production authorization evidence.

## Completion rule

SECURITY-2G-E is complete only when the inventory is exhaustive, deterministically validated and every protected operation has both allow and deny evidence. Unknown, wildcard, inferred-only or untested authority entries fail the gate.

<!-- prettier-ignore-end -->
