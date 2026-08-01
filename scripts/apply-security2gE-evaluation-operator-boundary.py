from pathlib import Path

route = Path("server/src/routes/evaluation.ts")
text = route.read_text()
text = text.replace(
    'import { Router } from "express";',
    'import { Router, type NextFunction, type Request, type Response } from "express";',
    1,
)
if "function requireEvaluationOperator(" not in text:
    anchor = 'import { AgentRegistry } from "../agents/core/AgentRegistry";\n\n'
    helper = '''import { AgentRegistry } from "../agents/core/AgentRegistry";\n\nfunction requireEvaluationOperator(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {\n  if (process.env.NODE_ENV !== "production") {\n    next();\n    return;\n  }\n  const operatorIds = new Set(\n    (process.env.EVALUATION_OPERATOR_USER_IDS ?? "")\n      .split(",")\n      .map((value) => value.trim())\n      .filter(Boolean),\n  );\n  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;\n  if (!userId || !operatorIds.has(userId)) {\n    res.status(403).json({\n      success: false,\n      error: "Evaluation operator access required",\n    });\n    return;\n  }\n  next();\n}\n\n'''
    if anchor not in text:
        raise SystemExit("evaluation helper anchor missing")
    text = text.replace(anchor, helper, 1)

for method, route_path in [
    ("get", "/score/:agent"),
    ("get", "/history"),
    ("post", "/run"),
    ("get", "/alerts"),
]:
    text = text.replace(
        f'router.{method}("{route_path}", ',
        f'router.{method}("{route_path}", requireEvaluationOperator, ',
        1,
    )
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const evaluationOperatorEvidence =" not in matrix:
    anchor = '''const economyScopeEvidence =\n  "server/src/__tests__/security2gE.economy-scope.test.ts";\n'''
    addition = '''const evaluationOperatorEvidence =\n  "server/src/__tests__/security2gE.evaluation-operator-boundary.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("evaluation evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "system.evaluation.score.read" not in matrix:
    block = '''  ...[\n    ["GET /score/:agent", "system.evaluation.score.read"],\n    ["GET /history", "system.evaluation.history.read"],\n    ["GET /alerts", "system.evaluation.alerts.read"],\n    ["POST /run", "system.evaluation.suite.execute"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/evaluation.ts|${operation}`,\n    classified(\n      "evaluation-operator",\n      "user-session",\n      capability,\n      "global-evaluation-runtime",\n      evaluationOperatorEvidence,\n      evaluationOperatorEvidence,\n    ),\n  ] as const),\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("evaluation classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
