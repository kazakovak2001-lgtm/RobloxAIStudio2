import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/evaluation.ts"),
  "utf8",
);

describe("SECURITY-2G-E evaluation operator boundary", () => {
  it("requires a production user principal from the evaluation operator allowlist", () => {
    expect(source).toContain("function requireEvaluationOperator(");
    expect(source).toContain("EVALUATION_OPERATOR_USER_IDS");
    expect(source).toContain("req as Request & { user?: { userId?: string } }");
    expect(source).toContain("Evaluation operator access required");
    expect(source).not.toContain('req.headers["x-api-key"]');
  });

  it("guards all evaluation reads and regression execution", () => {
    expect(source).toContain(
      'router.get("/score/:agent", requireEvaluationOperator,',
    );
    expect(source).toContain(
      'router.get("/history", requireEvaluationOperator,',
    );
    expect(source).toContain(
      'router.get("/alerts", requireEvaluationOperator,',
    );
    expect(source).toContain(
      'router.post("/run", requireEvaluationOperator,',
    );
  });
});
