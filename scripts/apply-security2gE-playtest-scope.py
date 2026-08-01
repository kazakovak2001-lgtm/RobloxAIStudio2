from pathlib import Path

route = Path("server/src/routes/playtest.ts")
text = route.read_text()
text = text.replace(
    'import type { PlaytestInput } from "../playtest";',
    'import type { PlaytestInput } from "../playtest";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createPlaytestRouter(): Router {',
    'export function createPlaytestRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '  router.post("/run", (req, res) => {',
    '  router.post("/run", async (req, res) => {',
    1,
)
run_anchor = '''    if (!input.scripts || !Array.isArray(input.scripts)) {\n      res\n        .status(400)\n        .json({ success: false, error: "scripts array is required" });\n      return;\n    }\n\n    const report = engine.run(input);\n'''
run_replacement = '''    if (!input.scripts || !Array.isArray(input.scripts)) {\n      res\n        .status(400)\n        .json({ success: false, error: "scripts array is required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, input.projectId))) return;\n\n    const report = engine.run(input);\n'''
if run_anchor not in text:
    raise SystemExit("playtest run anchor missing")
text = text.replace(run_anchor, run_replacement, 1)
text = text.replace(
    '  router.get("/:projectId", (req, res) => {',
    '  router.get("/:projectId", async (req, res) => {',
    1,
)
get_anchor = '''  router.get("/:projectId", async (req, res) => {\n    const report = engine.getReport(req.params.projectId);\n    if (!report) {\n'''
get_replacement = '''  router.get("/:projectId", async (req, res) => {\n    const projectId = req.params.projectId;\n    const report = engine.getReport(projectId);\n    if (!report) {\n'''
if get_anchor not in text:
    raise SystemExit("playtest get anchor missing")
text = text.replace(get_anchor, get_replacement, 1)
conceal_anchor = '''      return;\n    }\n    res.json({ success: true, data: report });\n  });\n'''
conceal_replacement = '''      return;\n    }\n    if (access.hasProjectAccess) {\n      if (!(await access.hasProjectAccess(req, projectId))) {\n        res\n          .status(404)\n          .json({ success: false, error: "No playtest report found" });\n        return;\n      }\n    } else if (!(await access.requireProjectAccess(req, res, projectId))) {\n      return;\n    }\n    res.json({ success: true, data: report });\n  });\n'''
if conceal_anchor not in text:
    raise SystemExit("playtest conceal anchor missing")
text = text.replace(conceal_anchor, conceal_replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/playtest", createPlaytestRouter());',
    'app.use("/api/playtest", createPlaytestRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const playtestScopeEvidence =" not in matrix:
    anchor = '''const luaGenerationScopeEvidence =\n  "server/src/__tests__/security2gE.lua-generation-scope.test.ts";\n'''
    addition = '''const playtestScopeEvidence =\n  "server/src/__tests__/security2gE.playtest-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("playtest evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.playtest.run" not in matrix:
    block = '''  ...[\n    ["POST /run", "project.playtest.run", "body-project"],\n    ["GET /:projectId", "project.playtest.report.read", "path-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/playtest.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      playtestScopeEvidence,\n      playtestScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("playtest classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
