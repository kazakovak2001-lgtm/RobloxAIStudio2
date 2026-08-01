from pathlib import Path

route = Path("server/src/routes/repair.ts")
text = route.read_text()
text = text.replace(
    'import type { PlaytestInput } from "../playtest";',
    'import type { PlaytestInput } from "../playtest";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createRepairRouter(): Router {',
    'export function createRepairRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '  router.post("/run", (req, res) => {',
    '  router.post("/run", async (req, res) => {',
    1,
)
run_anchor = '''    const input: PlaytestInput = {\n      projectId,\n      scripts: scripts ?? [],\n      assets: assets ?? [],\n      dependencyGraph,\n    };\n\n    const session = engine.run(input, config);\n'''
run_replacement = '''    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n    const input: PlaytestInput = {\n      projectId,\n      scripts: scripts ?? [],\n      assets: assets ?? [],\n      dependencyGraph,\n    };\n\n    const session = engine.run(input, config);\n'''
if run_anchor not in text:
    raise SystemExit("repair run anchor missing")
text = text.replace(run_anchor, run_replacement, 1)

text = text.replace(
    '  router.get("/:projectId", (req, res) => {',
    '  router.get("/:projectId", async (req, res) => {',
    1,
)
session_anchor = '''  router.get("/:projectId", async (req, res) => {\n    const session = engine.getSession(req.params.projectId);\n    if (!session) {\n'''
session_replacement = '''  router.get("/:projectId", async (req, res) => {\n    const projectId = req.params.projectId;\n    const session = engine.getSession(projectId);\n    if (!session) {\n'''
if session_anchor not in text:
    raise SystemExit("repair session anchor missing")
text = text.replace(session_anchor, session_replacement, 1)
session_return_anchor = '''      return;\n    }\n    res.json({ success: true, data: session });\n  });\n'''
session_return_replacement = '''      return;\n    }\n    if (access.hasProjectAccess) {\n      if (!(await access.hasProjectAccess(req, projectId))) {\n        res\n          .status(404)\n          .json({ success: false, error: "No repair session found" });\n        return;\n      }\n    } else if (!(await access.requireProjectAccess(req, res, projectId))) {\n      return;\n    }\n    res.json({ success: true, data: session });\n  });\n'''
if session_return_anchor not in text:
    raise SystemExit("repair session conceal anchor missing")
text = text.replace(session_return_anchor, session_return_replacement, 1)

text = text.replace(
    '  router.get("/history/:projectId", (req, res) => {',
    '  router.get("/history/:projectId", async (req, res) => {',
    1,
)
history_anchor = '''  router.get("/history/:projectId", async (req, res) => {\n    const history = engine.getHistory(req.params.projectId);\n    res.json({ success: true, data: history });\n  });\n'''
history_replacement = '''  router.get("/history/:projectId", async (req, res) => {\n    const projectId = req.params.projectId;\n    const history = engine.getHistory(projectId);\n    if (access.hasProjectAccess) {\n      if (!(await access.hasProjectAccess(req, projectId))) {\n        res\n          .status(404)\n          .json({ success: false, error: "No repair history found" });\n        return;\n      }\n    } else if (!(await access.requireProjectAccess(req, res, projectId))) {\n      return;\n    }\n    res.json({ success: true, data: history });\n  });\n'''
if history_anchor not in text:
    raise SystemExit("repair history anchor missing")
text = text.replace(history_anchor, history_replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/repair", createRepairRouter());',
    'app.use("/api/repair", createRepairRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const repairScopeEvidence =" not in matrix:
    anchor = '''const playtestScopeEvidence =\n  "server/src/__tests__/security2gE.playtest-scope.test.ts";\n'''
    addition = '''const repairScopeEvidence =\n  "server/src/__tests__/security2gE.repair-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("repair evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.repair.run" not in matrix:
    block = '''  ...[\n    ["POST /run", "project.repair.run", "body-project"],\n    ["GET /:projectId", "project.repair.session.read", "path-project"],\n    ["GET /history/:projectId", "project.repair.history.read", "path-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/repair.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      repairScopeEvidence,\n      repairScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("repair classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
