import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("server/src/routes/gameArchitect.ts", "utf8");

function handler(operation: string): string {
  const start = route.indexOf(`router.post("${operation}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = route.indexOf("router.post(", start + 12);
  return route.slice(start, next === -1 ? undefined : next);
}

describe("SECURITY-2G-E API key game architect enforcement", () => {
  it.each([
    ["/analyze", "system.game-architect.analysis.execute", "architect.analyze"],
    [
      "/generate-design",
      "system.game-architect.design.generate",
      "architect.analyze",
    ],
    [
      "/generate-prompts",
      "system.game-architect.prompts.generate",
      "architect.process",
    ],
  ])(
    "guards %s before architect execution",
    (operation, capability, execution) => {
      const source = handler(operation);
      expect(source).toContain("requireApiKeyCapability(");
      expect(source).toContain(`"${capability}"`);
      expect(source).toContain('"request-game-idea"');
      expect(source.indexOf("requireApiKeyCapability")).toBeLessThan(
        source.indexOf("const input"),
      );
      expect(source.indexOf("requireApiKeyCapability")).toBeLessThan(
        source.indexOf(execution),
      );
    },
  );

  it("preserves exact distinct capabilities without wildcard access", () => {
    expect(route).not.toContain('"*"');
    expect(route.match(/requireApiKeyCapability\(/g)).toHaveLength(3);
  });
});
