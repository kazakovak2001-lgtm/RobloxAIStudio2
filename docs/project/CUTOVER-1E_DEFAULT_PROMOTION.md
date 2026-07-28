# CUTOVER-1E Default-Reference Promotion

**Status**: Verified  
**Promotion date**: July 28, 2026  
**Tracking issue**: #28  
**Post-promotion pull request**: #29

## Promoted Reference

The repository default branch was changed through GitHub Settings from:

```text
standing-pentaceratops
```

to:

```text
release/cutover-1e-candidate
```

GitHub repository metadata confirmed the new default branch after the operation.

The promoted reference was independently compared with the verified CUTOVER-1D merge commit:

```text
6b30f2c706c751170f87ec0eacdf42e3d3951543
```

The comparison result was `identical`, with zero commits ahead, zero commits behind, and zero changed files.

## Preserved Rollback Reference

The immutable pre-promotion reference remains:

```text
backup/default-before-cutover-1e
→ 91a1626d080a4bc22ce20648c4ff10481ae6e299
```

It was compared with the previous default tip and verified as `identical`. Rollback must use this pinned reference directly; it must not assume that the movable `standing-pentaceratops` branch still resolves to the same tree.

## Active Branch Ruleset

GitHub ruleset:

```text
Release Branch Protection
Ruleset ID: 19859471
Status: Active
Target: release/cutover-1e-candidate
```

Verified rules:

- bypass list is empty;
- matching branch deletion is restricted;
- force pushes are blocked;
- changes require a pull request;
- required approvals remain `0` for the single-administrator repository;
- review conversations must be resolved before merge;
- the required GitHub Actions check is `Merge Gate`.

## Post-Promotion Validation

The dedicated post-promotion pull request targeted the newly promoted default branch and triggered CI run:

```text
CI Pipeline run: 30319620205 (#259)
Head commit: b6d14ded0755a0860e6ab1520cce74d20759a5a9
```

The run passed all standard checks and the release gates required upstream by the aggregate check, including:

- `TypeScript Check`;
- `ESLint`;
- `Prettier Check`;
- `Test Suite`;
- `PostgreSQL Restart E2E`;
- `Backend Release Image`;
- `Composed HTTPS Release`;
- `Release Baseline Readiness`;
- `Repository Validation`;
- `Commit Message Lint`;
- `Merge Gate`.

`Merge Gate` depends on the preceding CI and release jobs, so its successful conclusion proves that the protected pull request passed the complete post-promotion gate set. The validation changed only this documentation record and did not modify runtime code, business APIs, storage, Studio behavior, Frontend UI, release topology, root `src/`, or legacy deployment inventory.

## Rollback

If post-promotion verification fails:

1. verify that `backup/default-before-cutover-1e` resolves exactly to `91a1626d080a4bc22ce20648c4ff10481ae6e299`;
2. change the repository default branch directly to `backup/default-before-cutover-1e`, or create a deliberately named rollback branch from that pinned commit and use it as the default;
3. do not use `standing-pentaceratops` unless it is first compared with the pinned commit and confirmed as `identical`;
4. preserve `release/cutover-1e-candidate` and `feature/plugin-merge` unchanged for diagnosis;
5. use the independently verified CUTOVER-1A backend and CUTOVER-1B Frontend artifacts documented by CUTOVER-1D.

Legacy frontend cleanup remains unauthorized and must be implemented in a separate reviewed change.
