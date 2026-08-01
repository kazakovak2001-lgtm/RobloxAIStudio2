from pathlib import Path

path = Path("server/src/routes/studio.ts")
text = path.read_text()

helper_anchor = "  runtime.startTimeoutMonitor();\n"
helpers = '''  runtime.startTimeoutMonitor();

  const hasStudioProjectAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    projectId?: string,
  ): Promise<boolean> =>
    Boolean(
      projectId &&
        access?.hasProjectAccess &&
        (await access.hasProjectAccess(req, projectId)),
    );

  const requireStudioClientAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    res: Response,
    clientId: string,
  ) => {
    const client = bridge.getClient(clientId);
    if (
      !client?.projectId ||
      !(await hasStudioProjectAccess(req, client.projectId))
    ) {
      res.status(404).json({ success: false, error: "Client not found" });
      return null;
    }
    return client;
  };

  const filterAuthorizedClients = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    clients: ReturnType<typeof bridge.getConnectedClients>,
  ) => {
    const checks = await Promise.all(
      clients.map(async (client) => ({
        client,
        allowed: await hasStudioProjectAccess(req, client.projectId),
      })),
    );
    return checks.filter(({ allowed }) => allowed).map(({ client }) => client);
  };

  const filterAuthorizedEvents = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    events: ReturnType<typeof bridge.events.getHistory>,
  ) => {
    const checks = await Promise.all(
      events.map(async (event) => {
        const record = event as typeof event & {
          projectId?: string;
          clientId?: string;
        };
        const projectId =
          record.projectId ??
          (record.clientId
            ? bridge.getClient(record.clientId)?.projectId
            : undefined);
        return { event, allowed: await hasStudioProjectAccess(req, projectId) };
      }),
    );
    return checks.filter(({ allowed }) => allowed).map(({ event }) => event);
  };
'''
if "const requireStudioClientAccess =" not in text:
    text = text.replace(helper_anchor, helpers, 1)

text = text.replace(
    'router.get("/status", (_req, res) => {\n    const clients = bridge.getConnectedClients();',
    'router.get("/status", async (req, res) => {\n    const clients = await filterAuthorizedClients(req, bridge.getConnectedClients());',
    1,
)

for route in ["disconnect", "heartbeat"]:
    registration = f'router.post("/{route}", (req, res) => {{'
    text = text.replace(
        registration,
        registration.replace("(req, res)", "async (req, res)"),
        1,
    )
    marker = '''    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }'''
    start = text.index(f'router.post("/{route}"')
    pos = text.index(marker, start)
    body = text[pos : pos + 600]
    if "requireStudioClientAccess(req, res, clientId)" not in body:
        text = text[:pos] + text[pos:].replace(
            marker,
            marker
            + "\n    if (!(await requireStudioClientAccess(req, res, clientId))) return;",
            1,
        )

text = text.replace(
    'router.get("/session", (req, res) => {',
    'router.get("/session", async (req, res) => {',
    1,
)
text = text.replace(
    '''    if (clientId) {
      const session = sessionManager.getByClient(clientId);''',
    '''    if (clientId) {
      if (!(await requireStudioClientAccess(req, res, clientId))) return;
      const session = sessionManager.getByClient(clientId);''',
    1,
)
text = text.replace(
    '    res.json({ success: true, data: sessionManager.getActiveSessions() });',
    '''    const authorizedClients = await filterAuthorizedClients(
      req,
      bridge.getConnectedClients(),
    );
    const authorizedClientIds = new Set(
      authorizedClients.map((client) => client.clientId),
    );
    res.json({
      success: true,
      data: sessionManager
        .getActiveSessions()
        .filter((session) => authorizedClientIds.has(session.clientId)),
    });''',
    1,
)

text = text.replace(
    '''    const client = bridge.getClient(clientId);
    if (!client || client.status !== "connected") {''',
    '''    const client = await requireStudioClientAccess(req, res, clientId);
    if (!client || client.status !== "connected") {''',
    1,
)
text = text.replace(
    '''    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    let command;''',
    '''    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    let command;''',
    1,
)
text = text.replace(
    '''    if (typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    try {''',
    '''    if (typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    try {''',
    1,
)
text = text.replace(
    '''    if (typeof body.clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    const parsed = parseImportReport(body);''',
    '''    if (typeof body.clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    const clientId = body.clientId;
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    const parsed = parseImportReport(body);''',
    1,
)
text = text.replace(
    'router.get("/events", (_req, res) => {\n    const history = bridge.events.getHistory();',
    'router.get("/events", async (req, res) => {\n    const history = await filterAuthorizedEvents(req, bridge.events.getHistory());',
    1,
)
path.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const studioClientScopeEvidence =" not in matrix:
    marker = '''const studioParityEvidence =
  "server/src/__tests__/security2gE.studio-project-parity.test.ts";
'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const studioClientScopeEvidence =
  "server/src/__tests__/security2gE.studio-client-scope.test.ts";
''',
        1,
    )
if "project.studio.clients.read" not in matrix:
    block = '''  ...[
    ["GET /status", "project.studio.clients.read", "authorized-project-set"],
    ["POST /disconnect", "project.studio.client.disconnect", "resolved-client-project"],
    ["POST /heartbeat", "project.studio.client.heartbeat", "resolved-client-project"],
    ["GET /session", "project.studio.sessions.read", "authorized-project-set-or-client"],
    ["GET /commands", "project.studio.commands.poll", "resolved-client-project"],
    ["GET /commands/:commandId", "project.studio.command.read", "resolved-client-project"],
    ["POST /commands/:commandId/acknowledge", "project.studio.command.acknowledge", "resolved-client-project"],
    ["POST /commands/:commandId/result", "project.studio.command.report", "resolved-client-project"],
    ["GET /events", "project.studio.events.read", "authorized-project-set"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/studio.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          studioClientScopeEvidence,
          studioClientScopeEvidence,
        ),
      ] as const,
  ),
'''
    matrix = matrix.replace(
        "]);\n\nconst current = JSON.parse(",
        block + "]);\n\nconst current = JSON.parse(",
        1,
    )
generator.write_text(matrix)
