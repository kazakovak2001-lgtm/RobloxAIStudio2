import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("server/src/routes/knowledge.ts", "utf8");

const expectations = [
  {
    operation: 'router.get("/patterns"',
    capability: "system.knowledge.patterns.read",
    scope: "knowledge-pattern-registry",
    access: "engine.patterns",
  },
  {
    operation: 'router.get("/prompts"',
    capability: "system.knowledge.prompts.read",
    scope: "knowledge-prompt-registry",
    access: "engine.prompts",
  },
  {
    operation: 'router.get("/search"',
    capability: "system.knowledge.search",
    scope: "knowledge-runtime",
    access: "engine.search",
  },
  {
    operation: 'router.get("/recommend"',
    capability: "system.knowledge.recommendations.read",
    scope: "knowledge-runtime",
    access: "engine.getRecommendations",
  },
];

describe("SECURITY-2G-E knowledge API-key enforcement", () => {
  it("requires the exact capability and resource scope before each read operation", () => {
    expect(route).toContain(
      'import { requireApiKeyCapability } from "../common/middleware/security"',
    );

    for (const expectation of expectations) {
      const start = route.indexOf(expectation.operation);
      expect(start).toBeGreaterThan(-1);
      const nextRoute = route.indexOf("router.", start + expectation.operation.length);
      const handler = route.slice(start, nextRoute === -1 ? undefined : nextRoute);
      expect(handler).toContain("requireApiKeyCapability(");
      expect(handler).toContain(`"${expectation.capability}"`);
      expect(handler).toContain(`"${expectation.scope}"`);
      expect(handler.indexOf("requireApiKeyCapability")).toBeLessThan(
        handler.indexOf(expectation.access),
      );
    }
  });

  it("keeps project-owned knowledge storage on the existing project guard", () => {
    const start = route.indexOf('router.post("/store"');
    const end = route.indexOf('router.get("/recommend"', start);
    const handler = route.slice(start, end);
    expect(handler).toContain("access.requireProjectAccess(req, res, record.projectId)");
    expect(handler).not.toContain("requireApiKeyCapability(");
    expect(handler.indexOf("requireProjectAccess")).toBeLessThan(
      handler.indexOf("engine.learn(record)"),
    );
  });
});
