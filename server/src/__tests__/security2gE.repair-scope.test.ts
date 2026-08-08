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

  it("only trusts a client-supplied rollback executionId against the project's own history", () => {
    expect(route).toContain(
      'error: "executionId is not a known execution for this project"',
    );
    expect(route).toContain("knownExecutionIds.has(requestedExecutionId)");
    const knownIdsDeclaration = route.indexOf("knownExecutionIds");
    const rollbackCheck = route.indexOf(
      "knownExecutionIds.has(requestedExecutionId)",
    );
    expect(knownIdsDeclaration).toBeGreaterThan(-1);
    expect(rollbackCheck).toBeGreaterThan(knownIdsDeclaration);
  });

  it("records both successful and failed delivery attempts", () => {
    expect(route).toContain("engine.recordDelivery(projectId,");
    expect(route).toContain("success: syncResult.success");
    expect(
      (route.match(/engine\.recordDelivery\(projectId,/g) ?? []).length,
    ).toBe(2);
  });

  it("guards the delivery audit read route the same way as the other reads", () => {
    const deliveriesSection = route.indexOf('get("/:projectId/deliveries"');
    expect(deliveriesSection).toBeGreaterThan(-1);
    expect(route).toContain("studioManager.getProjectEvidence(projectId)");
  });

  it("classifies all repair operations as project-owner", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/repair.ts",
    );
    expect(operations).toHaveLength(5);
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
        expect.objectContaining({
          operation: "GET /:projectId/deliveries",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.repair.deliveries.read",
          resourceScope: "path-project",
        }),
      ]),
    );
  });
});
