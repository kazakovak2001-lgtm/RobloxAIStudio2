from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()

if "const domainScopeEvidence =" not in matrix:
    anchor = '''const aiChatSessionEvidence =\n  "server/src/__tests__/security2gE.ai-chat-session-boundary.test.ts";\n'''
    addition = '''const domainScopeEvidence =\n  "server/src/__tests__/security2gE.domain-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("domain evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "system.domain.genres.list" not in matrix:
    block = '''  ...[\n    ["GET /genres", "system.domain.genres.list", "domain-taxonomy"],\n    ["GET /genres/:genre", "system.domain.genre.read", "domain-taxonomy"],\n    ["GET /patterns", "system.domain.patterns.read", "domain-knowledge"],\n    ["GET /recommendations", "system.domain.recommendations.read", "domain-knowledge"],\n    ["POST /analyze", "system.domain.analysis.execute", "request-domain-input"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/domain.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      scope,\n      domainScopeEvidence,\n      domainScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("domain classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
