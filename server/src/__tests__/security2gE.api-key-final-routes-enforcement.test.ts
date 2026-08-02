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

describe("SECURITY-2G-E final API-key route enforcement", () => {
  it("guards both platform agent registry reads", () => {
    const source = read("server/src/routes/platform.ts");
    const list = routeSegment(
      source,
      'router.get("/registry/agents"',
      'router.get("/registry/agents/:id"',
    );
    const detail = routeSegment(source, 'router.get("/registry/agents/:id"');

    expect(list).toContain('"system.platform.registry.agents.list"');
    expect(list).toContain('"platform-agent-registry"');
    expect(list.indexOf("requireApiKeyCapability")).toBeLessThan(
      list.indexOf("registry.getActive()"),
    );

    expect(detail).toContain('"system.platform.registry.agent.read"');
    expect(detail).toContain('"platform-agent-registry"');
    expect(detail.indexOf("requireApiKeyCapability")).toBeLessThan(
      detail.indexOf("registry.get(req.params.id)"),
    );
  });

  it("guards all world placeholder metadata routes", () => {
    const source = read("server/src/routes/world.ts");
    const tick = routeSegment(
      source,
      'router.post("/tick"',
      'router.get("/state/:gameId"',
    );
    const state = routeSegment(
      source,
      'router.get("/state/:gameId"',
      'router.get("/emergence/:gameId"',
    );
    const emergence = routeSegment(source, 'router.get("/emergence/:gameId"');

    expect(tick).toContain('"system.world.tick.metadata.read"');
    expect(tick).toContain('"placeholder-metadata"');
    expect(tick.indexOf("requireApiKeyCapability")).toBeLessThan(
      tick.indexOf("Single-tick mode"),
    );

    expect(state).toContain('"system.world.state.metadata.read"');
    expect(state).toContain('"placeholder-metadata"');
    expect(state.indexOf("requireApiKeyCapability")).toBeLessThan(
      state.indexOf("World state stored"),
    );

    expect(emergence).toContain('"system.world.emergence.metadata.read"');
    expect(emergence).toContain('"placeholder-metadata"');
    expect(emergence.indexOf("requireApiKeyCapability")).toBeLessThan(
      emergence.indexOf("Emergence data stored"),
    );

    expect(source).toContain(
      "access.requireProjectAccess(req, res, blueprint.id)",
    );
  });
});
