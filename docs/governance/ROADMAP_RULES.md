# Roadmap Rules

Governance for planning and executing new features.

## Before Adding to Roadmap

Every proposed feature must answer:

| Question                                          | Required |
| ------------------------------------------------- | -------- |
| What is the business objective?                   | Yes      |
| What is the architecture impact?                  | Yes      |
| What existing modules are affected?               | Yes      |
| What are the dependencies?                        | Yes      |
| What is the implementation complexity? (S/M/L/XL) | Yes      |
| What is the estimated effort?                     | Yes      |
| What are the risks?                               | Yes      |
| What is the testing strategy?                     | Yes      |
| What is the rollback strategy?                    | Yes      |

## Before Starting a Roadmap Item

Verify:

- [ ] All dependencies are satisfied (previous sprints complete).
- [ ] No blocking issues exist.
- [ ] Architecture impact is understood and acceptable.
- [ ] Required infrastructure exists.
- [ ] Testing approach is defined.

## Execution Rules

- Complete sprints in order. Do not skip ahead.
- Each sprint has exactly one objective.
- A sprint is not done until it passes the [Quality Gate](./QUALITY_GATE.md).
- Do not begin the next sprint until the current one is committed and tagged.

## Scope Control

- If a sprint discovers work outside its scope: document it, do not fix it.
- If a sprint's scope grows beyond the original estimate: stop, reassess, and split.
- If a dependency is discovered missing: stop the current sprint and address the dependency first.

## Roadmap Format

```markdown
## Sprint vX.Y — [Title]

**Objective:** [One sentence]
**Dependencies:** [List of required prior sprints]
**Complexity:** S | M | L | XL
**Estimated effort:** [Time estimate]
**Risk level:** Low | Medium | High

### Scope

- [Specific deliverable 1]
- [Specific deliverable 2]

### Out of Scope

- [Explicitly excluded items]

### Testing Strategy

- [How this will be validated]

### Rollback Strategy

- [How to revert if problems arise]
```

## Priority Ordering

Features are prioritized by:

1. Stability fixes (always first).
2. Infrastructure required by multiple features.
3. Core functionality.
4. Enhancements.
5. Optimizations.

Never implement enhancements before core functionality is stable.
