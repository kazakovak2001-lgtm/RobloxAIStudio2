from pathlib import Path

route = Path("server/src/routes/platform.ts")
text = route.read_text()

anchor = '''  const preferences = new Map<string, UserPreferences>();\n'''
addition = '''  const platformOperatorUserIds = new Set(\n    (process.env.PLATFORM_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const requirePlatformOperator = async (\n    req: Request,\n    res: Response,\n  ): Promise<boolean> => {\n    if (process.env.NODE_ENV !== "production") return true;\n    const userId = await access.requireAuthenticatedUser(req, res);\n    if (!userId) return false;\n    if (!platformOperatorUserIds.has(userId)) {\n      res.status(403).json({\n        success: false,\n        error: "Platform operator access required",\n      });\n      return false;\n    }\n    return true;\n  };\n'''
if "PLATFORM_OPERATOR_USER_IDS" not in text:
    if anchor not in text:
        raise SystemExit("platform operator anchor missing")
    text = text.replace(anchor, anchor + addition, 1)

user_anchor = '''  router.post("/users", async (req, res) => {\n    const { email, displayName, tier } = req.body;\n'''
user_replacement = '''  router.post("/users", async (req, res) => {\n    if (!(await requirePlatformOperator(req, res))) return;\n    const { email, displayName, tier } = req.body;\n'''
if "requirePlatformOperator(req, res)" not in text:
    if user_anchor not in text:
        raise SystemExit("platform user creation anchor missing")
    text = text.replace(user_anchor, user_replacement, 1)
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const platformRemainingScopeEvidence =" not in matrix:
    anchor = '''const chatPersistenceScopeEvidence =\n  "server/src/__tests__/security2gE.chat-persistence-scope.test.ts";\n'''
    addition = '''const platformRemainingScopeEvidence =\n  "server/src/__tests__/security2gE.platform-remaining-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("platform evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "system.platform.users.create" not in matrix:
    block = '''  [\n    "rest|server/src/routes/platform.ts|POST /users",\n    classified(\n      "platform-operator",\n      "user-session",\n      "system.platform.users.create",\n      "global-user-directory",\n      platformRemainingScopeEvidence,\n      platformRemainingScopeEvidence,\n    ),\n  ],\n  ...[\n    ["GET /registry/agents", "system.platform.registry.agents.list"],\n    ["GET /registry/agents/:id", "system.platform.registry.agent.read"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/platform.ts|${operation}`,\n    classified(\n      "authenticated",\n      "user-session-or-api-key",\n      capability,\n      "platform-agent-registry",\n      platformRemainingScopeEvidence,\n      platformRemainingScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("platform classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
