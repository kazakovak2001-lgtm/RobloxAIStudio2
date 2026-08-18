/**
 * FP-1C. The constrained repair prompt must carry the designed level.
 *
 * A live run passed validation on the third attempt and produced a runtime-safe
 * but empty world: no terrain, no spawn, no designed geometry. The cause was
 * structural, not sampling — `buildConstrainedPlayableRepairPrompt` received
 * only name/description/reason, so the last attempt asked for a game with no
 * level. Any pass reached that way loses the world.
 *
 * These tests drive the real agent through all three attempts and assert on the
 * prompt the third attempt actually receives.
 */

import { describe, expect, it, vi } from "vitest";
import { LuaGeneratorAgent } from "../agents/implementations/LuaGeneratorAgent";
import {
  describeSpatialDesign,
  buildSpatialDesign,
} from "../validation/spatialDesign";

/** A generic design: no theme, coordinates or names from any acceptance game. */
const spatialDesign = {
  schemaVersion: 1,
  map: {
    id: "map-1",
    name: "Test Basin",
    type: "main",
    size: { x: 256, y: 96, z: 256 },
    theme: "neutral test terrain",
  },
  zones: [
    {
      id: "zone-a",
      name: "Start Flat",
      type: "safe",
      bounds: { minX: -80, minZ: -80, maxX: -10, maxZ: -10 },
      groundHeight: 9,
    },
  ],
  spawns: [
    {
      id: "spawn-1",
      name: "Primary Spawn",
      type: "initial",
      position: { x: -45, y: 11, z: -45 },
    },
  ],
  terrain: [
    {
      id: "ter-1",
      shape: "block",
      material: "Slate",
      position: { x: 12, y: 3, z: 7 },
      size: { x: 140, y: 6, z: 160 },
    },
  ],
  objects: [
    {
      id: "obj-1",
      name: "Marker Pillar",
      objectType: "interactive",
      position: { x: 33, y: 9, z: 21 },
      size: { x: 4, y: 8, z: 4 },
      material: "Neon",
      zoneId: "zone-a",
    },
  ],
  paths: [],
};

/** Parses but never satisfies playability, so all three attempts run. */
const UNPLAYABLE = JSON.stringify({
  lua_generator: {
    server: [{ name: "World.server.lua", code: "local a = 1" }],
    client: [{ name: "Hud.client.lua", code: "local b = 2" }],
    shared: [],
  },
});

async function promptsFromFullRepairChain(): Promise<string[]> {
  const generate = vi.fn().mockResolvedValue(UNPLAYABLE);
  const agent = new LuaGeneratorAgent();
  agent.setLLM({ generate });
  await agent.execute({
    blueprint: {
      name: "Probe Game",
      description: "A generic exploration probe",
    },
    architecture: { services: ["WorldService"], spatialDesign },
    gameplay: { mechanics: [{ name: "marker collection" }] },
  } as never);
  return generate.mock.calls.map((c) => String(c[0]));
}

describe("constrained repair preserves the designed level", () => {
  it("runs all three attempts and reaches the constrained prompt", async () => {
    const prompts = await promptsFromFullRepairChain();
    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("repairing Roblox Luau");
  });

  it("includes the spatial design in the constrained prompt", async () => {
    const prompts = await promptsFromFullRepairChain();
    expect(prompts[2]).toContain("Level to build");
  });

  it("carries canonical coordinates, materials and identifiers into attempt 3", async () => {
    const prompts = await promptsFromFullRepairChain();
    const constrained = prompts[2];
    // Values straight from the design, not re-derived.
    expect(constrained).toContain("Primary Spawn");
    expect(constrained).toContain("-45");
    expect(constrained).toContain("Marker Pillar");
    expect(constrained).toContain("Slate");
    expect(constrained).toContain("Neon");
    expect(constrained).toContain("ter-1");
  });

  it("uses the same serialization as the primary path, not a second format", async () => {
    const parsed = buildSpatialDesign(spatialDesign);
    if (parsed.outcome !== "designed") throw new Error("fixture invalid");
    const canonical = describeSpatialDesign(parsed.design);
    const prompts = await promptsFromFullRepairChain();
    // The exact canonical text appears verbatim in both the first and last prompt.
    expect(prompts[0]).toContain(canonical);
    expect(prompts[2]).toContain(canonical);
  });

  it("still states the validation failure it is repairing", async () => {
    const prompts = await promptsFromFullRepairChain();
    expect(prompts[2]).toContain("Validation failure:");
  });

  it("keeps the existing ownership and runtime rules intact", async () => {
    const prompts = await promptsFromFullRepairChain();
    const constrained = prompts[2];
    expect(constrained).toContain("exactly one server entry");
    expect(constrained).toContain("Touched:Connect");
    expect(constrained).toContain("ScreenGui");
    expect(constrained).toContain("OnClientEvent");
    expect(constrained).toContain("Never call InsertService");
  });

  it("tells the model to simplify code, not the world", async () => {
    const prompts = await promptsFromFullRepairChain();
    const constrained = prompts[2];
    expect(constrained).toContain(
      "Simplify the code structure, never the world",
    );
    expect(constrained).toContain("Do not invent replacement coordinates");
    expect(constrained).toContain(
      "Do not omit a required spatial element to make validation pass",
    );
  });

  it("contains no acceptance-specific vocabulary", async () => {
    const prompts = await promptsFromFullRepairChain();
    expect(prompts[2]).not.toMatch(/tropical|island|palm|coin/i);
  });

  it("degrades to the previous prompt when no design was produced", async () => {
    const generate = vi.fn().mockResolvedValue(UNPLAYABLE);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });
    await agent.execute({
      blueprint: { name: "Probe Game", description: "A generic probe" },
      architecture: { services: ["WorldService"] },
    } as never);
    const constrained = String(generate.mock.calls[2]?.[0]);
    expect(constrained).toContain("repairing Roblox Luau");
    expect(constrained).not.toContain("Level to build");
  });
});
