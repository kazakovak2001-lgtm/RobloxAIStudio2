from pathlib import Path

route = Path("server/src/routes/debug.ts")
text = route.read_text()

text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)

if "function requireDebugOperator(" not in text:
    marker = 'import { ExecutionReplayEngine } from "../core/observability/ExecutionReplayEngine";\n\n'
    helper = '''import { ExecutionReplayEngine } from "../core/observability/ExecutionReplayEngine";\n\nfunction requireDebugOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n\n  const operatorIds = new Set(\n    (process.env.DEBUG_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res\n      .status(403)\n      .json({ success: false, error: "Debug operator access required" });\n    return;\n  }\n  next();\n}\n\n'''
    text = text.replace(marker, helper, 1)

if "router.use(requireDebugOperator);" not in text:
    marker = "  const replayEngine = new ExecutionReplayEngine(store);\n"
    text = text.replace(marker, marker + "\n  router.use(requireDebugOperator);\n", 1)

route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const debugOperatorEvidence =" not in matrix:
    marker = '''const analyticsOperatorEvidence =
  "server/src/__tests__/security2gE.analytics-operator-boundary.test.ts";
'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const debugOperatorEvidence =
  "server/src/__tests__/security2gE.debug-operator-boundary.test.ts";
''',
        1,
    )

if "system.debug.executions.list" not in matrix:
    block = '''  ...[
    ["GET /executions", "system.debug.executions.list"],
    ["GET /execution/:id", "system.debug.execution.read"],
    ["GET /trace/:id", "system.debug.trace.read"],
    ["GET /graph/:id", "system.debug.graph.read"],
    ["GET /replay/:id", "system.debug.replay.read"],
    ["GET /compare/:idA/:idB", "system.debug.execution.compare"],
    ["GET /timeline/:id", "system.debug.timeline.read"],
    ["DELETE /execution/:id", "system.debug.execution.delete"],
    ["GET /export/:id", "system.debug.trace.export"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/debug.ts|${operation}`,
        classified(
          "debug-operator",
          "user-session",
          capability,
          "global-debug-trace-store",
          debugOperatorEvidence,
          debugOperatorEvidence,
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
