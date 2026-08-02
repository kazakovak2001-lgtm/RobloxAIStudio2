import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/api/v2/index.ts"),
  "utf8",
);

describe("SECURITY-2G-E api v2 authorization scope", () => {
  it("requires project access before opening the compile stream", () => {
    const route = source.indexOf('router.post("/compile/stream"');
    const access = source.indexOf("access.requireProjectAccess", route);
    const headers = source.indexOf('res.setHeader("Content-Type"', route);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(access).toBeGreaterThan(route);
    expect(headers).toBeGreaterThan(access);
  });

  it("requires project access before creating a dag", () => {
    const route = source.indexOf('router.post("/plan/dag"');
    const access = source.indexOf("access.requireProjectAccess", route);
    const createPlan = source.indexOf("planner.createPlan", route);
    expect(route).toBeGreaterThanOrEqual(0);
    expect(access).toBeGreaterThan(route);
    expect(createPlan).toBeGreaterThan(access);
  });

  it("keeps status as metadata-only", () => {
    expect(source).toContain('router.get("/status"');
    expect(source).toContain('stability: "EXPERIMENTAL"');
  });
});
