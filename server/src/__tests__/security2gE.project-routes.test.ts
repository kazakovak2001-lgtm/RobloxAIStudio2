import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(__dirname, "../routes/game-generation.ts");
const source = fs.readFileSync(sourcePath, "utf8");

const guardedRoutes = [
  ["post", "/:projectId/generate"],
  ["post", "/:projectId/blueprints"],
  ["get", "/:projectId/generation/:executionId/status"],
  ["get", "/:projectId/studio/status"],
  ["post", "/:projectId/studio/sync"],
  ["get", "/:projectId/export"],
] as const;

function routeHandler(method: string, route: string): string {
  const marker = `router.${method}("${route}"`;
  const start = source.indexOf(marker);
  expect(
    start,
    `${method.toUpperCase()} ${route} registration`,
  ).toBeGreaterThanOrEqual(0);

  const nextRegistration = source.indexOf("\n  router.", start + marker.length);
  return source.slice(
    start,
    nextRegistration === -1 ? source.length : nextRegistration,
  );
}

describe("SECURITY-2G-E direct project route guards", () => {
  for (const [method, route] of guardedRoutes) {
    it(`${method.toUpperCase()} ${route} resolves path project authorization before work`, () => {
      const handler = routeHandler(method, route);
      const guardIndex = handler.indexOf("access.requireProjectAccess");
      const responseIndex = handler.indexOf("res.json");

      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(responseIndex).toBeGreaterThan(guardIndex);
      expect(handler).toContain("req.params");
    });
  }

  it("binds execution status to the same authorized project", () => {
    const handler = routeHandler(
      "get",
      "/:projectId/generation/:executionId/status",
    );
    expect(handler).toContain("execution.project_id !== req.params.projectId");
    expect(handler).toContain("res.status(404)");
  });
});
