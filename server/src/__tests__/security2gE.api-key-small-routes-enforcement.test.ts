import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("SECURITY-2G-E API-key enforcement for small routes", () => {
  it("guards economy balance and report metadata before route work", () => {
    const source = read("server/src/routes/economy.ts");
    expect(source).toContain('"system.economy.balance.execute"');
    expect(source).toContain('"request-economy-report"');
    expect(source).toContain('"system.economy.report.metadata.read"');
    expect(source).toContain('"placeholder-metadata"');
    expect(source.indexOf('"system.economy.balance.execute"')).toBeLessThan(
      source.indexOf("const patch = balancer.generate(report)"),
    );
    expect(
      source.indexOf('"system.economy.report.metadata.read"'),
    ).toBeLessThan(source.indexOf('"Economy reports stored in Memory v0.6'));
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });

  it("guards simulation feedback while preserving project-owned simulation routes", () => {
    const source = read("server/src/routes/simulation.ts");
    expect(source).toContain('"system.simulation.feedback.analyze"');
    expect(source).toContain('"request-simulation-report"');
    expect(
      source.indexOf('"system.simulation.feedback.analyze"'),
    ).toBeLessThan(
      source.indexOf("feedbackEngine.generateFeedback(report, metrics)"),
    );
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });

  it("guards stateless blueprint generation and preserves project-owned generation routes", () => {
    const source = read("server/src/routes/generation-v2.ts");
    expect(source).toContain('"system.generation.v2.blueprint.generate"');
    expect(source).toContain('"request-generation-outputs"');
    expect(
      source.indexOf('"system.generation.v2.blueprint.generate"'),
    ).toBeLessThan(source.indexOf("blueprintEngine.generate(outputs)"));
    expect(source).toContain("access.requireProjectAccess(req, res, projectId)");
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });
});
