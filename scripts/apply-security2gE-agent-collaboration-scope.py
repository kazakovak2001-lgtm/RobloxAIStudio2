from pathlib import Path

route = Path("server/src/routes/agentCollaboration.ts")
text = route.read_text()
text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)
text = text.replace(
    'import { AgentCoordinator } from "../agents/collaboration";',
    'import { AgentCoordinator } from "../agents/collaboration";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)

if "function requireCollaborationOperator(" not in text:
    marker = 'import type { ProjectAccessControl } from "./projects";\n\n'
    helper = '''import type { ProjectAccessControl } from "./projects";\n\nfunction requireCollaborationOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n  const operatorIds = new Set(\n    (process.env.COLLABORATION_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res.status(403).json({\n      success: false,\n      error: "Collaboration operator access required",\n    });\n    return;\n  }\n  next();\n}\n\n'''
    text = text.replace(marker, helper, 1)

text = text.replace(
    'export function createAgentCollaborationRouter(): Router {',
    'export function createAgentCollaborationRouter(\n  access: ProjectAccessControl,\n): Router {',
    1,
)
for route_path in ["/status", "/messages", "/metrics", "/consensus"]:
    text = text.replace(
        f'router.get("{route_path}", (',
        f'router.get("{route_path}", requireCollaborationOperator, (',
        1,
    )
text = text.replace(
    'router.post("/run", (req, res) => {',
    'router.post("/run", async (req, res) => {',
    1,
)
anchor = '''    if (!projectId || !systems) {\n      res\n        .status(400)\n        .json({ success: false, error: "projectId and systems required" });\n      return;\n    }\n\n    const context = {'''
replacement = '''    if (!projectId || !systems) {\n      res\n        .status(400)\n        .json({ success: false, error: "projectId and systems required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n    const context = {'''
text = text.replace(anchor, replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/agents", createAgentCollaborationRouter());',
    'app.use("/api/agents", createAgentCollaborationRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const agentCollaborationScopeEvidence =" not in matrix:
    marker = '''const apiV2ScopeEvidence =\n  "server/src/__tests__/security2gE.api-v2-scope.test.ts";\n'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const agentCollaborationScopeEvidence =\n  "server/src/__tests__/security2gE.agent-collaboration-scope.test.ts";\n''',
        1,
    )
if "project.agent-collaboration.run" not in matrix:
    block = '''  [\n    "rest|server/src/routes/agentCollaboration.ts|POST /run",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.agent-collaboration.run",\n      "body-project",\n      agentCollaborationScopeEvidence,\n      agentCollaborationScopeEvidence,\n    ),\n  ],\n  ...[\n    ["GET /status", "system.agent-collaboration.status.read"],\n    ["GET /messages", "system.agent-collaboration.messages.read"],\n    ["GET /metrics", "system.agent-collaboration.metrics.read"],\n    ["GET /consensus", "system.agent-collaboration.consensus.read"],\n  ].map(\n    ([operation, capability]) =>\n      [\n        `rest|server/src/routes/agentCollaboration.ts|${operation}`,\n        classified(\n          "collaboration-operator",\n          "user-session",\n          capability,\n          "global-agent-collaboration-runtime",\n          agentCollaborationScopeEvidence,\n          agentCollaborationScopeEvidence,\n        ),\n      ] as const,\n  ),\n'''
    matrix = matrix.replace(
        "]);\n\nconst current = JSON.parse(
        block + "]);\n\nconst current = JSON.parse(
        1,
    )
generator.write_text(matrix)
