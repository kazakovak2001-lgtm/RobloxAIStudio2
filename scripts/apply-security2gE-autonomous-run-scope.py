from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()

if "const autonomousRunScopeEvidence =" not in matrix:
    anchor = '''const conceptEntryScopeEvidence =\n  "server/src/__tests__/security2gE.concept-entry-scope.test.ts";\n'''
    addition = '''const autonomousRunScopeEvidence =\n  "server/src/__tests__/security2gE.autonomous-run-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("autonomous run evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if '"project.autonomous.run"' not in matrix:
    block = '''  [\n    "rest|server/src/routes/autonomous.ts|POST /run",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.autonomous.run",\n      "body-project",\n      autonomousRunScopeEvidence,\n      autonomousRunScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("autonomous run classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
