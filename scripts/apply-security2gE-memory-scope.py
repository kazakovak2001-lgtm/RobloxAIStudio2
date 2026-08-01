from pathlib import Path

route = Path("server/src/routes/memory.ts")
text = route.read_text()
text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)
text = text.replace(
    'import { MemoryEngine } from "../memory/core/MemoryEngine";',
    'import { MemoryEngine } from "../memory/core/MemoryEngine";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
if "function requireMemoryOperator(" not in text:
    anchor = 'import type { ProjectAccessControl } from "./projects";\n\n'
    helper = '''import type { ProjectAccessControl } from "./projects";\n\nfunction requireMemoryOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n  const operatorIds = new Set(\n    (process.env.MEMORY_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res.status(403).json({\n      success: false,\n      error: "Memory operator access required",\n    });\n    return;\n  }\n  next();\n}\n\n'''
    if anchor not in text:
        raise SystemExit("memory helper anchor missing")
    text = text.replace(anchor, helper, 1)

text = text.replace(
    'export function createMemoryRouter(): Router {',
    'export function createMemoryRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '  router.get("/:agentId", (req, res) => {',
    '  router.get("/:agentId", async (req, res) => {',
    1,
)
text = text.replace(
    '    const limit = parseInt((req.query.limit as string) ?? "10", 10);\n\n    const entries = engine.getStore().getByAgent(agentId, projectId, limit);',
    '    const limit = parseInt((req.query.limit as string) ?? "10", 10);\n    if (!projectId) {\n      res.status(400).json({ success: false, error: "projectId query parameter required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n    const entries = engine.getStore().getByAgent(agentId, projectId, limit);',
    1,
)
text = text.replace(
    '      const { agentId, projectId, input, output, tags } = req.body;\n      await engine.storeMemory({',
    '      const { agentId, projectId, input, output, tags } = req.body;\n      if (!projectId) {\n        res.status(400).json({ success: false, error: "projectId required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n      await engine.storeMemory({',
    1,
)
text = text.replace(
    '      const { agentId, query, projectId, limit } = req.body;\n      const result = await engine.retrieveMemory(',
    '      const { agentId, query, projectId, limit } = req.body;\n      if (!projectId) {\n        res.status(400).json({ success: false, error: "projectId required" });\n        return;\n      }\n      if (!(await access.requireProjectAccess(req, res, projectId))) return;\n      const result = await engine.retrieveMemory(',
    1,
)
text = text.replace(
    '  router.get("/system/stats", (_req, res) => {',
    '  router.get("/system/stats", requireMemoryOperator, (_req, res) => {',
    1,
)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/memory", createMemoryRouter());',
    'app.use("/api/memory", createMemoryRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const memoryScopeEvidence =" not in matrix:
    anchor = '''const lifecycleScopeEvidence =\n  "server/src/__tests__/security2gE.lifecycle-scope.test.ts";\n'''
    addition = '''const memoryScopeEvidence =\n  "server/src/__tests__/security2gE.memory-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("memory evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.memory.entries.read" not in matrix:
    block = '''  ...[\n    ["GET /:agentId", "project.memory.entries.read", "query-project"],\n    ["POST /store", "project.memory.entry.store", "body-project"],\n    ["POST /search", "project.memory.search", "body-project"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/memory.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      memoryScopeEvidence,\n      memoryScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/memory.ts|GET /system/stats",\n    classified(\n      "memory-operator",\n      "user-session",\n      "system.memory.stats.read",\n      "global-memory-runtime",\n      memoryScopeEvidence,\n      memoryScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("memory classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
