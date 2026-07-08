# Changelog Guidelines

Every completed sprint must document changes following these standards.

## Format

Use [Keep a Changelog](https://keepachangelog.com/) format with semantic versioning.

## Categories

Every changelog entry uses exactly these categories:

- **Added** — New functionality.
- **Changed** — Modifications to existing functionality.
- **Fixed** — Bug fixes.
- **Removed** — Deleted functionality.
- **Deprecated** — Functionality marked for future removal.
- **Security** — Security-related changes.

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** — Breaking changes to public API or architecture.
- **MINOR** — New functionality, backward compatible.
- **PATCH** — Bug fixes, backward compatible.

## Entry Format

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added

- Description of new feature. (#issue if applicable)

### Changed

- Description of modification.

### Fixed

- Description of bug fix and root cause.

### Removed

- Description of removed functionality and migration path.
```

## Rules

- Write entries from the user's perspective where possible.
- Be specific. "Fixed bug" is insufficient. "Fixed project creation failing when genre is empty" is correct.
- One entry per logical change.
- Reference sprint version when applicable.
- Keep entries concise but complete.

## Location

Changelog is maintained at: `CHANGELOG.md` (repository root).
