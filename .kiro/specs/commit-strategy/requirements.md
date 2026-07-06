# Requirements Document

## Introduction

The Commit Strategy feature provides an automated system that enforces Conventional Commits conventions, ensures atomic commits (one logical change per commit), and can automatically split unrelated changes into separate commits. This system integrates into the RobloxAiStudio-DevKit development workflow to maintain a clean, navigable, and meaningful git history.

## Glossary

- **Commit_Strategy_Engine**: The core module responsible for analyzing staged changes, classifying them by type and scope, and producing well-formed commit operations.
- **Change_Analyzer**: The component that inspects file diffs to determine the logical purpose of each change (feature, fix, refactor, etc.).
- **Commit_Splitter**: The component that separates unrelated changes into distinct, atomic commits.
- **Commit_Formatter**: The component that constructs commit messages following the Conventional Commits specification.
- **Logical_Change**: A set of related modifications that together accomplish a single purpose (e.g., one bug fix, one new feature, one refactor).
- **Commit_Type**: One of the allowed Conventional Commits types: feat, fix, refactor, perf, docs, test, build, ci, chore.
- **Scope**: An optional noun describing the section of the codebase affected by a commit (e.g., parser, pipeline, auth).
- **Atomic_Commit**: A commit that contains exactly one logical change and can be reverted independently without breaking other functionality.
- **Conventional_Commits_Format**: The message format `<type>(<scope>): <description>` with optional body and footer sections.

## Requirements

### Requirement 1: Commit Message Format Validation

**User Story:** As a developer, I want all commit messages to follow the Conventional Commits format, so that the git history is consistent and machine-readable.

#### Acceptance Criteria

1. THE Commit_Formatter SHALL produce commit messages in the format `<type>(<scope>): <description>` when a scope is provided, or `<type>: <description>` when no scope is provided, where the scope field is optional and limited to lowercase alphanumeric characters, hyphens, and a maximum length of 32 characters.
2. THE Commit_Formatter SHALL restrict the type field to one of: feat, fix, refactor, perf, docs, test, build, ci, chore.
3. IF a commit message contains a type not in the allowed list, THEN THE Commit_Strategy_Engine SHALL reject the commit and return an error specifying the invalid type.
4. THE Commit_Formatter SHALL limit the description field to a minimum of 1 character and a maximum of 72 characters.
5. THE Commit_Formatter SHALL begin the description field with a lowercase letter.
6. THE Commit_Formatter SHALL omit a trailing period from the description field.
7. WHEN a commit includes breaking changes, THE Commit_Formatter SHALL append a `!` after the type/scope and include a `BREAKING CHANGE:` footer in the commit body.
8. IF the description field exceeds 72 characters, begins with an uppercase letter, or ends with a period, THEN THE Commit_Strategy_Engine SHALL reject the commit and return an error indicating which format rule was violated.

### Requirement 2: Change Analysis and Classification

**User Story:** As a developer, I want the system to automatically determine what type of change each modification represents, so that I do not need to manually classify every commit.

#### Acceptance Criteria

1. WHEN staged changes are provided, THE Change_Analyzer SHALL classify each file diff into exactly one Commit_Type.
2. THE Change_Analyzer SHALL classify additions of new exported functions, classes, or modules as type `feat`.
3. THE Change_Analyzer SHALL classify modifications to existing functions or methods where the change alters a return value, output, or side effect to match expected behavior as type `fix`.
4. THE Change_Analyzer SHALL classify structural code changes (renames, extractions, moves) where all existing tests continue to pass without modification as type `refactor`.
5. THE Change_Analyzer SHALL classify changes to documentation files (such as .md, .txt, or .rst files) or changes that only modify code comments as type `docs`.
6. THE Change_Analyzer SHALL classify additions or modifications to test files as type `test`.
7. THE Change_Analyzer SHALL classify changes to build configuration or dependency files as type `build`.
8. THE Change_Analyzer SHALL classify changes to CI/CD pipeline configuration files as type `ci`.
9. THE Change_Analyzer SHALL classify changes that modify algorithmic complexity, add caching, or reduce resource allocation within existing functions without changing their external interface as type `perf`.
10. THE Change_Analyzer SHALL classify maintenance tasks that do not fit any of the above categories as type `chore`.
11. IF a file diff matches classification rules for more than one Commit_Type, THEN THE Change_Analyzer SHALL apply the following precedence order (highest to lowest): feat, fix, perf, refactor, docs, test, build, ci, chore, and assign the highest-precedence matching type.
12. IF the Change_Analyzer cannot determine a Commit_Type for a file diff, THEN THE Change_Analyzer SHALL assign type `chore` and flag the classification for manual review in the validation report.

