import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "server/src/routes/luaGeneration.ts"),
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

describe("SECURITY-2G-E lua generation scope", () => {
  it("guards every project-bound Lua operation before generation", () => {
    expect(route).toContain("access: ProjectAccessControl");
    expect(route.match(/requireProjectAccess\(req, res, projectId\)/g)).toHaveLength(4);

    const handlers = [
      ["/generate", "engine.generate({"],
      ["/generate-full", "engine.generateFullPackage("],
      ["/assemble-experience", "engine.generateFullPackage("],
      ["/generate-assets", "assetEngine.generate({"],
    ] as const;

    for (const [operation, execution] of handlers) {
      const start = route.indexOf(`router.post("${operation}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = route.indexOf("router.post(", start + 1);
      const end = next === -1 ? route.length : next;
      const handler = route.slice(start, end);
      expect(handler.indexOf("requireProjectAccess(req, res, projectId)")).toBeGreaterThanOrEqual(0);
      expect(handler.indexOf("requireProjectAccess(req, res, projectId)")).toBeLessThan(
        handler.indexOf(execution),
      );
    }

    expect(index).toContain('createLuaGenerationRouter(access)');
  });

  it("classifies all four Lua generation operations", () => {
    const operations = matrix.operations.filter(
      (item) => item.source === "server/src/routes/luaGeneration.ts",
    );
    expect(operations).toHaveLength(4);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "POST /generate",
          classification: "project-owner",
          principal: "user-session",
          capability: "project.lua.generate",
          resourceScope: "body-project",
        }),
        expect.objectContaining({
          operation: "POST /generate-full",
          capability: "project.lua.generate-full",
        }),
        expect.objectContaining({
          operation: "POST /assemble-experience",
          capability: "project.lua.experience.assemble",
        }),
        expect.objectContaining({
          operation: "POST /generate-assets",
          capability: "project.lua.assets.generate",
        }),
      ]),
    );
  });
});
