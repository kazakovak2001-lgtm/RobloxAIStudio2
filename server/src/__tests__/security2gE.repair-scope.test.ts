import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/repair.ts"),
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

describe("SECURITY-2G-E repair scope", () => {
  it("guards repair execution and conceals foreign stored data", () => {
    expect(route).toContain("access: ProjectAccessControl");
    expect(route).toContain(
      "await access.requireProjectAccess(req, res, projectId)",
    );
    expect(
      route.indexOf("requireProjectAccess(req, res, projectId)"),
    ).toBeLessThan(route.indexOf("engine.run(projectId, executionId, config)"));
    expect(route).toContain("await access.hasProjectAccess(req, projectId)");
    expect(route).toContain('error: "No repair session found"');
    expect(route).toContain('error: "No repair history found"');
    expect(index).toContain(
      "createRepairRouter(access, agentRegistry, blueprintRepo, studioManager)",
    );
  });

  it("guards repair delivery before touching the Studio sync pipeline", () => {
    const deliverSection = route.indexOf('post("/:projectId/deliver"');
    expect(deliverSection).toBeGreaterThan(-1);
    const deliverAccessCheck = route.indexOf(
      "requireProjectAccess(req, res, projectId)",
      deliverSection,
    );
    const deliverSync = route.indexOf("synchronizeExecution(", deliverSection);
    expect(deliverAccessCheck).toBeGreaterThan(deliverSection);
    expect(deliverAccessCheck).toBeLessThan(deliverSync);
    expect(route).toContain(
      'error: "No repaired execution available for this project"',
    );
    expect(route).toContain(
      'error: "No connected Studio session available for this project."',
    );
  });

  it("classifies all repair operations as project-owner", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/repair.ts",
    );
    expect(operations).toHaveLength(4);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /run",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.repair.run",
          resourceScope: "body-project",
        }),
        expect.objectContaining({
          operation: "GET /:projectId",
          classification: "project-owner",
          capability: "project.repair.session.read",
          resourceScope: "path-project",
        }),
        expect.objectContaining({
          operation: "GET /history/:projectId",
          classification: "project-owner",
          capability: "project.repair.history.read",
          resourceScope: "path-project",
        }),
        expect.objectContaining({
          operation: "POST /:projectId/deliver",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.repair.deliver",
          resourceScope: "path-project",
        }),
      ]),
    );
  });
});
