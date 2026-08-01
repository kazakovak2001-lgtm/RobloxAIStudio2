from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()

if "const systemMetadataScopeEvidence =" not in matrix:
    anchor = '''const planningScopeEvidence =\n  "server/src/__tests__/security2gE.planning-scope.test.ts";\n'''
    addition = '''const systemMetadataScopeEvidence =\n  "server/src/__tests__/security2gE.system-metadata-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("system metadata evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "system.platform.status.read" not in matrix:
    block = '''  ...[\n    ["GET /status", "system.platform.status.read", "platform-runtime-metadata"],\n    ["GET /agents", "system.platform.agents.list", "governance-agent-registry"],\n    ["GET /agents/:id", "system.platform.agent.read", "governance-agent-registry"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/system.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      scope,\n      systemMetadataScopeEvidence,\n      systemMetadataScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("system metadata classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
