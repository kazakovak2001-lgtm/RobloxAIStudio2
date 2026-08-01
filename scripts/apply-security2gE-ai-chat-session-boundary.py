from pathlib import Path

route = Path("server/src/routes/aiChat.ts")
text = route.read_text()
text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)

if "function requireAiChatUserSession(" not in text:
    anchor = 'interface DetectedIntent {\n  agent: string | null;\n  confidence: number;\n}\n\n'
    helper = '''interface DetectedIntent {\n  agent: string | null;\n  confidence: number;\n}\n\nfunction requireAiChatUserSession(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId) {\n    res.status(403).json({\n      success: false,\n      error: "AI chat user session required",\n    });\n    return;\n  }\n  next();\n}\n\n'''
    if anchor not in text:
        raise SystemExit("AI chat helper anchor missing")
    text = text.replace(anchor, helper, 1)

text = text.replace(
    'router.post("/chat", async (req, res) => {',
    'router.post("/chat", requireAiChatUserSession, async (req, res) => {',
    1,
)
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const aiChatSessionEvidence =" not in matrix:
    anchor = '''const autonomousHealthScopeEvidence =\n  "server/src/__tests__/security2gE.autonomous-health-scope.test.ts";\n'''
    addition = '''const aiChatSessionEvidence =\n  "server/src/__tests__/security2gE.ai-chat-session-boundary.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("AI chat evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "user.ai-chat.execute" not in matrix:
    block = '''  [\n    "rest|server/src/routes/aiChat.ts|POST /chat",\n    classified(\n      "authenticated",\n      "user-session",\n      "user.ai-chat.execute",\n      "current-user-session",\n      aiChatSessionEvidence,\n      aiChatSessionEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("AI chat classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
