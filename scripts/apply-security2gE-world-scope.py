from pathlib import Path

route = Path("server/src/routes/world.ts")
text = route.read_text()
text = text.replace(
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";',
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createWorldRouter(): Router {',
    'export function createWorldRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '      const world = new WorldStateEngine();',
    '      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n\n      const world = new WorldStateEngine();',
    1,
)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/world", createWorldRouter());',
    'app.use("/api/world", createWorldRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const worldScopeEvidence =" not in matrix:
    anchor = '''const evaluationOperatorEvidence =\n  "server/src/__tests__/security2gE.evaluation-operator-boundary.test.ts";\n'''
    addition = '''const worldScopeEvidence =\n  "server/src/__tests__/security2gE.world-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("world evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.world.simulate" not in matrix:
    block = '''  [\n    "rest|server/src/routes/world.ts|POST /simulate",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.world.simulate",\n      "body-blueprint-project",\n      worldScopeEvidence,\n      worldScopeEvidence,\n    ),\n  ],\n  ...[\n    ["POST /tick", "system.world.tick.metadata.read", "placeholder-metadata"],\n    ["GET /state/:gameId", "system.world.state.metadata.read", "placeholder-metadata"],\n    ["GET /emergence/:gameId", "system.world.emergence.metadata.read", "placeholder-metadata"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/world.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      scope,\n      worldScopeEvidence,\n      worldScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("world classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
