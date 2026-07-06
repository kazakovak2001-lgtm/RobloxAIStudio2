# Roblox AI Studio DevKit — Project Standards

## Architecture Domains

This project is organized into the following subsystems:

- **Core Engine** — Runtime, configuration, lifecycle management
- **AI Agents** — Agent definitions, orchestration, provider interfaces
- **Generation Pipeline** — Execution stages, transforms, output assembly
- **Blueprint System** — Templates, schemas, composition rules
- **Validation Layer** — Input/output validation, schema enforcement
- **Manifest System** — Package manifests, dependency resolution
- **CI/CD Pipeline** — Build, test, deploy automation
- **Governance Layer** — Policy enforcement, access control, audit
- **Documentation System** — API docs, architecture docs, guides
- **Test Suite** — Unit, integration, property-based tests
- **VS Code Tooling** — Extensions, commands, UI integrations

---

## 1. Commit Discipline

### Format

- Follow **Conventional Commits** strictly: `<type>(<scope>): <description>`
- Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`
- Subject line: max 72 characters, lowercase start, no trailing period
- Breaking changes: append `!` after type/scope, add `BREAKING CHANGE:` footer

### Atomicity

- Each commit represents **exactly one logical change**
- Never combine unrelated changes in a single commit
- Never combine refactoring with feature additions unless lines are inseparable

### Commit Body

- Include a **WHY** explanation in the commit body for non-trivial changes
- Explain the motivation, not just what was done
- Reference related issues or decisions when applicable

### Prohibited

- No vague messages: "fix stuff", "update", "wip", "misc changes"
- No commits with secrets, tokens, API keys, or generated artifacts
- No commits that break the build

---

## 2. Code Organization Rules

### Subsystem Boundaries

- Group changes by the subsystem they belong to
- Never mix changes from unrelated subsystems in one commit
- Scope in commit messages must match the affected subsystem

### File Placement

- Each file belongs to exactly one subsystem
- Shared utilities live in a dedicated `shared/` or `common/` directory
- Cross-cutting concerns (logging, errors) have their own modules

---

## 3. Code Quality Rules

### Architecture

- Enforce modular architecture — small, focused modules
- Prefer **composition** over inheritance
- Use **dependency injection** for external services and providers
- No monolithic files (split at ~300 lines unless cohesive)

### Cleanliness

- No code duplication — extract shared logic into utilities
- No dead code — remove unused functions, imports, variables
- No commented-out code in production files
- Explicit types over `any` in TypeScript

### Patterns

- Single responsibility for functions and classes
- Pure functions where possible
- Error handling at boundaries, not scattered throughout
- Consistent naming: `camelCase` for variables/functions, `PascalCase` for types/classes

---

## 4. Refactoring Policy

- **Incremental only** — small, verifiable steps
- Preserve public APIs unless explicitly intended to change them
- Each refactoring commit must pass all existing tests
- Refactoring commits use type `refactor` and are separate from features
- Document the refactoring rationale in the commit body

---

## 5. Documentation Rules

- Update docs when architecture or APIs change
- Keep `README.md` and architecture docs in sync with implementation
- API changes require updated JSDoc/TSDoc comments
- New subsystems require an architecture decision record or doc update
- Docs changes use commit type `docs`

---

## 6. Validation Rules

### Pre-Commit Checks

- TypeScript must compile without errors (`tsc --noEmit`)
- Lint must pass (`eslint`)
- Formatting must be consistent (`prettier`)
- No secrets, tokens, or credentials in committed files
- No generated artifacts (build output, coverage reports, lock file conflicts)

### Blocked Patterns

- Files matching: `*.log`, `*.env`, `*.key`, `*.pem`, `*.secret`
- Directories: `node_modules/`, `dist/`, `build/`, `.cache/`, `coverage/`
- Strings: API keys, bearer tokens, connection strings with credentials

---

## 7. Repository Hygiene

### .gitignore Enforcement

- Ignore: logs, caches, builds, temp files, IDE settings, OS artifacts
- Never commit: credentials, API keys, `.env` files, generated code
- Keep tracked: source, configs, documentation, test fixtures

### File Size

- No single file larger than 500 lines without justification
- No binary blobs in the repository
- Assets belong in external storage or a dedicated assets branch

---

## 8. AI Behavior Rules

### Change Management

- Split unrelated changes into separate commits automatically
- Detect subsystem boundaries from directory structure
- When modifying multiple subsystems, create one commit per subsystem

### Decision Making

- Optimize for **long-term maintainability** over short-term convenience
- Optimize for **traceability** — every change should be explainable via git history
- Prefer reversible changes over irreversible ones
- When uncertain about classification, flag for manual review

### Prohibited Actions

- Never force-push to shared branches
- Never rewrite published history
- Never bypass validation checks
- Never introduce new dependencies without justification in the commit body

---

## 9. AI Orchestration Behavior

### Inter-Module Communication

- Agents communicate through well-defined message contracts, never direct function calls across subsystem boundaries
- Each agent declares its input schema and output schema explicitly
- The Orchestrator is the sole entry point for multi-agent workflows — no agent-to-agent direct invocation
- Agent failures must be isolated; one agent crash must not cascade to unrelated agents

### Execution Model

- Agents execute in defined phases: plan → generate → validate → emit
- No agent may skip the validation phase before emitting output
- Parallel execution is permitted only when agents have no data dependency between them
- Sequential dependencies must be declared in the orchestration manifest

### State Management

- Agents are stateless between invocations — all context flows through the orchestrator
- Shared state lives in a context object passed explicitly, never in module-level globals
- Side effects (file writes, API calls) happen only in the final emit phase, never during planning or generation

### Error Propagation

- Agents return structured error objects, never throw unhandled exceptions
- The orchestrator aggregates errors and decides retry/abort/fallback strategy
- Partial results are preserved when possible — fail gracefully, not catastrophically

---

## 10. Pipeline Stage Validation Rules

### Stage Contract

- Each pipeline stage declares: input type, output type, preconditions, postconditions
- A stage must not execute if its preconditions are not met
- A stage must validate its output against postconditions before passing downstream

### Stage Transitions

- Output of stage N must type-match the input of stage N+1 — no implicit coercions
- If a stage produces an invalid output, the pipeline halts with a diagnostic indicating which stage failed and which postcondition was violated
- No stage may mutate its input — stages are pure transforms that produce new output

### Validation Checkpoints

- **Schema validation**: every inter-stage payload is validated against its declared TypeScript interface
- **Completeness check**: required fields must be present and non-null
- **Consistency check**: cross-references between fields must resolve (e.g., referenced IDs must exist)
- **Idempotency check**: running the same stage twice with the same input must produce identical output

### Stage Observability

- Each stage emits a structured log entry on entry and exit: stage name, duration, input hash, output hash
- Failed stages include the validation error in their log entry
- The pipeline runner produces a summary manifest listing all stages, their status, and timing

---

## 11. Blueprint-to-Build Traceability

### Traceability Requirements

- Every generated artifact must trace back to exactly one blueprint definition
- The build output manifest must include a `sourceBlueprint` field referencing the originating blueprint ID
- No generated code may exist without a corresponding blueprint entry

### Blueprint Identity

- Each blueprint has a unique, stable identifier (UUID or namespaced key)
- Blueprint versions are immutable — changes produce a new version, not an in-place mutation
- The mapping `blueprint:version → generated artifacts` must be reproducible

### Build Manifest

- The build process produces a `build-manifest.json` listing every generated artifact with:
  - `artifactPath`: relative path to the generated file
  - `blueprintId`: source blueprint identifier
  - `blueprintVersion`: version of the blueprint used
  - `generatedAt`: ISO 8601 timestamp
  - `checksum`: SHA-256 hash of the artifact content

### Validation

- CI must verify that every artifact in the build output has a valid blueprint reference
- Orphaned artifacts (no blueprint reference) are flagged as errors
- Blueprint deletions must cascade: removing a blueprint must remove or deprecate all associated artifacts
- Drift detection: if a generated artifact is manually modified, the build must flag it as diverged from its blueprint source
