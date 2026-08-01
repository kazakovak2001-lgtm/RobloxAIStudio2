from pathlib import Path

route = Path("server/src/routes/studio.ts")
text = route.read_text()

helper_anchor = "  const filterAuthorizedEvents = async ("
if "const resolveProtocolProjectId =" not in text:
    insertion = '''  const resolveProtocolProjectId = (message: Record<string, unknown>): string | undefined => {
    const payload =
      message.payload && typeof message.payload === "object"
        ? (message.payload as Record<string, unknown>)
        : undefined;
    if (typeof payload?.projectId === "string") return payload.projectId;
    if (typeof payload?.clientId === "string") {
      return bridge.getClient(payload.clientId)?.projectId;
    }
    return undefined;
  };

'''
    text = text.replace(helper_anchor, insertion + helper_anchor, 1)

old_message = '''  router.post("/protocol/message", async (req, res) => {
    const message = req.body;
    try {'''
new_message = '''  router.post("/protocol/message", async (req, res) => {
    const message = req.body as Record<string, unknown>;
    const projectId = resolveProtocolProjectId(message);
    if (!projectId) {
      res.status(400).json({ success: false, error: "projectId or clientId is required" });
      return;
    }
    if (!access || !(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    try {'''
text = text.replace(old_message, new_message, 1)

old_register = '''    const { pluginVersion, studioVersion, projectName, protocolVersion } =
      req.body;

    const validationError = validator.validateRegistration(req.body);'''
new_register = '''    const { pluginVersion, studioVersion, projectName, projectId, protocolVersion } =
      req.body;

    const validationError = validator.validateRegistration(req.body);'''
text = text.replace(old_register, new_register, 1)
register_guard_anchor = '''    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const client = bridge.connect(studioVersion, projectName);'''
register_guard = '''    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!access || !(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }

    const client = bridge.connect(studioVersion, projectId);'''
text = text.replace(register_guard_anchor, register_guard, 1)
text = text.replace(
    "await runtime.reconcileClient(client.clientId, projectName);",
    "await runtime.reconcileClient(client.clientId, projectId);",
    1,
)

old_log = '''  router.get("/protocol/log", (req, res) => {
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const log = dispatcher.getLog(limit);
    res.json({ success: true, data: log });
  });'''
new_log = '''  router.get("/protocol/log", async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    const session = sessionManager.getByClient(clientId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const log = dispatcher
      .getLog(limit)
      .filter((entry) => entry.sessionId === session.sessionId);
    res.json({ success: true, data: log });
  });'''
text = text.replace(old_log, new_log, 1)

text = text.replace(
    'router.post("/sync/artifacts", (req, res) => {\n    const { artifactIds } = req.body;',
    'router.post("/sync/artifacts", async (req, res) => {\n    const { artifactIds, projectId } = req.body;',
    1,
)
artifact_anchor = '''    if (
      !artifactIds ||
      !Array.isArray(artifactIds) ||
      artifactIds.length === 0
    ) {'''
artifact_guard = '''    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!access || !(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    if (
      !artifactIds ||
      !Array.isArray(artifactIds) ||
      artifactIds.length === 0
    ) {'''
start = text.index('router.post("/sync/artifacts"')
end = text.index('\n  router.', start + 1)
handler = text[start:end]
if 'access.requireProjectAccess(req, res, projectId)' not in handler:
    handler = handler.replace(artifact_anchor, artifact_guard, 1)
    text = text[:start] + handler + text[end:]
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const studioProtocolScopeEvidence =" not in matrix:
    marker = '''const studioClientScopeEvidence =
  "server/src/__tests__/security2gE.studio-client-scope.test.ts";
'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const studioProtocolScopeEvidence =
  "server/src/__tests__/security2gE.studio-protocol-scope.test.ts";
''',
        1,
    )
if "project.studio.protocol.message.dispatch" not in matrix:
    block = '''  ...[
    ["POST /protocol/message", "project.studio.protocol.message.dispatch", "resolved-message-project"],
    ["POST /protocol/register", "project.studio.protocol.register", "body-project"],
    ["GET /protocol/log", "project.studio.protocol.log.read", "resolved-client-session"],
    ["POST /sync/artifacts", "project.studio.artifacts.transfer", "body-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/studio.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          studioProtocolScopeEvidence,
          studioProtocolScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/studio.ts|GET /protocol/info",
    classified(
      "authenticated",
      "user-session",
      "system.studio.protocol.info.read",
      "static-system-metadata",
      studioProtocolScopeEvidence,
      studioProtocolScopeEvidence,
    ),
  ],
'''
    matrix = matrix.replace(
        "]);\n\nconst current = JSON.parse(",
        block + "]);\n\nconst current = JSON.parse(",
        1,
    )
generator.write_text(matrix)
