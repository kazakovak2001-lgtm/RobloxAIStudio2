from pathlib import Path

route = Path("server/src/routes/analytics.ts")
text = route.read_text()

text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)

if "function requireAnalyticsOperator(" not in text:
    marker = 'import { FeedbackLoopPipeline } from "../core/analytics/FeedbackLoopPipeline";\n\n'
    helper = '''import { FeedbackLoopPipeline } from "../core/analytics/FeedbackLoopPipeline";\n\nfunction requireAnalyticsOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n\n  const operatorIds = new Set(\n    (process.env.ANALYTICS_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res\n      .status(403)\n      .json({ success: false, error: "Analytics operator access required" });\n    return;\n  }\n  next();\n}\n\n'''
    text = text.replace(marker, helper, 1)

if "router.use(requireAnalyticsOperator);" not in text:
    marker = "  const pipeline = new FeedbackLoopPipeline();\n"
    text = text.replace(marker, marker + "\n  router.use(requireAnalyticsOperator);\n", 1)

route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const analyticsOperatorEvidence =" not in matrix:
    marker = '''const controllerOperatorEvidence =
  "server/src/__tests__/security2gE.controller-operator-boundary.test.ts";
'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const analyticsOperatorEvidence =
  "server/src/__tests__/security2gE.analytics-operator-boundary.test.ts";
''',
        1,
    )

if "system.analytics.health.read" not in matrix:
    block = '''  ...[
    ["GET /system", "system.analytics.health.read"],
    ["GET /agents", "system.analytics.agents.read"],
    ["GET /agent/:name", "system.analytics.agent.read"],
    ["GET /execution/:id", "system.analytics.execution.read"],
    ["GET /patterns", "system.analytics.patterns.read"],
    ["GET /signals", "system.analytics.signals.read"],
    ["GET /suggestions", "system.analytics.suggestions.read"],
    ["POST /cycle", "system.analytics.cycle.execute"],
    ["GET /slowest", "system.analytics.rankings.slowest.read"],
    ["GET /lowest-scores", "system.analytics.rankings.lowest.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/analytics.ts|${operation}`,
        classified(
          "analytics-operator",
          "user-session",
          capability,
          "global-analytics-runtime",
          analyticsOperatorEvidence,
          analyticsOperatorEvidence,
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
