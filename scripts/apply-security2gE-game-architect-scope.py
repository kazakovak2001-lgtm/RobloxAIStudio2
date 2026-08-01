from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const gameArchitectScopeEvidence =" not in matrix:
    anchor = '''const knowledgeScopeEvidence =\n  "server/src/__tests__/security2gE.knowledge-scope.test.ts";\n'''
    addition = '''const gameArchitectScopeEvidence =\n  "server/src/__tests__/security2gE.game-architect-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("game architect evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "system.game-architect.analysis.execute" not in matrix:
    block = '''  ...[\n    ["POST /analyze", "system.game-architect.analysis.execute"],\n    ["POST /generate-design", "system.game-architect.design.generate"],\n    ["POST /generate-prompts", "system.game-architect.prompts.generate"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/gameArchitect.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      "request-game-idea",\n      gameArchitectScopeEvidence,\n      gameArchitectScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("game architect classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
