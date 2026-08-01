from pathlib import Path

route = Path("server/src/routes/lifecycle.ts")
text = route.read_text()
text = text.replace(
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";',
    'import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createLifecycleRouter(): Router {',
    'export function createLifecycleRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '  router.post("/start", (req, res) => {',
    '  router.post("/start", async (req, res) => {',
    1,
)
text = text.replace(
    '    const lifecycle = controller.start(gameId);',
    '    if (!(await access.requireProjectAccess(req, res, gameId))) return;\n    const lifecycle = controller.start(gameId);',
    1,
)
text = text.replace(
    '      controller.tick(gameId);',
    '      if (!blueprint.id || blueprint.id !== gameId) {\n        res.status(400).json({\n          success: false,\n          error: "blueprint.id must match gameId",\n        });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, gameId))) return;\n\n      controller.tick(gameId);',
    1,
)
text = text.replace(
    '  router.post("/patch", (req, res) => {',
    '  router.post("/patch", async (req, res) => {',
    1,
)
text = text.replace(
    '      const result = liveUpdate.applyPatches(blueprint, patches);',
    '      if (!blueprint.id) {\n        res.status(400).json({ success: false, error: "blueprint.id required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n      const result = liveUpdate.applyPatches(blueprint, patches);',
    1,
)
text = text.replace(
    '  router.get("/status/:gameId", (req, res) => {',
    '  router.get("/status/:gameId", async (req, res) => {',
    1,
)
text = text.replace(
    '    const lifecycle = controller.getLifecycle(req.params.gameId);',
    '    if (!(await access.requireProjectAccess(req, res, req.params.gameId))) return;\n    const lifecycle = controller.getLifecycle(req.params.gameId);',
    1,
)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/lifecycle", createLifecycleRouter());',
    'app.use("/api/lifecycle", createLifecycleRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const lifecycleScopeEvidence =" not in matrix:
    anchor = '''const worldScopeEvidence =\n  "server/src/__tests__/security2gE.world-scope.test.ts";\n'''
    addition = '''const lifecycleScopeEvidence =\n  "server/src/__tests__/security2gE.lifecycle-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("lifecycle evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.lifecycle.start" not in matrix:
    block = '''  ...[\n    ["POST /start", "project.lifecycle.start", "body-game-project"],\n    ["POST /tick", "project.lifecycle.tick", "body-game-project"],\n    ["POST /patch", "project.lifecycle.patch", "body-blueprint-project"],\n    ["GET /status/:gameId", "project.lifecycle.status.read", "path-game-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/lifecycle.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      lifecycleScopeEvidence,\n      lifecycleScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("lifecycle classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
