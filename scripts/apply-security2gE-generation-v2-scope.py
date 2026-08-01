from pathlib import Path

route = Path("server/src/routes/generation-v2.ts")
text = route.read_text()
text = text.replace(
    'import { AgentRegistry } from "../agents/core/AgentRegistry";',
    'import { AgentRegistry } from "../agents/core/AgentRegistry";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createGenerationV2Router(agentRegistry: AgentRegistry): Router {',
    'export function createGenerationV2Router(\n  agentRegistry: AgentRegistry,\n  access: ProjectAccessControl,\n): Router {',
    1,
)

game_anchor = '''      const { intent, constraints, projectId } = req.body;\n\n      // 1. Plan\n'''
game_replacement = '''      const { intent, constraints, projectId } = req.body;\n      if (typeof projectId !== "string" || projectId.trim().length === 0) {\n        res.status(400).json({ success: false, error: "projectId is required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n      // 1. Plan\n'''
if game_anchor not in text:
    raise SystemExit("generation v2 game anchor missing")
text = text.replace(game_anchor, game_replacement, 1)

text = text.replace(
    '  router.post("/lua", (req, res) => {',
    '  router.post("/lua", async (req, res) => {',
    1,
)
lua_anchor = '''      if (!blueprint) {\n        res.status(400).json({ success: false, error: "Blueprint required" });\n        return;\n      }\n      const lua = luaGen.generate(blueprint);\n'''
lua_replacement = '''      if (!blueprint?.id) {\n        res.status(400).json({ success: false, error: "Blueprint with id required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n      const lua = luaGen.generate(blueprint);\n'''
if lua_anchor not in text:
    raise SystemExit("generation v2 lua anchor missing")
text = text.replace(lua_anchor, lua_replacement, 1)

text = text.replace(
    '  router.post("/export", (req, res) => {',
    '  router.post("/export", async (req, res) => {',
    1,
)
export_anchor = '''      if (!blueprint || !lua || !assets) {\n        res.status(400).json({\n          success: false,\n          error: "blueprint, lua, and assets required",\n        });\n        return;\n      }\n      const result = exporter.build(blueprint, lua, assets);\n'''
export_replacement = '''      if (!blueprint?.id || !lua || !assets) {\n        res.status(400).json({\n          success: false,\n          error: "blueprint with id, lua, and assets required",\n        });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, blueprint.id))) return;\n      const result = exporter.build(blueprint, lua, assets);\n'''
if export_anchor not in text:
    raise SystemExit("generation v2 export anchor missing")
text = text.replace(export_anchor, export_replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/generate", createGenerationV2Router(agentRegistry));',
    'app.use("/api/generate", createGenerationV2Router(agentRegistry, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const generationV2ScopeEvidence =" not in matrix:
    anchor = '''const simulationScopeEvidence =\n  "server/src/__tests__/security2gE.simulation-scope.test.ts";\n'''
    addition = '''const generationV2ScopeEvidence =\n  "server/src/__tests__/security2gE.generation-v2-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("generation v2 evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.generation.v2.game.execute" not in matrix:
    block = '''  ...[\n    ["POST /game", "project.generation.v2.game.execute", "body-project"],\n    ["POST /lua", "project.generation.v2.lua.generate", "body-blueprint-project"],\n    ["POST /export", "project.generation.v2.export.generate", "body-blueprint-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/generation-v2.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      generationV2ScopeEvidence,\n      generationV2ScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/generation-v2.ts|POST /blueprint",\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      "system.generation.v2.blueprint.generate",\n      "request-generation-outputs",\n      generationV2ScopeEvidence,\n      generationV2ScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("generation v2 classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
