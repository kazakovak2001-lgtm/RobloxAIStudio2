# CLEANUP-1C Legacy Frontend Physical Removal

**Status**: Protected implementation verification passed in PR #39; merge pending
**Date**: July 28, 2026  
**Tracking issue**: #37

## Objective

Remove the physically preserved embedded React/Vite frontend and prune only
direct packages that CLEANUP-1A and CLEANUP-1B proved have no active consumer.
Keep the canonical backend, Studio plugin, standalone Frontend, release
composition, and rollback artifacts unchanged.

This is the first deletion-authorized cleanup wave. It reuses the existing
cleanup inventory and verifier rather than introducing a second removal
mechanism.

## Exact Baseline

- repository: `kazakovak2001-lgtm/RobloxAIStudio2`;
- protected default: `release/cutover-1e-candidate`;
- post-CLEANUP-1B baseline:
  `85a2fa8d512738e6d02ffae42da77af7a27db6fc`;
- CLEANUP-1B merge:
  `703fe0fbcfcb8706506e9351af1fe7874a1337f0`;
- canonical standalone Frontend:
  `kazakovak2001-lgtm/Frontend@1036c3ef9705d145cb9700cd14268a33d2abdd58`.

## Authorized Removal

| Classification               |   Count | Paths                                                        |
| ---------------------------- | ------: | ------------------------------------------------------------ |
| Embedded frontend source     |     168 | Exact CLEANUP-1A `src/**` inventory                          |
| Root frontend entry/config   |       5 | `index.html`, TypeScript, Vite, Tailwind, and PostCSS config |
| Archival combined deployment |       3 | Root `Dockerfile`, legacy compose, and legacy Nginx config   |
| **Total**                    | **176** | Exact baseline-relative deletions                            |

The removed combined deployment was already non-executable because it
referenced the absent `public/` directory. It was not the production rollback
path.

## Dependency Pruning

The following direct runtime declarations are removed:

- `framer-motion`;
- `lucide-react`;
- `react`;
- `react-dom`;
- `react-router-dom`.

The following direct development declarations are removed:

- `@types/react`;
- `@types/react-dom`;
- `@vitejs/plugin-react`;
- `autoprefixer`;
- `postcss`;
- `tailwindcss`;
- `vite`.

`package-lock.json` is regenerated from the reduced root declarations.
Transitive occurrences are permitted when an active package still requires
them; for example, Vitest can retain Vite transitively. The contract is that
none of the 12 packages remains a root direct declaration or repository code
consumer.

`socket.io-client` remains a direct runtime dependency because
`scripts/cutover/verify-composed-release.mjs` uses it to verify authenticated
Socket.IO polling and WebSocket upgrade.

## Machine-Enforced Contract

The evolved schema-v3 cleanup audit requires:

- exact ancestry from the post-CLEANUP-1B baseline;
- exactly 176 authorized `D` paths, eleven required `M` paths, and one required
  `A` path;
- historical size and SHA-256 evidence for every removed path;
- a physically absent and untracked root `src/`;
- exactly 12 removed direct package declarations and synchronized root
  package-lock maps;
- zero remaining repository consumers for every removed package;
- unchanged backend commands and backend-only Vitest scope;
- the existing production-readiness audit checks the canonical Studio plugin
  instead of the removed `src/shared` directory;
- unchanged protected backend, Studio, infrastructure, and historical
  inventory files;
- the same canonical standalone Frontend identity;
- zero active-release legacy reference violations;
- the cleanup audit as a required dependency of `Merge Gate`.

The architecture validator now treats root `src/` as a critical forbidden root.
This prevents the embedded frontend from being silently recreated after
removal.

## Preserved Boundaries

CLEANUP-1C does not modify:

- backend product runtime behavior, persistence, generation, or API contracts;
- Studio protocol, plugin source, or deterministic package contract;
- canonical standalone Frontend code or release identity;
- backend-only or composed HTTPS deployment files;
- PostgreSQL-only root `docker-compose.yml`;
- promoted default or pinned pre-promotion rollback references;
- `_inventory_raw.txt` or `ProjectStructure.txt`, which remain explicit inputs
  to the CLEANUP-1D documentation and broad-inventory refresh;
- PR #1.

## Verification

The implementation must pass:

```text
npm ci
npm run typecheck
npm run validate:arch
npm run validate:boundaries
npm run lint
npm run format:check
npm run test
npm run validate
npm run build
node scripts/cleanup/audit-legacy-frontend-decommission.mjs
```

Local verification passed on the CLEANUP-1C implementation:

- clean npm 10.9.8 lockfile installation: 357 packages installed;
- backend typecheck: passed;
- architecture validator: passed with root `src/` reported `REMOVED`;
- architecture negative control: a temporary root `src/` was rejected as
  `forbidden-root` and produced `VIOLATION DETECTED`;
- domain boundary validator: 547 files, 1,207 imports, zero violations;
- ESLint and Prettier: passed;
- Vitest: 60 files passed, one skipped; 666 tests passed, one skipped;
- repository validation: 1,085 files, all checks passed;
- backend build: passed.
- schema-v3 baseline-diff audit on the implementation tree: passed with 188
  exact changes, 176 removed paths, 168 removed source files, 12 removed
  direct packages, synchronized package-lock root declarations, and zero
  active-release legacy reference violations.

Protected implementation verification passed on PR #39 head
`600f17e8826da3a9d830760964b546d98674b75d`:

- CI run `30329606556` (#289) passed TypeScript, ESLint, Prettier,
  commit-message lint, backend tests, PostgreSQL restart E2E, repository
  validation, composed HTTPS release, promoted-baseline integrity, the
  CLEANUP-1C physical-removal audit, backend release image, and Merge Gate;
- Studio Plugin Package run #26 passed against the same implementation head;
- the first backend-image attempt encountered a transient Docker Hub timeout
  while pulling `docker/dockerfile:1`; retrying that exact job without a source
  change passed;
- evidence artifact `8676923623`, named
  `cleanup-1c-physical-removal`, has digest
  `sha256:a6006b891305ccc9ac00fe662b5dbc8e4a9bce4fe731e18991eadfec28920b15`;
- the artifact contains the `artifacts/cleanup-1c` evidence bundle, including
  `legacy-frontend-audit-result.json`.

This records implementation verification only. CLEANUP-1C remains active until
PR #39 is merged and the protected default-branch push run passes.

## Rollback

Revert the focused CLEANUP-1C pull request. Every deleted path and direct
declaration is recoverable from exact baseline
`85a2fa8d512738e6d02ffae42da77af7a27db6fc`.

Production rollback remains independent: deploy the verified CUTOVER-1A
backend artifact with the verified CUTOVER-1B standalone Frontend artifact.

## Next Stage

CLEANUP-1D is the next stage after CLEANUP-1C is protected, verified, and
merged. It must run post-removal verification, prove zero stale active/tooling
references, and refresh the intentionally retained broad repository
inventories and project-control documentation.
