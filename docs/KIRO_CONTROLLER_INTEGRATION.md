# Kiro + AI Controller Integration

**Date**: July 17, 2026  
**Status**: Recommendation (not yet implemented)

---

## Overview

Kiro can integrate with the AI Project Controller by calling `POST /api/controller/pre-check` before implementing new features. This prevents duplicate creation at the design phase.

---

## Integration Method: Kiro Steering File

Create a steering file at `.kiro/steering/pre-implementation-check.md` that instructs Kiro to call the pre-check before creating new components:

```markdown
# Pre-Implementation Check

Before creating any new:

- component
- service
- agent
- API endpoint
- module

Call the AI Project Controller pre-check:

POST http://localhost:5000/api/controller/pre-check
Content-Type: application/json

{
"intent": "<description of what you want to create>",
"name": "<proposed name>",
"type": "<component|service|route|agent|hook>",
"files": ["<files that will be affected>"]
}

If the response decision is:

- ALLOW: Proceed with implementation
- WARN: Show the user existing solutions and ask for confirmation
- BLOCK: Do NOT create. Show existing implementation and recommend reuse.
```

---

## Integration Method: Kiro Hook (preTaskExecution)

A Kiro hook can automate this check before any task execution:

```
Event: preTaskExecution
Action: askAgent
Prompt: "Before implementing this task, call POST /api/controller/pre-check with the task description as intent. If BLOCK is returned, stop and recommend reuse."
```

---

## Integration Method: Kiro Spec Workflow

When generating tasks from a spec (requirements → design → tasks), the task generation phase can include a pre-check step:

```
Task 0 (auto-generated):
  - Call pre-check for each component in the design
  - If duplicates found, modify the task to "reuse existing" instead of "create new"
```

---

## API Endpoint Details

### Request

```
POST /api/controller/pre-check

{
  "intent": "Create a notification system for the workspace",
  "name": "NotificationService",
  "type": "service",
  "exports": ["NotificationService", "useNotifications"],
  "files": ["src/services/notificationService.ts"],
  "context": { "feature": "workspace-notifications" }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "decision": "WARN",
    "reason": "Potential duplicate found (50% confidence). Review existing implementations.",
    "existingSolutions": {
      "duplicateDetected": true,
      "confidence": 50,
      "matches": [
        {
          "path": "src/shared/ui/Toast.tsx",
          "relevance": 50,
          "reason": "export: useToast"
        }
      ]
    },
    "architectureImpact": {
      "currentViolations": 0,
      "recommendations": [],
      "existingDependents": [],
      "fileImpacts": []
    },
    "decisionMemory": {
      "priorDecisions": [],
      "applicableRules": [
        {
          "id": "gov-arch-1",
          "rule": "Never redesign architecture. Extend, do not replace."
        }
      ],
      "recommendation": "..."
    },
    "recommendation": "Review existing implementations before proceeding"
  }
}
```

---

## Server Requirement

The AI Controller requires the backend server to be running:

```bash
npm run dev:server  # Start on port 5000
```

For offline development without the server, use the CLI script:

```bash
npx tsx scripts/validate-controller.ts
```

---

## Implementation Steps

1. Create `.kiro/steering/pre-implementation-check.md` with the instructions above
2. Optionally create a Kiro hook for `preTaskExecution`
3. Ensure `npm run dev:server` is part of the development setup

---

## Limitations

- Requires backend server running (port 5000)
- No authentication bypass for local dev (server runs without auth in dev mode)
- Response time: ~500-800ms (indexing is lazy — first call is slower)
- Keyword-based matching — no semantic understanding of intent
