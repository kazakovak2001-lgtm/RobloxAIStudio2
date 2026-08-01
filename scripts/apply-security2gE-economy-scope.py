from pathlib import Path

route = Path("server/src/routes/economy.ts")
text = route.read_text()
text = text.replace(
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";',
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createEconomyRouter(): Router {',
    'export function createEconomyRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '      const model = modelEngine.parse(blueprint);',
    '      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n\n      const model = modelEngine.parse(blueprint);',
    1,
)
text = text.replace(
    '  router.post("/simulate", (req, res) => {',
    '  router.post("/simulate", async (req, res) => {',
    1,
)
text = text.replace(
    '      const blueprint = req.body.blueprint as RobloxGameBlueprint;\n      const model = modelEngine.parse(blueprint);',
    '      const blueprint = req.body.blueprint as RobloxGameBlueprint;\n      if (!blueprint?.id) {\n        res.status(400).json({ success: false, error: "Blueprint required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n      const model = modelEngine.parse(blueprint);',
    1,
)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/economy", createEconomyRouter());',
    'app.use("/api/economy", createEconomyRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const economyScopeEvidence =" not in matrix:
    anchor = '''const domainScopeEvidence =\n  "server/src/__tests__/security2gE.domain-scope.test.ts";\n'''
    addition = '''const economyScopeEvidence =\n  "server/src/__tests__/security2gE.economy-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("economy evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.economy.analyze" not in matrix:
    block = '''  ...[\n    ["POST /analyze", "project.economy.analyze"],\n    ["POST /simulate", "project.economy.simulate"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/economy.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      "body-blueprint-project",\n      economyScopeEvidence,\n      economyScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/economy.ts|POST /balance",\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      "system.economy.balance.execute",\n      "request-economy-report",\n      economyScopeEvidence,\n      economyScopeEvidence,\n    ),\n  ],\n  [\n    "rest|server/src/routes/economy.ts|GET /report/:gameId",\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      "system.economy.report.metadata.read",\n      "placeholder-metadata",\n      economyScopeEvidence,\n      economyScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("economy classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
