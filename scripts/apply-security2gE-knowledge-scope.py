from pathlib import Path

route = Path("server/src/routes/knowledge.ts")
text = route.read_text()
text = text.replace(
    'import { KnowledgeEngine } from "../knowledge";',
    'import { KnowledgeEngine } from "../knowledge";\nimport type { ProjectAccessControl } from "./projects";',
    1,
)
text = text.replace(
    'export function createKnowledgeRouter(): Router {',
    'export function createKnowledgeRouter(access: ProjectAccessControl): Router {',
    1,
)
text = text.replace(
    '  router.post("/store", (req, res) => {',
    '  router.post("/store", async (req, res) => {',
    1,
)
store_anchor = '''    if (!record.projectId) {\n      res.status(400).json({ success: false, error: "projectId required" });\n      return;\n    }\n    engine.learn(record);\n'''
store_replacement = '''    if (!record.projectId) {\n      res.status(400).json({ success: false, error: "projectId required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, record.projectId))) return;\n    engine.learn(record);\n'''
if store_anchor not in text:
    raise SystemExit("knowledge store anchor missing")
text = text.replace(store_anchor, store_replacement, 1)
route.write_text(text)

index = Path("server/src/index.ts")
idx = index.read_text().replace(
    'app.use("/api/knowledge", createKnowledgeRouter());',
    'app.use("/api/knowledge", createKnowledgeRouter(access));',
    1,
)
index.write_text(idx)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const knowledgeScopeEvidence =" not in matrix:
    anchor = '''const repairScopeEvidence =\n  "server/src/__tests__/security2gE.repair-scope.test.ts";\n'''
    addition = '''const knowledgeScopeEvidence =\n  "server/src/__tests__/security2gE.knowledge-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("knowledge evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.knowledge.record.store" not in matrix:
    block = '''  ...[\n    ["GET /patterns", "system.knowledge.patterns.read", "knowledge-pattern-registry"],\n    ["GET /prompts", "system.knowledge.prompts.read", "knowledge-prompt-registry"],\n    ["GET /search", "system.knowledge.search", "knowledge-runtime"],\n    ["GET /recommend", "system.knowledge.recommendations.read", "knowledge-runtime"],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/knowledge.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      scope,\n      knowledgeScopeEvidence,\n      knowledgeScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/knowledge.ts|POST /store",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.knowledge.record.store",\n      "body-project",\n      knowledgeScopeEvidence,\n      knowledgeScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("knowledge classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
