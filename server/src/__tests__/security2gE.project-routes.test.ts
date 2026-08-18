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

  // SEC-GENERATION-BLUEPRINT-001. A static check, like its siblings above: it
  // pins the ordering of the guard inside the handler source. The behavioural
  // guarantee lives in secgenerationblueprint1.project-binding.test.ts, which
  // exercises the service the route delegates to.
  it("binds an explicit generation blueprint to the authorized project before scheduling", () => {
    const handler = routeHandler("post", "/:projectId/generate");

    const mismatchGuard = handler.indexOf("requested.project_id !== projectId");
    const scheduling = handler.indexOf("startGeneration");

    expect(mismatchGuard).toBeGreaterThanOrEqual(0);
    expect(scheduling).toBeGreaterThan(mismatchGuard);
    expect(handler).toContain("res.status(404)");
  });

  it("passes the authorized project to the service as the expected owner", () => {
    const handler = routeHandler("post", "/:projectId/generate");
    // The service refuses to record an execution for any other project, so the
    // invariant is not protected by the route alone.
    expect(handler).toMatch(
      /startGeneration\(\s*blueprintId \|\| projectId,\s*userId,\s*projectId,?\s*\)/,
    );
  });
});
