<!-- prettier-ignore-start -->

# SECURITY-2G Control Baseline

**Status:** In progress — baseline slice  
**Tracker:** issue #148  
**Backend baseline:** `release/cutover-1e-candidate@a1d2c231d8cea41fb6cf68bbfd447091c0cd957e`  
**Frontend release contents:** `kazakovak2001-lgtm/Frontend@022788ace31982e2b08ea099800de784b4dbe482`

## Purpose

`SECURITY-2G` is the next uncompleted project-control gate after the completed architecture, runtime-ownership and durability programs. This document defines the control boundary and ordered implementation sequence. It does not claim that missing controls already exist.

The security gate must preserve the two-repository product boundary: this repository owns the backend, shared release composition and Roblox Studio integration; `kazakovak2001-lgtm/Frontend` is the only canonical web client. Security evidence that describes the paired product must bind both exact commit identities.

## Existing protected evidence

The current protected backend pipeline already proves:

- TypeScript compilation, ESLint, Prettier and the backend test suite;
- PostgreSQL restart durability and ownership isolation;
- executable backend release-image health;
- the exact standalone Frontend production contract;
- composed HTTPS, authenticated REST and authenticated Socket.IO transport;
- promoted-baseline integrity and independent rollback rehearsal;
- post-removal invariants for the deleted embedded frontend;
- architecture, runtime, memory, durable-write and operational-state ownership rules.

These controls are prerequisites and supporting evidence. They are not substitutes for dependency, SAST, secret, image, SBOM or authorization policy.

## Control matrix

| Control | Current state | Owner | Enforcement point | Blocking threshold | Required evidence |
| --- | --- | --- | --- | --- | --- |
| Production dependency vulnerabilities | Missing authoritative gate | Backend repository | Pull request and protected push CI | No unexpired critical or high production finding | Scanner report, lockfile identity, exception registry |
| Dependency change review | Missing authoritative gate | Changed repository | Pull request CI | Deny newly introduced vulnerable or disallowed dependency changes | Dependency diff and policy result |
| SAST | Missing authoritative gate | Backend and Frontend repositories | Pull request and protected push CI | No unexpired high-confidence critical or high finding | SARIF/result identity bound to commit |
| Secret detection | Missing authoritative gate | Each repository | Pull request plus defined history boundary | No verified live secret; exceptions must be fingerprints, not plaintext | Scan report, revocation evidence where applicable |
| Backend image vulnerabilities | Missing authoritative gate | Backend repository | Release-image build | No unexpired critical or high runtime-package finding | Image digest and vulnerability report |
| Frontend image vulnerabilities | Missing authoritative gate | Frontend repository; verified by paired release | Frontend release build and composed release | Same threshold as backend image | Frontend image digest and report bound to release commit |
| SBOM | Missing | Producing repository | Release-image build | SPDX or CycloneDX document generated for every release image | SBOM digest, image digest, source commit |
| Application RBAC | Not yet inventoried as one authoritative matrix | Backend application | Unit, integration and contract tests | Every protected REST and Socket.IO operation has positive and negative authorization evidence | Route/event matrix and test evidence |
| Security exceptions | Missing central policy | Control owner plus reviewer | Repository validation and CI | Named owner, exact fingerprint/package, reason and expiry required | Tracked exception registry and expiry check |

## Policy principles

1. **Evidence before completion.** A tool being configured is not completion; protected execution evidence is required.
2. **Exact identities.** Reports must identify the source commit, dependency lockfile or image digest they evaluate.
3. **Production-first thresholds.** Critical and high findings affecting shipped runtime code block by default.
4. **No anonymous waivers.** Exceptions require an owner, technical rationale, exact scope and expiry date.
5. **No plaintext secret allowlists.** Secret exceptions use stable fingerprints or rule/path scopes.
6. **Two-repository truthfulness.** Backend controls cannot imply Frontend coverage, and Frontend controls cannot imply backend coverage.
7. **Authorization parity.** REST and Socket.IO operations with equivalent authority requirements must have equivalent negative tests.
8. **Historical scans are bounded deliberately.** Full-history secret scanning is a separate decision from pull-request scanning and must not be silently approximated.

## Ordered delivery

### SECURITY-2G-A — Baseline and policy contract

- record current and missing controls;
- define owners, enforcement points, thresholds and evidence;
- preserve exact paired-release identities;
- make no runtime, dependency or workflow behavior change.

### SECURITY-2G-B — Dependency controls

- add production dependency audit for the backend;
- add pull-request dependency review;
- define the tracked exception registry and deterministic expiry validation;
- require the Frontend repository to produce equivalent evidence under its own lockfile.

### SECURITY-2G-C — SAST and secrets

- enable TypeScript/JavaScript SAST for both repositories;
- add pull-request secret detection;
- decide and document the historical scan boundary;
- retain machine-readable results with commit identity.

### SECURITY-2G-D — Image scanning and SBOM

- scan the exact backend release image;
- scan the exact Frontend release image;
- generate SBOMs for both images;
- bind reports and SBOMs to image digests and paired source commits.

### SECURITY-2G-E — RBAC and authorization parity

- inventory protected REST routes and Socket.IO events;
- define roles, resource ownership and denial semantics;
- add negative authorization tests for cross-user, unauthenticated and insufficient-role access;
- verify transport parity and avoid role checks implemented only in the client.

### SECURITY-2G-F — Consolidated gate

- make the approved controls blocking in the merge gate;
- publish final protected evidence;
- reconcile current project-control documentation;
- close `SECURITY-2G` only when both repositories and the paired release satisfy the accepted thresholds.

## Exception contract

Every exception must contain:

- control identifier;
- exact package, advisory, rule, path, secret fingerprint, image component or authorization case;
- affected repository and release identity;
- owner;
- technical rationale and compensating control;
- approval reference;
- creation and expiry dates.

Expired, ambiguous, wildcard or ownerless exceptions fail validation. Exceptions cannot downgrade a known live credential without documented revocation or rotation evidence.

## Completion boundary

`SECURITY-2G-A` is complete when this baseline is reviewed, linked from current project-control authority and protected formatting/documentation validation pass. Completion of this slice does not complete `SECURITY-2G`; all unimplemented controls remain explicitly missing until their respective slices produce protected evidence.

<!-- prettier-ignore-end -->
