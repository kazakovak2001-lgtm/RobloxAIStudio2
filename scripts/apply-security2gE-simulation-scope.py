from pathlib import Path

route = Path("server/src/routes/simulation.ts")
text = route.read_text()
text = text.replace(
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";',
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createSimulationRouter(): Router {',
    'export function createSimulationRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '      const ticks = req.body.ticks ?? 100;\n\n      // 1. Simulate',
    '      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n\n      const ticks = req.body.ticks ?? 100;\n\n      // 1. Simulate',
    1,
)
text = text.replace(
    '  router.post("/run", (req, res) => {',
    '  router.post("/run", async (req, res) => {',
    1,
)
text = text.replace(
    '      const blueprint = req.body.blueprint as RobloxGameBlueprint;\n      const ticks = req.body.ticks ?? 50;',
    '      const blueprint = req.body.blueprint as RobloxGameBlueprint;\n      if (!blueprint?.id) {\n        res.status(400).json({ success: false, error: "Blueprint with id required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n      const ticks = req.body.ticks ?? 50;',
    1,
)
text = text.replace(
    '  router.get("/metrics/:gameId", (req, res) => {',
    '  router.get("/metrics/:gameId", async (req, res) => {',
    1,
)
metrics_anchor = '''    const stored = results.get(req.params.gameId);\n    if (!stored) {\n      res.status(404).json({ success: false, error: "No simulation data" });\n      return;\n    }\n    res.json({ success: true, data: stored.metrics });\n'''
metrics_replacement = '''    const gameId = req.params.gameId;\n    const stored = results.get(gameId);\n    if (!stored) {\n      res.status(404).json({ success: false, error: "No simulation data" });\n      return;\n    }\n    if (access.hasProjectAccess) {\n      if (!(await access.hasProjectAccess(req, gameId))) {\n        res.status(404).json({ success: false, error: "No simulation data" });\n        return;\n      }\n    } else if (!(await access.requireProjectAccess(req, res, gameId))) {\n      return;\n    }\n    res.json({ success: true, data: stored.metrics });\n'''
if metrics_anchor not in text:
    raise SystemExit("simulation metrics anchor missing")
text = text.replace(metrics_anchor, metrics_replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/simulate", createSimulationRouter());',
    'app.use("/api/simulate", createSimulationRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const simulationScopeEvidence =" not in matrix:
    anchor = '''const compileScopeEvidence =\n  "server/src/__tests__/security2gE.compile-scope.test.ts";\n'''
    addition = '''const simulationScopeEvidence =\n  "server/src/__tests__/security2gE.simulation-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("simulation evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.simulation.game.execute" not in matrix:
    block = '''  ...[\n    ["POST /game", "project.simulation.game.execute", "body-blueprint-project"],\n    ["POST /run", "project.simulation.run.execute", "body-blueprint-project"],\n    ["GET /metrics/:gameId", "project.simulation.metrics.read", "path-game-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/simulation.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      simulationScopeEvidence,\n      simulationScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/simulation.ts|POST /feedback",\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      "system.simulation.feedback.analyze",\n      "request-simulation-report",\n      simulationScopeEvidence,\n      simulationScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("simulation classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