### Requirement 3: Atomic Commit Enforcement

**User Story:** As a developer, I want each commit to represent exactly one logical change, so that the history is easy to navigate, bisect, and revert.

#### Acceptance Criteria

1. THE Commit_Strategy_Engine SHALL ensure each commit contains exactly one Logical_Change, where a Logical_Change is defined as a set of modifications that share a single intent: one bug fix, one feature addition, one refactor operation, or one configuration change.
2. IF staged changes contain modifications belonging to more than one Logical_Change, THEN THE Commit_Strategy_Engine SHALL present the user with the identified groups and their proposed split before creating separate commits for each group.
3. THE Commit_Strategy_Engine SHALL determine logical change boundaries by grouping modifications that share at least one of the following observable attributes: modifications within the same directory subtree (no more than 2 levels apart), modifications referencing the same function or class scope, or modifications of the same change type (addition, deletion, rename, or content edit).
4. WHEN a single file contains changes belonging to multiple Logical_Changes, THE Commit_Splitter SHALL split the file diff at hunk boundaries to separate the changes.
5. IF a single file contains changes belonging to multiple Logical_Changes that cannot be separated at hunk boundaries because modifications are interleaved within the same hunk, THEN THE Commit_Splitter SHALL keep the unsplittable hunk in one group, assign it to the group with the most related surrounding changes, and notify the user which hunk could not be split.

### Requirement 4: Automatic Change Splitting

**User Story:** As a developer, I want unrelated changes to be automatically split into separate commits, so that I do not need to manually stage and commit each group of changes.

#### Acceptance Criteria

1. WHEN the Change_Analyzer detects multiple Logical_Changes in the staged area, THE Commit_Splitter SHALL group file changes into separate commit sets, where each commit set contains only files belonging to the same Logical_Change as determined by shared Commit_Type, shared Scope, and file path proximity.
2. WHEN the Commit_Splitter produces commit sets, THE Commit_Splitter SHALL assign each commit set exactly one Commit_Type and one Scope based on the changes it contains, permitting multiple commit sets to share the same Commit_Type if their Scopes differ.
3. THE Commit_Splitter SHALL order the resulting commits so that commits introducing new exports, types, or modules appear before commits that reference those exports, types, or modules.
4. THE Commit_Splitter SHALL produce commits where each commit individually passes the project's configured build command without errors.
5. IF the Commit_Splitter cannot separate changes without breaking build integrity, THEN THE Commit_Splitter SHALL combine the inseparable changes into a single commit and annotate the commit body with a description indicating which Logical_Changes were combined and why separation was not possible.
6. IF the Commit_Splitter detects a circular dependency between two or more commit sets, THEN THE Commit_Splitter SHALL combine the circularly dependent commit sets into a single commit and annotate the commit body with a description indicating the circular dependency.
7. WHEN the Change_Analyzer detects exactly one Logical_Change in the staged area, THE Commit_Splitter SHALL produce a single commit set containing all staged changes without splitting.
8. THE Commit_Splitter SHALL produce no more than 10 commit sets from a single splitting operation.

### Requirement 5: Refactoring and Feature Separation

**User Story:** As a developer, I want refactoring to be committed separately from new features, so that reviewers can evaluate structural changes independently from behavior changes.

#### Acceptance Criteria

