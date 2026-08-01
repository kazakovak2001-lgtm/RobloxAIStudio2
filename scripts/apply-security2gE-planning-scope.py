from pathlib import Path

route = Path("server/src/routes/planning.ts")
text = route.read_text()
text = text.replace(
    'import { AgentRegistry } from "../agents/core/AgentRegistry";',
    'import { AgentRegistry } from "../agents/core/AgentRegistry";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createPlanningRouter(agentRegistry: AgentRegistry): Router {',
    'export function createPlanningRouter(\n  agentRegistry: AgentRegistry,\n  access: ProjectAccessControl,\n): Router {',
    1,
)

if "const requirePlanProjectAccess =" not in text:
    anchor = '  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();\n\n'
    helper = '''  const plans = new Map<string, ReturnType<PlannerEngine["createPlan"]>>();\n\n  const requirePlanProjectAccess = async (\n    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],\n    res: Parameters<ProjectAccessControl["requireProjectAccess"]>[1],\n    plan: ReturnType<PlannerEngine["createPlan"]>,\n  ): Promise<boolean> => {\n    const projectId = plan.goal.projectId;\n    if (!projectId) {\n      res.status(404).json({ success: false, error: "Plan not found" });\n      return false;\n    }\n    if (access.hasProjectAccess) {\n      if (await access.hasProjectAccess(req, projectId)) return true;\n      res.status(404).json({ success: false, error: "Plan not found" });\n      return false;\n    }\n    return access.requireProjectAccess(req, res, projectId);\n  };\n\n'''
    if anchor not in text:
        raise SystemExit("planning helper anchor missing")
    text = text.replace(anchor, helper, 1)

text = text.replace(
    '  router.post("/create", (req, res) => {',
    '  router.post("/create", async (req, res) => {',
    1,
)
text = text.replace(
    '    try {\n      const goal: PlanGoal = {',
    '    try {\n      const projectId = req.body.projectId;\n      if (typeof projectId !== "string" || projectId.trim().length === 0) {\n        res.status(400).json({ success: false, error: "projectId is required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n      const goal: PlanGoal = {',
    1,
)
text = text.replace(
    '        projectId: req.body.projectId,',
    '        projectId,',
    1,
)
text = text.replace(
    '      const execOptions: ExecutionOptions = {',
    '      if (!(await requirePlanProjectAccess(req, res, plan))) return;\n\n      const execOptions: ExecutionOptions = {',
    1,
)
text = text.replace(
    '  router.get("/:id", (req, res) => {',
    '  router.get("/:id", async (req, res) => {',
    1,
)
text = text.replace(
    '    res.json({\n      success: true,',
    '    if (!(await requirePlanProjectAccess(req, res, plan))) return;\n\n    res.json({\n      success: true,',
    1,
)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/plan", createPlanningRouter(agentRegistry));',
    'app.use("/api/plan", createPlanningRouter(agentRegistry, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const planningScopeEvidence =" not in matrix:
    anchor = '''const memoryScopeEvidence =\n  "server/src/__tests__/security2gE.memory-scope.test.ts";\n'''
    addition = '''const planningScopeEvidence =\n  "server/src/__tests__/security2gE.planning-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("planning evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.planning.create" not in matrix:
    block = '''  ...[\n    ["POST /create", "project.planning.create", "body-project"],\n    ["POST /execute", "project.planning.execute", "resolved-plan-project"],\n    ["GET /:id", "project.planning.read", "resolved-plan-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/planning.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      planningScopeEvidence,\n      planningScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("planning classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
