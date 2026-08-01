from pathlib import Path

streaming = Path("server/src/socket/streaming.ts")
text = streaming.read_text()
text = text.replace(
    '  private clients = new Map<string, Response>();',
    '  private clients = new Map<string, { response: Response; projectId: string }>();',
    1,
)
text = text.replace(
    '  registerClient(clientId: string, res: Response): void {',
    '  registerClient(clientId: string, projectId: string, res: Response): void {',
    1,
)
text = text.replace(
    '    this.clients.set(clientId, res);',
    '    this.clients.set(clientId, { response: res, projectId });',
    1,
)
text = text.replace(
    '    const client = this.clients.get(clientId);\n\n    if (client && !client.writableEnded) {',
    '    const client = this.clients.get(clientId)?.response;\n\n    if (client && !client.writableEnded) {',
    1,
)
text = text.replace(
    '  broadcastEvent(event: PipelineEvent, _filterPipelineId?: string): void {\n    for (const clientId of this.clients.keys()) {\n      this.sendEvent(clientId, event);\n    }\n  }',
    '  broadcastEvent(event: PipelineEvent, filterProjectId?: string): void {\n    const projectId = filterProjectId ?? event.projectId;\n    if (!projectId) return;\n    for (const [clientId, client] of this.clients.entries()) {\n      if (client.projectId === projectId) this.sendEvent(clientId, event);\n    }\n  }',
    1,
)
text = text.replace(
    '    const client = this.clients.get(clientId);\n    if (client && !client.writableEnded) {',
    '    const client = this.clients.get(clientId)?.response;\n    if (client && !client.writableEnded) {',
    2,
)
text = text.replace(
    '    for (const client of this.clients.values()) {\n      if (!client.writableEnded) {\n        client.end();\n      }\n    }',
    '    for (const client of this.clients.values()) {\n      if (!client.response.writableEnded) {\n        client.response.end();\n      }\n    }',
    1,
)
streaming.write_text(text)

route = Path("server/src/routes/game-generation.ts")
text = route.read_text()
anchor = '''  const generationStartCoordinator = new ProjectGenerationStartCoordinator(\n    projectRepository,\n  );\n'''
addition = '''  const generationOperatorUserIds = new Set(\n    (process.env.GENERATION_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const requireGenerationOperator = async (req: Parameters<typeof access.requireAuthenticatedUser>[0], res: Parameters<typeof access.requireAuthenticatedUser>[1]): Promise<boolean> => {\n    if (process.env.NODE_ENV !== "production") return true;\n    const userId = await access.requireAuthenticatedUser(req, res);\n    if (!userId) return false;\n    if (!generationOperatorUserIds.has(userId)) {\n      res.status(403).json({ success: false, error: "Generation operator access required" });\n      return false;\n    }\n    return true;\n  };\n'''
if "GENERATION_OPERATOR_USER_IDS" not in text:
    if anchor not in text:
        raise SystemExit("generation operator anchor missing")
    text = text.replace(anchor, anchor + addition, 1)
text = text.replace(
    '  router.get("/system/cache-stats", async (_req, res) => {\n    try {',
    '  router.get("/system/cache-stats", async (req, res) => {\n    if (!(await requireGenerationOperator(req, res))) return;\n    try {',
    1,
)
stream_anchor = '''  router.get("/generation/stream", (req, res) => {\n    const clientId =\n      typeof req.query.clientId === "string"\n        ? req.query.clientId\n        : `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;\n    gameService.getStreamingHandler().registerClient(clientId, res);\n  });\n'''
stream_replacement = '''  router.get("/generation/stream", async (req, res) => {\n    const projectId =\n      typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";\n    if (!projectId) {\n      res.status(400).json({ success: false, error: "projectId is required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n    const clientId =\n      typeof req.query.clientId === "string"\n        ? req.query.clientId\n        : `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;\n    gameService.getStreamingHandler().registerClient(clientId, projectId, res);\n  });\n'''
if stream_anchor not in text:
    raise SystemExit("generation stream anchor missing")
text = text.replace(stream_anchor, stream_replacement, 1)
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const gameGenerationFinalScopeEvidence =" not in matrix:
    anchor = '''const autonomousRunScopeEvidence =\n  "server/src/__tests__/security2gE.autonomous-run-scope.test.ts";\n'''
    addition = '''const gameGenerationFinalScopeEvidence =\n  "server/src/__tests__/security2gE.game-generation-final-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("game generation evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)
if '"project.generation.stream.read"' not in matrix:
    block = '''  [\n    "rest|server/src/routes/game-generation.ts|GET /generation/stream",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.generation.stream.read",\n      "query-project",\n      gameGenerationFinalScopeEvidence,\n      gameGenerationFinalScopeEvidence,\n    ),\n  ],\n  [\n    "rest|server/src/routes/game-generation.ts|GET /system/cache-stats",\n    classified(\n      "generation-operator",\n      "user-session",\n      "system.generation.cache-stats.read",\n      "global-generation-cache",\n      gameGenerationFinalScopeEvidence,\n      gameGenerationFinalScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("game generation classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)
generator.write_text(matrix)