1. WHEN staged changes contain both refactoring modifications and new feature additions, THE Commit_Splitter SHALL separate the refactoring into a distinct commit from the feature commit.
2. THE Commit_Splitter SHALL order refactoring commits before feature commits that depend on the refactored code.
3. IF refactoring and feature changes modify the same lines of code within the same hunk, THEN THE Commit_Splitter SHALL combine them into a single `feat` commit and include a note in the commit body explaining that refactoring was bundled due to line-level coupling.
4. WHEN refactoring and feature changes modify the same file but in different hunks, THE Commit_Splitter SHALL split the file at hunk boundaries and assign each hunk to the appropriate commit (refactor or feat).

### Requirement 6: Scope Inference

**User Story:** As a developer, I want the system to automatically determine the scope for each commit, so that commit messages accurately reflect which part of the codebase was modified.

#### Acceptance Criteria

1. THE Commit_Formatter SHALL infer the scope from the directory path of the modified files, where top-level module directory is defined as the first directory segment relative to the repository root.
2. WHEN all modified files in a commit reside within a single top-level module directory, THE Commit_Formatter SHALL use that module name as the scope.
3. WHEN modified files in a commit span multiple top-level module directories, THE Commit_Formatter SHALL omit the scope from the commit message.
4. THE Commit_Formatter SHALL normalize scope values to lowercase, replacing underscores and spaces with hyphens, and truncating to a maximum of 32 characters.
5. WHEN all modified files in a commit reside at the repository root (no parent directory), THE Commit_Formatter SHALL omit the scope from the commit message.

### Requirement 7: Commit Strategy Validation Report

**User Story:** As a developer, I want to receive a summary of the proposed commits before they are executed, so that I can review and approve or adjust the strategy.

#### Acceptance Criteria

1. WHEN the Commit_Strategy_Engine completes its analysis, THE Commit_Strategy_Engine SHALL produce a validation report listing each proposed commit with its type, scope, description, and associated files.
2. THE Commit_Strategy_Engine SHALL include a confidence score between 0.00 and 1.00, rounded to two decimal places, for each proposed commit classification.
3. IF a proposed commit has a confidence score below 0.70, THEN THE Commit_Strategy_Engine SHALL visually distinguish that commit in the validation report with a review-needed indicator and the reason for low confidence.
4. THE Commit_Strategy_Engine SHALL present the validation report to the developer and wait for an explicit approve or reject response before executing any git operations.
5. IF the developer rejects the validation report, THEN THE Commit_Strategy_Engine SHALL discard the proposed commit strategy, preserve all staged changes unmodified, and return control to the developer without executing any git operations.
6. IF the Commit_Strategy_Engine analysis produces zero proposed commits from the staged changes, THEN THE Commit_Strategy_Engine SHALL display a message indicating that no logical changes were detected and shall not present an empty validation report.

### Requirement 8: Commit Message Parsing (Round-Trip)

**User Story:** As a developer, I want commit messages to be parseable back into structured data, so that tooling can extract type, scope, and description from existing commits.

#### Acceptance Criteria

1. WHEN a valid Conventional_Commits_Format string is provided, THE Commit_Formatter SHALL parse it into its constituent parts: type, scope (or absent if omitted), description, body (or absent if omitted), footer (or absent if omitted), and a breaking change indicator (true if `!` is present after type/scope or a `BREAKING CHANGE:` footer exists, false otherwise).
2. WHEN structured commit data contains a type from the allowed Commit_Type list and a non-empty description of 72 characters or fewer, THE Commit_Formatter SHALL format it into a valid Conventional_Commits_Format string, omitting scope parentheses when scope is absent and omitting body/footer sections when those fields are absent.
3. FOR ALL structured commit data that conforms to the Commit_Type and description constraints defined in Requirement 1, THE Commit_Formatter SHALL produce field-by-field identical parsed output when the formatted string is parsed back (round-trip property), where whitespace-only differences in body and footer are not considered a mismatch.
4. IF a commit message string does not conform to Conventional_Commits_Format, THEN THE Commit_Formatter SHALL return a parse error that includes a zero-based character offset indicating the position of the first violation and a description of the expected syntax at that position.
5. IF the structured commit data contains a type not in the allowed Commit_Type list or an empty description, THEN THE Commit_Formatter SHALL reject the formatting request and return an error indicating which field failed validation.
