# Deferred Roblox Studio Acceptance Result

**Status:** Accepted — `ARTIFACT-1`, `STUDIO-2F-A`, and `WORLD-1B` complete

**Acceptance date:** August 15, 2026

**Acceptance branch:** `test/studio-acceptance-final`

**Accepted implementation commits:** `710815936176a5f1f88cc7eb38b690b4bcdb7e71` and changed-design follow-up `b5f6cd636c8b4da58b96afd63131a5c7223aab1c`

## Decision

The deferred Studio checks were executed against a real Roblox Studio desktop,
the real Studio Luau engine, a PostgreSQL-backed backend, and canonical plugin
package v1.11.2. The combined evidence accepts `ARTIFACT-1`, `STUDIO-2F-A`, and
`WORLD-1B`. A follow-up changed the durable blueprint from five explicit
mechanics to four, generated execution `exec-1786788687047`, delivered all 12
artifacts through command `cmd-40d8b3e3-4`, and received exact verified Studio
receipts. Explorer contained only `mechanic-1` through `mechanic-4`; the Studio
command-bar assertion reported four managed interactive entities and
`mechanic5Swept true`. Checklist item 4 in
[WORLD-1B_SCOPE.md](./WORLD-1B_SCOPE.md) is therefore proven. The acceptance
prerequisite blocking `WORLD-1C` is removed; `WORLD-1C` remains separately
scoped and unimplemented.

No LLM provider was configured. Executions `exec-1786781992357` and
`exec-1786788687047` used the platform's deterministic fallback and are **not
AI generation**. Nothing was published or deployed externally.

## Acceptance identity

| Field                           | Value                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| Project                         | `proj-83f96f3d-d`                                                  |
| Owner                           | `user-2d13e044-b`                                                  |
| Generation execution            | `exec-1786781992357`                                               |
| Changed-design execution        | `exec-1786788687047`                                               |
| First verified export           | `cmd-3411f6e7-7`                                                   |
| Idempotence export              | `cmd-43b33b28-f`                                                   |
| World collision export          | `cmd-9864ea45-6`                                                   |
| UI collision export             | `cmd-d3b876c0-2`                                                   |
| Recovery export                 | `cmd-3621a709-e`                                                   |
| Changed-design export           | `cmd-40d8b3e3-4`                                                   |
| Expected and verified artifacts | `12 / 12`                                                          |
| Plugin                          | `1.11.2`, protocol `1.0.0`                                         |
| Package SHA-256                 | `c471d6761fc00409f8ea140a470a31c225b0e42908a5a95aa29437a07849766b` |
| Storage                         | PostgreSQL; 362 records loaded on the final restart                |

## Acceptance criteria

| Criterion                                                       | Result | Evidence                                                                                                                     |
| --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Authenticated plugin connection and heartbeat                   | PASS   | `POST /connect`, `GET /commands`, and `POST /heartbeat` returned 200                                                         |
| Durable command and verification evidence                       | PASS   | command `completed`; verification `verified`; 12/12 receipts                                                                 |
| Stable metadata identity and repeat export                      | PASS   | two verified exports of the same execution produced no duplicate/orphaned metadata                                           |
| Real generated UI tree in Explorer                              | PASS   | exactly `MainHUD`, `MainMenu`, and `PauseMenu` under `UI_GENERATION`, all managed                                            |
| UI invalid-class rejection is atomic                            | PASS   | real Studio engine rejected a forbidden `Script` after a valid screen without attaching either screen                        |
| Creator-owned UI collision fails closed                         | PASS   | authenticated export failed; the unmanaged colliding `MainHUD` survived unchanged                                            |
| UI recovery after collision removal                             | PASS   | the same execution returned to `verified`, 12/12                                                                             |
| Real design-time world tree and semantic attributes             | PASS   | 15 models, zero invalid identity/role attributes, and no `Workspace.AIStudioArtifacts`                                       |
| Creator-owned world collision fails closed                      | PASS   | authenticated export failed without deleting the unmanaged colliding entity                                                  |
| Creator content inside a replaced world is preserved            | PASS   | `AIStudioPreserved.OperatorOwnedMarker` survived and remained unmanaged                                                      |
| Changed design sweeps a disappeared managed world entity        | PASS   | changed execution verified 12/12; Explorer showed only `mechanic-1`…`mechanic-4`; command bar reported `mechanic5Swept true` |
| Play creates exactly one runtime HUD and one playable objective | PASS   | score progressed 0→1→4→5 and the HUD displayed `Objective complete!`                                                         |
| Backend restart retains Studio authority                        | PASS   | a non-environment project key survived two backend starts with `STUDIO_API_KEY` and `STUDIO_PROJECT_ID` absent               |
| Plugin reconnect is thread-safe                                 | PASS   | v1.11.2 auto-reconnected after backend restart; no `cannot cancel thread` error; commands and heartbeat resumed at 200       |

