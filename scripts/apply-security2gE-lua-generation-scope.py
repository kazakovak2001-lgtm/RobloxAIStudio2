from pathlib import Path

route = Path("server/src/routes/luaGeneration.ts")
text = route.read_text()
text = text.replace(
    'import type { GameplaySystem } from "../generation/lua";',
    'import type { GameplaySystem } from "../generation/lua";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createLuaGenerationRouter(): Router {',
    'export function createLuaGenerationRouter(access: ProjectAccessControl): Router {',
    1,
)
for operation in ["/generate", "/generate-full", "/assemble-experience", "/generate-assets"]:
    text = text.replace(
        f'  router.post("{operation}", (req, res) => {{',
        f'  router.post("{operation}", async (req, res) => {{',
        1,
    )

validation = '''    if (!projectId || !gameName) {\n      res\n        .status(400)\n        .json({ success: false, error: "projectId and gameName required" });\n      return;\n    }\n'''
guarded = validation + '''    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n'''
if text.count(validation) != 4:
    raise SystemExit("lua generation validation anchors missing")
text = text.replace(validation, guarded)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/lua", createLuaGenerationRouter());',
    'app.use("/api/lua", createLuaGenerationRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const luaGenerationScopeEvidence =" not in matrix:
    anchor = '''const generationV2ScopeEvidence =\n  "server/src/__tests__/security2gE.generation-v2-scope.test.ts";\n'''
    addition = '''const luaGenerationScopeEvidence =\n  "server/src/__tests__/security2gE.lua-generation-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("lua generation evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.lua.generate" not in matrix:
    block = '''  ...[\n    ["POST /generate", "project.lua.generate"],\n    ["POST /generate-full", "project.lua.generate-full"],\n    ["POST /assemble-experience", "project.lua.experience.assemble"],\n    ["POST /generate-assets", "project.lua.assets.generate"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/luaGeneration.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      "body-project",\n      luaGenerationScopeEvidence,\n      luaGenerationScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("lua generation classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
