from pathlib import Path

route = Path("server/src/routes/controller.ts")
text = route.read_text()

text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)

if "function requireControllerOperator(" not in text:
    marker = 'import { ControllerSecretStatusService } from "../projects/services/controller-secret-status.service";\n\n'
    helper = '''import { ControllerSecretStatusService } from "../projects/services/controller-secret-status.service";\n\nfunction requireControllerOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n\n  const operatorIds = new Set(\n    (process.env.CONTROLLER_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res\n      .status(403)\n      .json({ success: false, error: "Controller operator access required" });\n    return;\n  }\n  next();\n}\n\n'''
    text = text.replace(marker, helper, 1)

if "router.use(requireControllerOperator);" not in text:
    marker = "  const secretStatus = new ControllerSecretStatusService();\n"
    text = text.replace(
        marker,
        marker + "\n  router.use(requireControllerOperator);\n",
        1,
    )

route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const controllerOperatorEvidence =" not in matrix:
    marker = '''const studioProtocolScopeEvidence =
  "server/src/__tests__/security2gE.studio-protocol-scope.test.ts";
'''
    matrix = matrix.replace(
        marker,
        marker
        + '''const controllerOperatorEvidence =
  "server/src/__tests__/security2gE.controller-operator-boundary.test.ts";
''',
        1,
    )

if "system.controller.health.read" not in matrix:
    block = '''  ...[
    ["GET /health", "system.controller.health.read"],
    ["POST /architecture/scan", "system.controller.architecture.scan"],
    ["POST /review", "system.controller.code.review"],
    ["POST /duplicates/check", "system.controller.duplicates.check"],
    ["GET /knowledge/query", "system.controller.knowledge.query"],
    ["GET /knowledge/stats", "system.controller.knowledge.stats.read"],
    ["GET /secrets/status", "system.controller.secrets.status.read"],
    ["GET /graph/dependents", "system.controller.graph.dependents.read"],
    ["GET /graph/dependencies", "system.controller.graph.dependencies.read"],
    ["GET /graph/impact", "system.controller.graph.impact.read"],
    ["GET /graph/suggest-location", "system.controller.graph.location.suggest"],
    ["GET /graph/stats", "system.controller.graph.stats.read"],
    ["POST /pre-check", "system.controller.precheck.execute"],
    ["GET /decisions/search", "system.controller.decisions.search"],
    ["GET /decisions/rules", "system.controller.decisions.rules.read"],
    ["GET /decisions/stats", "system.controller.decisions.stats.read"],
    ["GET /decisions/for-module", "system.controller.decisions.module.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/controller.ts|${operation}`,
        classified(
          "controller-operator",
          "user-session",
          capability,
          "global-controller-runtime",
          controllerOperatorEvidence,
          controllerOperatorEvidence,
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
