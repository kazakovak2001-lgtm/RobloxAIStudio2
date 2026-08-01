from pathlib import Path

route = Path("server/src/routes/compile.ts")
text = route.read_text()
text = text.replace(
    'import { AgentRegistry } from "../agents/core/AgentRegistry";',
    'import { AgentRegistry } from "../agents/core/AgentRegistry";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createCompileRouter(agentRegistry: AgentRegistry): Router {',
    'export function createCompileRouter(\n  agentRegistry: AgentRegistry,\n  access: ProjectAccessControl,\n): Router {',
    1,
)
anchor = '''      const startTime = Date.now();\n      const { intent, constraints, projectId } = req.body;\n\n      // Stage 1: Plan\n'''
replacement = '''      const startTime = Date.now();\n      const { intent, constraints, projectId } = req.body;\n      if (typeof projectId !== "string" || projectId.trim().length === 0) {\n        res.status(400).json({ success: false, error: "projectId is required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n      // Stage 1: Plan\n'''
if anchor not in text:
    raise SystemExit("compile guard anchor missing")
text = text.replace(anchor, replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/compile", createCompileRouter(agentRegistry));',
    'app.use("/api/compile", createCompileRouter(agentRegistry, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const compileScopeEvidence =" not in matrix:
    anchor = '''const systemMetadataScopeEvidence =\n  "server/src/__tests__/security2gE.system-metadata-scope.test.ts";\n'''
    addition = '''const compileScopeEvidence =\n  "server/src/__tests__/security2gE.compile-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("compile evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.compile.execute" not in matrix:
    block = '''  [\n    "rest|server/src/routes/compile.ts|POST /",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.compile.execute",\n      "body-project",\n      compileScopeEvidence,\n      compileScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("compile classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
