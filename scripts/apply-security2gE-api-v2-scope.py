from pathlib import Path

route = Path("server/src/api/v2/index.ts")
text = route.read_text()
text = text.replace(
    'import { ExecutionTracer } from "../../core/observability/ExecutionTracer";',
    'import { ExecutionTracer } from "../../core/observability/ExecutionTracer";\nimport type { ProjectAccessControl } from "../../routes/projects";',
    1,
)
text = text.replace(
    '  gateway: ApiGateway,\n): Router {',
    '  gateway: ApiGateway,\n  access: ProjectAccessControl,\n): Router {',
    1,
)
text = text.replace(
    '  router.post("/compile/stream", async (req, res) => {\n    const traceId = (req as RequestWithTrace).traceId;\n\n    // Set SSE headers',
    '  router.post("/compile/stream", async (req, res) => {\n    const traceId = (req as RequestWithTrace).traceId;\n    const projectId = req.body.projectId;\n    if (!projectId || typeof projectId !== "string") {\n      res.status(400).json(formatter.error("PROJECT_ID_REQUIRED", "projectId is required", undefined, { traceId }));\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n    // Set SSE headers',
    1,
)
text = text.replace('      const { intent, constraints, projectId } = req.body;', '      const { intent, constraints } = req.body;', 1)
text = text.replace('  router.post("/plan/dag", (req, res) => {', '  router.post("/plan/dag", async (req, res) => {', 1)
text = text.replace(
    '    try {\n      const planner = new PlannerEngine();',
    '    try {\n      const projectId = req.body.projectId;\n      if (!projectId || typeof projectId !== "string") {\n        res.status(400).json(formatter.error("PROJECT_ID_REQUIRED", "projectId is required", undefined, { traceId, startTime }));\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n      const planner = new PlannerEngine();',
    1,
)
text = text.replace('        projectId: req.body.projectId,', '        projectId,', 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/v2", createV2Router(agentRegistry, gateway));',
    'app.use("/api/v2", createV2Router(agentRegistry, gateway, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const apiV2ScopeEvidence =" not in matrix:
    marker = '''const apiV1ScopeEvidence =\n  "server/src/__tests__/security2gE.api-v1-scope.test.ts";\n'''
    matrix = matrix.replace(marker, marker + '''const apiV2ScopeEvidence =\n  "server/src/__tests__/security2gE.api-v2-scope.test.ts";\n''', 1)
if "project.api.v2.compile.stream" not in matrix:
    block = '''  ...[\n    ["POST /compile/stream", "project.api.v2.compile.stream"],\n    ["POST /plan/dag", "project.api.v2.plan.dag.create"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/api/v2/index.ts|${operation}`,\n    classified("project-owner", "user-session", capability, "body-project", apiV2ScopeEvidence, apiV2ScopeEvidence),\n  ] as const),\n  [\n    "rest|server/src/api/v2/index.ts|GET /status",\n    classified("authenticated", "user-session", "system.api.v2.status.read", "api-v2-metadata", apiV2ScopeEvidence, apiV2ScopeEvidence),\n  ],\n'''
    matrix = matrix.replace("]);\n\nconst current = JSON.parse(", block + "]);\n\nconst current = JSON.parse(", 1)
generator.write_text(matrix)
