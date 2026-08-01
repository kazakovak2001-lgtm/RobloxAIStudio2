from pathlib import Path

route = Path("server/src/api/v1/index.ts")
text = route.read_text()
text = text.replace(
    'import { RobloxProjectCompiler } from "../../export/RobloxProjectCompiler";',
    'import { RobloxProjectCompiler } from "../../export/RobloxProjectCompiler";\nimport type { ProjectAccessControl } from "../../routes/projects";',
    1,
)
text = text.replace(
    '  gateway: ApiGateway,\n): Router {',
    '  gateway: ApiGateway,\n  access: ProjectAccessControl,\n): Router {',
    1,
)
if "requirePlanProjectAccess" not in text:
    marker = '  const formatter = new ResponseFormatter("1.0.0");\n'
    helper = '''  const formatter = new ResponseFormatter("1.0.0");\n\n  const requirePlanProjectAccess = async (req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0], res: Parameters<ProjectAccessControl["requireProjectAccess"]>[1], planId: string) => {\n    const plan = plans.get(planId);\n    const projectId = plan?.goal.projectId;\n    if (!plan || !projectId) {\n      res.status(404).json(formatter.notFound("Plan", planId));\n      return undefined;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return undefined;\n    return plan;\n  };\n'''
    text = text.replace(marker, helper, 1)
# move plans declaration before helper use
text = text.replace('  // ─── POST /compile', '  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();\n\n  // ─── POST /compile', 1)
text = text.replace('  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();\n\n  router.post("/plan/create"', '  router.post("/plan/create"', 1)
text = text.replace('      const { intent, constraints, projectId } = req.body;\n\n      const planner', '      const { intent, constraints, projectId } = req.body;\n      if (!projectId || typeof projectId !== "string") {\n        res.status(400).json(formatter.error("PROJECT_ID_REQUIRED", "projectId is required", undefined, { traceId, startTime }));\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n      const planner', 1)
text = text.replace('  router.post("/plan/create", (req, res) => {', '  router.post("/plan/create", async (req, res) => {', 1)
text = text.replace('    try {\n      const planner = new PlannerEngine();', '    try {\n      const projectId = req.body.projectId;\n      if (!projectId || typeof projectId !== "string") {\n        res.status(400).json(formatter.error("PROJECT_ID_REQUIRED", "projectId is required", undefined, { traceId, startTime }));\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n      const planner = new PlannerEngine();', 1)
text = text.replace('        projectId: req.body.projectId,', '        projectId,', 1)
text = text.replace('      const plan = plans.get(planId);', '      const plan = await requirePlanProjectAccess(req, res, planId);', 1)
text = text.replace('  router.get("/plan/:id", (req, res) => {', '  router.get("/plan/:id", async (req, res) => {', 1)
text = text.replace('    const plan = plans.get(req.params.id);', '    const plan = await requirePlanProjectAccess(req, res, req.params.id);', 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/v1", createV1Router(agentRegistry, gateway));',
    'app.use("/api/v1", createV1Router(agentRegistry, gateway, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const apiV1ScopeEvidence =" not in matrix:
    marker = '''const distributedScopeEvidence =\n  "server/src/__tests__/security2gE.distributed-scope.test.ts";\n'''
    matrix = matrix.replace(marker, marker + '''const apiV1ScopeEvidence =\n  "server/src/__tests__/security2gE.api-v1-scope.test.ts";\n''', 1)
if "project.api.v1.compile" not in matrix:
    block = '''  ...[\n    ["POST /compile", "project.api.v1.compile", "body-project"],\n    ["POST /plan/create", "project.api.v1.plan.create", "body-project"],\n    ["POST /plan/execute", "project.api.v1.plan.execute", "resolved-plan-project"],\n    ["GET /plan/:id", "project.api.v1.plan.read", "resolved-plan-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/api/v1/index.ts|${operation}`,\n    classified("project-owner", "user-session", capability, scope, apiV1ScopeEvidence, apiV1ScopeEvidence),\n  ] as const),\n  ...[\n    ["GET /status", "system.api.v1.status.read"],\n    ["GET /contracts", "system.api.v1.contracts.read"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/api/v1/index.ts|${operation}`,\n    classified("authenticated", "user-session", capability, "api-v1-metadata", apiV1ScopeEvidence, apiV1ScopeEvidence),\n  ] as const),\n'''
    matrix = matrix.replace("]);\n\nconst current = JSON.parse(", block + "]);\n\nconst current = JSON.parse(", 1)
generator.write_text(matrix)
