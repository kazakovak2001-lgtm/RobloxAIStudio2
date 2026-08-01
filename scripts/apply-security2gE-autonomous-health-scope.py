from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()

if "const autonomousHealthScopeEvidence =" not in matrix:
    anchor = '''const agentCollaborationScopeEvidence =
  "server/src/__tests__/security2gE.agent-collaboration-scope.test.ts";
'''
    addition = '''const autonomousHealthScopeEvidence =
  "server/src/__tests__/security2gE.autonomous-health-scope.test.ts";
'''
    if anchor not in matrix:
        raise SystemExit("evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.autonomous.latest.read" not in matrix:
    block = '''  [
    "rest|server/src/routes/autonomous.ts|GET /project/:projectId/latest",
    classified(
      "project-owner",
      "user-session",
      "project.autonomous.latest.read",
      "path-project",
      autonomousHealthScopeEvidence,
      autonomousHealthScopeEvidence,
    ),
  ],
  ...[
    ["GET /health/database", "system.health.database.read"],
    ["GET /health/storage", "system.health.storage.read"],
  ].map(([operation, capability]) => [
    `rest|server/src/index.ts|${operation}`,
    classified(
      "authenticated",
      "user-session-or-api-key",
      capability,
      "system-operational-metadata",
      autonomousHealthScopeEvidence,
      autonomousHealthScopeEvidence,
    ),
  ] as const),
'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
