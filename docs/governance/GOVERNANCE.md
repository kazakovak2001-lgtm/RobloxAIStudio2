# Governance

Mandatory workflow that applies to every task in this repository.

## Before Implementation

Every task must complete these steps before writing code:

### 1. Analysis

- Read and understand the current state of affected modules.
- Identify the exact problem or requirement.
- Determine root cause (for fixes) or integration point (for features).

### 2. Dependency Analysis

- List all modules that will be affected.
- Identify upstream and downstream dependencies.
- Verify no circular dependencies will be introduced.

### 3. Architecture Review

- Confirm the change fits within the existing architecture.
- Identify which layer the change belongs to.
- Verify no layer violations will occur.

### 4. Duplicate Detection

- Search the codebase for existing implementations of the required functionality.
- If found: extend, do not recreate.
- If similar exists: refactor to share, do not duplicate.

### 5. Dead Code Detection

- Identify any code that will become unused after this change.
- Plan removal of dead code as part of the implementation.

### 6. Impact Analysis

- Determine what existing tests may break.
- Determine what API contracts may change.
- Determine if frontend or backend consumers will be affected.

## Implementation Rules

- Follow [CORE.md](./CORE.md) rules without exception.
- Make changes in the order specified by [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md).
- Every change must pass [QUALITY_GATE.md](./QUALITY_GATE.md) before commit.

## Validation Requirements

After implementation, verify:

- Build passes.
- TypeScript reports 0 errors.
- All existing tests pass.
- New tests cover the change.
- Runtime validation confirms functionality.

## Reporting Requirements

Every completed sprint must produce a report following [REPORT_TEMPLATE.md](./REPORT_TEMPLATE.md).

## Stop Conditions

Stop immediately and reassess if:

- Build breaks and cannot be fixed within the current change.
- A required dependency is missing and cannot be added safely.
- The change scope exceeds what was planned.
- An architectural conflict is discovered.
- Tests reveal a pre-existing bug unrelated to the current task.

## Approval Checkpoints

- Architecture changes require explicit review.
- Public API changes require backward compatibility analysis.
- Dependency additions require justification.
- File deletions require confirmation that no consumers remain.
