import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const routeSegment = (source: string, start: string, end?: string) => {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
};

describe("SECURITY-2G-E API-key enforcement for small routes", () => {
  it("guards economy balance and report metadata before route work", () => {
    const source = read("server/src/routes/economy.ts");
    const balance = routeSegment(
      source,
      'router.post("/balance"',
      'router.get("/report/:gameId"',
    );
    const report = routeSegment(source, 'router.get("/report/:gameId"');

    expect(balance).toContain('"system.economy.balance.execute"');
    expect(balance).toContain('"request-economy-report"');
    expect(balance.indexOf('"system.economy.balance.execute"')).toBeLessThan(
      balance.indexOf("const patch = balancer.generate(report)"),
    );
    expect(report).toContain('"system.economy.report.metadata.read"');
    expect(report).toContain('"placeholder-metadata"');
    expect(
      report.indexOf('"system.economy.report.metadata.read"'),
    ).toBeLessThan(report.indexOf('"Economy reports stored in Memory v0.6'));
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });

  it("guards simulation feedback while preserving project-owned simulation routes", () => {
    const source = read("server/src/routes/simulation.ts");
    const feedback = routeSegment(source, 'router.post("/feedback"');

    expect(feedback).toContain('"system.simulation.feedback.analyze"');
    expect(feedback).toContain('"request-simulation-report"');
    expect(
      feedback.indexOf('"system.simulation.feedback.analyze"'),
    ).toBeLessThan(
      feedback.indexOf("feedbackEngine.generateFeedback(report, metrics)"),
    );
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });

  it("guards stateless blueprint generation and preserves project-owned generation routes", () => {
    const source = read("server/src/routes/generation-v2.ts");
    const blueprint = routeSegment(
      source,
      'router.post("/blueprint"',
      'router.post("/lua"',
    );

    expect(blueprint).toContain('"system.generation.v2.blueprint.generate"');
    expect(blueprint).toContain('"request-generation-outputs"');
    expect(
      blueprint.indexOf('"system.generation.v2.blueprint.generate"'),
    ).toBeLessThan(blueprint.indexOf("blueprintEngine.generate(outputs)"));
    expect(source).toContain("access.requireProjectAccess(req, res, projectId)");
    expect(source).toContain("access.requireProjectAccess(req, res, blueprint.id)");
  });
});
