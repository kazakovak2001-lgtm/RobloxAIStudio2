import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/playtest.ts"),
  "utf8",
);
const index = fs.readFileSync(path.join(root, "server/src/index.ts"), "utf8");
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

describe("SECURITY-2G-E playtest scope", () => {
  it("guards playtest execution and concealed report retrieval", () => {
    expect(route).toContain("access: ProjectAccessControl");
    expect(route).toContain(
      "await access.requireProjectAccess(req, res, input.projectId)",
    );
    expect(
      route.indexOf("requireProjectAccess(req, res, input.projectId)"),
    ).toBeLessThan(route.indexOf("engine.run(input)"));
    expect(route).toContain("await access.hasProjectAccess(req, projectId)");
    expect(route).toContain('error: "No playtest report found"');
    expect(index).toContain('createPlaytestRouter(access)');
  });

  it("classifies both playtest operations as project-owner", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/playtest.ts",
    );
    expect(operations).toHaveLength(2);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /run",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.playtest.run",
          resourceScope: "body-project",
        }),
        expect.objectContaining({
          operation: "GET /:projectId",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.playtest.report.read",
          resourceScope: "path-project",
        }),
      ]),
    );
  });
});
