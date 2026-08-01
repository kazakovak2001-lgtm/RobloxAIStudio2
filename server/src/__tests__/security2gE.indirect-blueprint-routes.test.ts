import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(
  __dirname,
  "../routes/game-generation.ts",
);
const source = fs.readFileSync(sourcePath, "utf8");

function routeBody(method: string, route: string): string {
  const marker = `router.${method}("${route}"`;
  const start = source.indexOf(marker);
  expect(start, `${method.toUpperCase()} ${route} must exist`).toBeGreaterThanOrEqual(0);

  const nextRoute = source.indexOf("\n  router.", start + marker.length);
  return source.slice(start, nextRoute === -1 ? source.length : nextRoute);
}

describe("SECURITY-2G-E indirect blueprint authorization", () => {
  const routes = [
    ["get", "/blueprints/:blueprintId"],
    ["get", "/blueprints/:blueprintId/validate"],
    ["get", "/blueprints/:blueprintId/executions"],
  ] as const;

  for (const [method, route] of routes) {
    it(`${method.toUpperCase()} ${route} resolves the blueprint project before access`, () => {
      const body = routeBody(method, route);
      const loadIndex = body.indexOf(
        "gameService.getBlueprint(req.params.blueprintId)",
      );
      const guardIndex = body.indexOf(
        "access.requireProjectAccess(req, res, blueprint.project_id)",
      );
      const successIndex = body.indexOf("res.json({ success: true");

      expect(loadIndex).toBeGreaterThanOrEqual(0);
      expect(guardIndex).toBeGreaterThan(loadIndex);
      expect(successIndex).toBeGreaterThan(guardIndex);
      expect(body).toContain("if (!blueprint)");
      expect(body).toContain("Blueprint not found");
    });
  }
});
