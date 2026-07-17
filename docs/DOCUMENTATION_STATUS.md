# Documentation Status

**Last Updated**: July 2026  
**Maintained By**: Project Team  
**Governance**: Single Source of Truth principle

---

## Documentation Structure

```
docs/
├── 00-project-control/     # Source of Truth — canonical project state
│   ├── CURRENT_STATE.md    # Live project state (architecture, metrics, health)
│   ├── DECISION_LOG.md     # Architectural & product decisions with rationale
│   └── ROADMAP_STATUS.md   # Active roadmap, milestones, release status
│
├── 01-architecture/        # Architecture documentation
├── 02-audits/              # Audit reports (security, integration, reality checks)
├── 03-features/            # Feature-specific documentation
├── 04-migrations/          # Migration plans and records
│
├── templates/              # Implementation task templates
├── archive/                # Obsolete/superseded documentation (read-only)
│   ├── migrations/         # Completed migration execution reports
│   ├── registries/         # Superseded registries (component, feature, project)
│   ├── roadmaps/           # Completed or superseded roadmaps
│   ├── security/           # Pre-hardening security audits
│   └── tech-debt/          # Resolved technical debt reports
│
├── api/                    # API documentation
├── design/                 # Design system documentation
├── development/            # Development process docs
├── devops/                 # DevOps and deployment docs
├── governance/             # Governance rules and policies
├── testing/                # Testing strategy and reports
└── *.md                    # Historical feature/integration reports (reference)
```

---

## Source of Truth Rules

1. **`docs/00-project-control/CURRENT_STATE.md`** is the single canonical reference for:
   - Current architecture metrics (page count, component count, services)
   - Feature completion status
   - Security hardening status
   - Technical debt status
   - Build health

2. **`docs/00-project-control/ROADMAP_STATUS.md`** is canonical for:
   - Active sprint/task status
   - Release readiness assessment
   - Post-launch improvement backlog

3. **`docs/00-project-control/DECISION_LOG.md`** is canonical for:
   - All architectural decisions and their rationale
   - Implementation choices and tradeoffs

4. **If any other document contradicts `00-project-control/`, it is stale.** The `00-project-control/` files win.

---

## Active Documents (Maintained)

These documents are actively maintained and reflect current reality:

| Document                                         | Purpose                 | Update Trigger                    |
| ------------------------------------------------ | ----------------------- | --------------------------------- |
| `00-project-control/CURRENT_STATE.md`            | Project state           | After any code change             |
| `00-project-control/DECISION_LOG.md`             | Decision history        | After architectural decisions     |
| `00-project-control/ROADMAP_STATUS.md`           | Sprint tracking         | After task completion             |
| `docs/ENGINEERING_HANDBOOK.md`                   | Development standards   | After process changes             |
| `docs/CHANGELOG.md`                              | Release changelog       | After releases                    |
| `docs/QUALITY_GATES.md`                          | CI/CD quality standards | After CI changes                  |
| `docs/TESTING_STRATEGY.md`                       | Test approach           | After test infrastructure changes |
| `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`        | Deployment guide        | Before releases                   |
| `docs/templates/IMPLEMENTATION_TASK_TEMPLATE.md` | Task template           | Rarely                            |

---

## Archived Documents

All documents in `docs/archive/` are:

- **Read-only** — No longer updated
- **Historical** — Preserved for reference about past decisions and processes
- **Superseded** — Replaced by `00-project-control/` documents

### Archive Categories

| Category      | Count | Contents                                            |
| ------------- | ----- | --------------------------------------------------- |
| `migrations/` | 22    | UX-3D Sprint execution reports, import wave reports |
| `registries/` | 6     | Old component/feature/project registries            |
| `roadmaps/`   | 3     | Completed development/product roadmaps              |
| `tech-debt/`  | 3     | Resolved technical debt reports                     |
| `security/`   | 1     | Pre-hardening security audit                        |
| Root archive  | 26+   | Older architecture audits, reports                  |

---

## Documentation Ownership Rules

| Area                  | Owner                     | Update Frequency                |
| --------------------- | ------------------------- | ------------------------------- |
| `00-project-control/` | Lead developer / AI agent | After every implementation task |
| Architecture docs     | Lead developer            | On architectural changes        |
| Feature reports       | Implementing developer    | At feature completion           |
| Audit reports         | Auditor                   | At audit time (then frozen)     |
| Engineering handbook  | Team                      | On process changes              |
| Templates             | Team lead                 | Rarely                          |
| Archive               | Nobody                    | Never (read-only)               |

### When to Update Documentation

1. **After every code change**: Update `CURRENT_STATE.md` metrics if counts changed
2. **After architectural decisions**: Add entry to `DECISION_LOG.md`
3. **After task completion**: Update `ROADMAP_STATUS.md` status
4. **After feature completion**: Create integration report in `docs/`
5. **Never**: Modify archived documents

### When to Archive

A document should be archived when:

- Its content is fully superseded by `00-project-control/` documents
- The migration/task it describes is 100% complete
- Its metrics/counts are no longer accurate and won't be maintained
- It references components/features that no longer exist

---

## Documentation Health

- **Canonical source of truth**: `docs/00-project-control/` (3 files)
- **Archive coverage**: 37+ documents moved to archive
- **Remaining active docs**: ~60 files in `docs/`
- **Stale risk**: Low (source of truth pattern prevents drift)
