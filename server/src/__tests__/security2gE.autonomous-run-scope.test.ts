import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("server/src/routes/autonomous.ts", "utf8");
const matrix = JSON.parse(
  readFileSync("config/security/authorization-matrix.json", "utf8"),
) as {
  operations: Array<Record<string, string>>;
};

describe("SECURITY-2G-E autonomous run scope", () => {
  it("requires a project identifier when access control is enabled", () => {
    expect(route).toContain("if (access && projectId === undefined)");
    expect(route).toContain('error: "projectId is required"');
  });

  it("checks project ownership before autonomous orchestration", () => {
    const handler = route.slice(
      route.indexOf('router.post("/run"'),
      route.indexOf("// GET /api/autonomous/status/:sessionId"),
    );
    expect(handler.indexOf("access.requireProjectAccess")).toBeGreaterThan(-1);
    expect(handler.indexOf("orchestrator.run")).toBeGreaterThan(-1);
    expect(handler.indexOf("access.requireProjectAccess")).toBeLessThan(
      handler.indexOf("orchestrator.run"),
    );
  });

  it("records the project-owner authorization contract", () => {
    const operation = matrix.operations.find(
      (item) =>
        item.source === "server/src/routes/autonomous.ts" &&
        item.operation === "POST /run",
    );
    expect(operation).toMatchObject({
      classification: "project-owner",
      principal: "user-session",
      capability: "project.autonomous.run",
      resourceScope: "body-project",
      positiveEvidence:
        "server/src/__tests__/security2gE.autonomous-run-scope.test.ts",
      negativeEvidence:
        "server/src/__tests__/security2gE.autonomous-run-scope.test.ts",
    });
  });
});