## Defects found and fixed during acceptance

1. The backend bound only to IPv4 while Windows resolved the documented
   `localhost` default to `::1`. Commit `a4847529` changed the default to a
   dual-stack listener with an IPv4 fallback and added regression coverage.
2. The plugin rendered a persisted Studio credential when re-opened. Commit
   `91490a7d` keeps persisted authority concealed and clears new input after
   connection.
3. A heartbeat failure could make reconnect cancel the heartbeat coroutine that
   was currently running. Commit `71081593` releases ownership before reconnect
   and refuses to cancel the current or a dead coroutine.
4. The local plugin model initialized inside Play server/client DataModels,
   producing HTTP and toolbar errors unrelated to the generated game. Plugin
   v1.11.2 now returns before loading modules unless it is running in Studio Edit
   plugin context.
5. Deterministic fallback ignored explicit blueprint mechanics and always used
   the five-mechanic generated seed, so an authenticated changed-design sweep
   could not be produced without an LLM. Commit
   `b5f6cd636c8b4da58b96afd63131a5c7223aab1c` makes explicit
   blueprint mechanics authoritative for fallback while preserving the seed
   behavior when none are supplied, with a non-vacuous regression test.

## Real Studio engine acceptance

`npm run studio:acceptance` ran on clean commit
`710815936176a5f1f88cc7eb38b690b4bcdb7e71` with the installed Roblox Studio
binary and returned `PASS` for all nine checks:

- canonical modules compiled in the Studio Luau VM;
- Lua path classes and source were preserved;
- metadata and UI/world redelivery were idempotent;
- invalid UI and world executable classes were rejected atomically;
- creator-owned UI collisions were preserved;
- all acceptance-owned DataModel fixtures were removed.

The generated local report is under
`artifacts/studio-acceptance/runs/run-1786784461196-cmWIdx/`. It is ignored
operator evidence, not release truth by itself.

## Operator evidence

The full local evidence set is under
`artifacts/studio-acceptance/operator/studio-acceptance-final-2026-08-15/`.
Representative SHA-256 identities are:

| Evidence                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `04-first-verified-export.png`                | `d901d8aa2ffbe8c8445234ed7f68bfbdc8fd7e7d29f59e84667fbe604ef607e1` |
| `05-second-verified-idempotence.png`          | `8f9a518d5be23e99029bb926264b21b90944f02a6acf71f1af584b4f2a1e6919` |
| `06-world-attributes-workspace-untouched.png` | `b5914671ffcc891a8a35473721e4e7f4c259fd690889dc9ea1297c33a4785e55` |
| `09-ui-collision-survived.png`                | `bd46f5f5b9b2afba0437a9d91a6fcbdeaa6610a5835b23504156311758b9374c` |
| `11-recovery-verified.png`                    | `532e275d88f72bfcd4ea86bbde3c94083d6e43034d674363b13b40ae5adbaf7f` |
| `14-play-0-of-5.png`                          | `7e55a308c2cc24ca7deb8a13da04673007fe326b3e40ead78cd6e625aea9a45d` |
| `17-play-objective-complete.png`              | `a6414c42a46fa1c57e4d85935738315d21787533630f4b9c0d7b41e08abff8fd` |
| `20-auto-reconnect-after-backend-restart.png` | `c2368aa0ab0e1347b7aa8592e716fe939ed3171b16487628bee8241f14e49080` |
| `21-world-changed-design-sweep-verified.png`  | `0e9d2d56cae7df4b0b84e70402d263f6b3cbe5bae2960778744e25064b101224` |

No credential value, digest, or reusable token is present in the record.

## Classification

- **FACT:** authenticated export, exact receipt verification, real Explorer
  materialization, fail-closed collisions, recovery, Play behavior, engine
  fixtures, and restart reconnect were directly observed.
- **INFERENCE:** the transition from transport failure to authenticated 200s
  attributes the original `localhost` failure to the IPv4-only listener; the
  dual-stack regression tests independently support that inference.
- **GAP:** no `WORLD-1B` operator criterion remains open. This does not provide
  multiplayer, performance, production deployment, or `WORLD-1C` evidence.
- **RISK:** treating this design-time acceptance as proof of canonical runtime
  ownership would exceed the evidence; `WORLD-1C` still needs its own delivery.
- **RECOMMENDATION:** record `WORLD-1B` complete and allow the separately scoped
  `WORLD-1C` work to be considered next. `STUDIO-2F-B` through `STUDIO-2F-E`
  remain separate scopes and are not completed by this result.

## Evidence boundary

This result proves deterministic fallback delivery, not model-authored output.
It proves one local single-player Play session, not multiplayer, subjective fun,
performance, retention, or production readiness. It proves local PostgreSQL
restart behavior, not an external production deployment. It performs no save,
publish, Open Cloud upload, or Roblox asset operation.
