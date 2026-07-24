# Pre-Implementation Check — AI Project Controller

inclusion: auto

## Purpose

Before implementing ANY new component, service, module, agent, or API endpoint in this project, you MUST run the AI Project Controller pre-check to prevent duplicate creation.

## Rule

**BEFORE creating a new file**, run this check:

```bash
npx tsx scripts/pre-check.ts "<description of what you plan to create>"
```

Or with explicit name:

```bash
npx tsx scripts/pre-check.ts --name=<ComponentName> --type=<component|service|route|agent|hook> "<description>"
```

## Decision Handling

Based on the output:

### ✅ ALLOW (exit code 0)

Proceed with implementation. No duplicates found.

### ⚠️ WARN (exit code 0)

Review the existing implementations shown in the output. Ask the user:

- "I found existing implementations that may overlap. Should I reuse them or create new?"
- Show the paths of similar files found.
- Wait for user confirmation before proceeding.

### 🚫 BLOCK (exit code 1)

DO NOT create the new file. Instead:

1. Show the user the existing implementation paths.
2. Recommend reusing or extending the existing code.
3. If the user insists on creating new, explain the duplication risk.

## What to Check

Run pre-check when you are about to:

- Create a new React component
- Create a new API service file
- Create a new backend route
- Create a new agent implementation
- Create a new hook
- Create a new utility module
- Create any TypeScript file that exports functionality

## Examples

```bash
# Before creating AnalyticsService:
npx tsx scripts/pre-check.ts --name=AnalyticsService "service for tracking metrics and analytics"
# → BLOCK: server/src/routes/analytics.ts already exists

# Before creating a novel feature:
npx tsx scripts/pre-check.ts "quantum physics particle simulator for visual effects"
# → ALLOW: no duplicates found
```

## When to Skip

You may skip pre-check for:

- Test files (*.test.ts)
- Type definition files (types only, no logic)
- Configuration files
- Documentation files (.md)
- Style files (.css)
  AI Workspace Conversational Arc
