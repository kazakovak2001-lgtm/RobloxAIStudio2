from pathlib import Path

route = Path("server/src/routes/distributed.ts")
text = route.read_text()
text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)
text = text.replace(
    'import { ExecutionCoordinator } from "../distributed/execution/ExecutionCoordinator";',
    'import { ExecutionCoordinator } from "../distributed/execution/ExecutionCoordinator";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)

if "function requireDistributedOperator(" not in text:
    marker = 'import type { ProjectAccessControl } from "./projects";\n\n'
    helper = '''import type { ProjectAccessControl } from "./projects";\n\nfunction requireDistributedOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n  const operatorIds = new Set(\n    (process.env.DISTRIBUTED_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res.status(403).json({ success: false, error: "Distributed operator access required" });\n    return;\n  }\n  next();\n}\n\n'''
    text = text.replace(marker, helper, 1)

text = text.replace(
    '  coordinator: ExecutionCoordinator,\n): Router {',
    '  coordinator: ExecutionCoordinator,\n  access: ProjectAccessControl,\n): Router {',
    1,
)

if "filterAuthorizedDeadLetters" not in text:
    marker = "  const router = Router();\n"
    helper = '''  const router = Router();\n\n  const requireJobProjectAccess = async (req: Request, res: Response, jobId: string) => {\n    const job = coordinator.getJobStatus(jobId);\n    if (!job || !job.projectId) {\n      res.status(404).json({ success: false, error: "Job not found" });\n      return undefined;\n    }\n    if (!(await access.requireProjectAccess(req, res, job.projectId))) return undefined;\n    return job;\n  };\n\n  const filterAuthorizedDeadLetters = async (req: Request) => {\n    const visible = [];\n    for (const entry of coordinator.getQueue().getDeadLetterQueue()) {\n      if (!entry.job.projectId) continue;\n      if (access.hasProjectAccess && (await access.hasProjectAccess(req, entry.job.projectId))) {\n        visible.push(entry);\n      }\n    }\n    return visible;\n  };\n'''
    text = text.replace(marker, helper, 1)

text = text.replace('router.post("/submit", (req, res) => {', 'router.post("/submit", async (req, res) => {', 1)
anchor = '''      if (!intent || typeof intent !== "string") {\n        res.status(400).json({ success: false, error: "intent is required" });\n        return;\n      }\n\n      const job = coordinator.submit({'''
replacement = '''      if (!intent || typeof intent !== "string") {\n        res.status(400).json({ success: false, error: "intent is required" });\n        return;\n      }\n      if (!projectId || typeof projectId !== "string") {\n        res.status(400).json({ success: false, error: "projectId is required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n      const job = coordinator.submit({'''
text = text.replace(anchor, replacement, 1)

text = text.replace('router.get("/job/:id", (req, res) => {\n    const job = coordinator.getJobStatus(req.params.id);', 'router.get("/job/:id", async (req, res) => {\n    const job = await requireJobProjectAccess(req, res, req.params.id);', 1)
text = text.replace('router.get("/cluster", (_req, res) => {', 'router.get("/cluster", requireDistributedOperator, (_req, res) => {', 1)
text = text.replace('router.get("/queue", (_req, res) => {', 'router.get("/queue", requireDistributedOperator, (_req, res) => {', 1)
text = text.replace('router.get("/workers", (_req, res) => {', 'router.get("/workers", requireDistributedOperator, (_req, res) => {', 1)
text = text.replace('router.post("/scale", (req, res) => {', 'router.post("/scale", requireDistributedOperator, (req, res) => {', 1)
text = text.replace('router.get("/dead-letter", (_req, res) => {\n    const entries = coordinator.getQueue().getDeadLetterQueue();', 'router.get("/dead-letter", async (req, res) => {\n    const entries = await filterAuthorizedDeadLetters(req);', 1)
text = text.replace('router.post("/retry/:id", (req, res) => {\n    const success = coordinator.getQueue().retryDeadLetter(req.params.id);', 'router.post("/retry/:id", async (req, res) => {\n    const job = await requireJobProjectAccess(req, res, req.params.id);\n    if (!job) return;\n    const success = coordinator.getQueue().retryDeadLetter(req.params.id);', 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/distributed", createDistributedRouter(executionCoordinator));',
    'app.use("/api/distributed", createDistributedRouter(executionCoordinator, access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const distributedScopeEvidence =" not in matrix:
    marker = '''const debugOperatorEvidence =\n  "server/src/__tests__/security2gE.debug-operator-boundary.test.ts";\n'''
    matrix = matrix.replace(marker, marker + '''const distributedScopeEvidence =\n  "server/src/__tests__/security2gE.distributed-scope.test.ts";\n''', 1)
if "project.distributed.job.submit" not in matrix:
    block = '''  ...[\n    ["POST /submit", "project.distributed.job.submit", "body-project"],\n    ["GET /job/:id", "project.distributed.job.read", "resolved-job-project"],\n    ["GET /dead-letter", "project.distributed.dead-letter.list", "owner-project-set"],\n    ["POST /retry/:id", "project.distributed.dead-letter.retry", "resolved-job-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/distributed.ts|${operation}`,\n    classified("project-owner", "user-session", capability, scope, distributedScopeEvidence, distributedScopeEvidence),\n  ] as const),\n  ...[\n    ["GET /cluster", "system.distributed.cluster.read"],\n    ["GET /queue", "system.distributed.queue.read"],\n    ["GET /workers", "system.distributed.workers.read"],\n    ["POST /scale", "system.distributed.scale.execute"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/distributed.ts|${operation}`,\n    classified("distributed-operator", "user-session", capability, "global-distributed-runtime", distributedScopeEvidence, distributedScopeEvidence),\n  ] as const),\n'''
    matrix = matrix.replace("]);\n\nconst current = JSON.parse(", block + "]);\n\nconst current = JSON.parse(", 1)
generator.write_text(matrix)
