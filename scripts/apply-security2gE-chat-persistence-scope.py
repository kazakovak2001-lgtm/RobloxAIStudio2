from pathlib import Path

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const chatPersistenceScopeEvidence =" not in matrix:
    anchor = '''const gameArchitectScopeEvidence =\n  "server/src/__tests__/security2gE.game-architect-scope.test.ts";\n'''
    addition = '''const chatPersistenceScopeEvidence =\n  "server/src/__tests__/security2gE.chat-persistence-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("chat persistence evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "project.chat.history.read" not in matrix:
    block = '''  ...[\n    ["GET /:projectId/history", "project.chat.history.read", "path-project"],\n    [\n      "GET /conversation/:id",\n      "project.chat.conversation.read",\n      "resolved-conversation-project",\n    ],\n    [\n      "POST /message",\n      "project.chat.message.create",\n      "body-or-resolved-conversation-project",\n    ],\n    [\n      "DELETE /conversation/:id",\n      "project.chat.conversation.delete",\n      "resolved-conversation-project",\n    ],\n  ].map(([operation, capability, scope]) => [\n    `rest|server/src/routes/chatPersistence.ts|${operation}`,\n    classified(\n      "project-owner",\n      "user-session",\n      capability,\n      scope,\n      chatPersistenceScopeEvidence,\n      chatPersistenceScopeEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("chat persistence classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
