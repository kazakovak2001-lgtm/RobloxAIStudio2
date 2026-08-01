import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("server/src/routes/domain.ts", "utf8");

const expectations = [
  [
    "/genres",
    "system.domain.genres.list",
    "domain-taxonomy",
    "engine.genres.getAll",
  ],
  [
    "/genres/:genre",
    "system.domain.genre.read",
    "domain-taxonomy",
    "engine.genres.get",
  ],
  [
    "/patterns",
    "system.domain.patterns.read",
    "domain-knowledge",
    "engine.bestPractices",
  ],
  [
    "/recommendations",
    "system.domain.recommendations.read",
    "domain-knowledge",
    "engine.getRecommendations",
  ],
  [
    "/analyze",
    "system.domain.analysis.execute",
    "request-domain-input",
    "engine.analyze",
  ],
] as const;

describe("SECURITY-2G-E domain API-key enforcement", () => {
  it("guards every API-key eligible domain operation with its exact capability and scope", () => {
    expect(route).toContain(
      'import { requireApiKeyCapability } from "../common/middleware/security"',
    );

    for (const [operation, capability, scope, sideEffect] of expectations) {
      const marker =
        operation === "/analyze"
          ? `router.post("${operation}"`
          : `router.get("${operation}"`;
      const start = route.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      const handler = route.slice(start, route.indexOf("\n  });", start) + 6);
      expect(handler).toContain("requireApiKeyCapability");
      expect(handler).toContain(`"${capability}"`);
      expect(handler).toContain(`"${scope}"`);
      expect(handler.indexOf("requireApiKeyCapability")).toBeLessThan(
        handler.indexOf(sideEffect),
      );
    }
  });

  it("does not introduce wildcard API-key access", () => {
    expect(route).not.toContain('"*"');
  });
});
