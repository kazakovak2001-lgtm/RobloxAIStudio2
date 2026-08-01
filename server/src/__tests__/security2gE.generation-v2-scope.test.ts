import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/generation-v2.ts"),
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

describe("SECURITY-2G-E generation v2 scope", () => {
  it("guards project-bound generation before expensive execution", () => {
    expect(route).toContain("access: ProjectAccessControl");
    expect(route).toContain('error: "projectId is required"');
    expect(route).toContain(
      "await access.requireProjectAccess(req, res, projectId)",
    );
    expect(route.indexOf("requireProjectAccess(req, res, projectId)")).toBeLessThan(
      route.indexOf("planner.createPlan"),
    );

    const luaHandler = route.slice(
      route.indexOf('router.post("/lua"'),
      route.indexOf('router.post("/export"'),
    );
    expect(luaHandler).toContain(
      "await access.requireProjectAccess(req, res, blueprint.id)",
    );
    expect(luaHandler.indexOf("requireProjectAccess(req, res, blueprint.id)")).toBeLessThan(
      luaHandler.indexOf("luaGen.generate(blueprint)"),
    );

    const exportHandler = route.slice(route.indexOf('router.post("/export"'));
    expect(exportHandler).toContain(
      "await access.requireProjectAccess(req, res, blueprint.id)",
    );
    expect(
      exportHandler.indexOf("requireProjectAccess(req, res, blueprint.id)"),
    ).toBeLessThan(exportHandler.indexOf("exporter.build(blueprint, lua, assets)"));
    expect(index).toContain(
      'createGenerationV2Router(agentRegistry, access)',
    );
  });

  it("classifies all four generation v2 operations", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/generation-v2.ts",
    );
    expect(operations).toHaveLength(4);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /game",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.generation.v2.game.execute",
          resourceScope: "body-project",
        }),
        expect.objectContaining({
          operation: "POST /lua",
          classification: "project-owner",
          capability: "project.generation.v2.lua.generate",
          resourceScope: "body-blueprint-project",
        }),
        expect.objectContaining({
          operation: "POST /export",
          classification: "project-owner",
          capability: "project.generation.v2.export.generate",
          resourceScope: "body-blueprint-project",
        }),
        expect.objectContaining({
          operation: "POST /blueprint",
          classification: "authenticated",
          principal: "user-session-or-api-key",
          capability: "system.generation.v2.blueprint.generate",
          resourceScope: "request-generation-outputs",
        }),
      ]),
    );
  });
});
