import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/gameArchitect.ts"),
  "utf8",
);
const matrix = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/security/authorization-matrix.json"),
    "utf8",
  ),
) as {
  operations: Array<{
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
  }>;
};

describe("SECURITY-2G-E game architect scope", () => {
  it("keeps game architect operations request scoped", () => {
    expect(route).toContain("architect.analyze(input)");
    expect(route).toContain("architect.generateDesign(input, analysis)");
    expect(route).toContain("architect.planArchitecture(analysis)");
    expect(route).toContain("architect.process(input)");
    expect(route).not.toContain("projectId");
    expect(route).not.toContain("ProjectAccessControl");
  });

  it("classifies all three game architect operations", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/gameArchitect.ts",
    );
    expect(operations).toHaveLength(3);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /analyze",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.game-architect.analysis.execute",
          resourceScope: "request-game-idea",
        }),
        expect.objectContaining({
          operation: "POST /generate-design",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.game-architect.design.generate",
          resourceScope: "request-game-idea",
        }),
        expect.objectContaining({
          operation: "POST /generate-prompts",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.game-architect.prompts.generate",
          resourceScope: "request-game-idea",
        }),
      ]),
    );
  });
});
