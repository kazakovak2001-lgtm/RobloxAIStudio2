/**
 * FIRST-PLAYABLE-1 (FP-1B). The generated level reaches the Lua generator.
 *
 * The contract parser is tested next door. What is under test here is only the
 * wiring: that a level designed by `roblox_architect` arrives in the prompt the
 * Lua generator actually sends, with its own coordinates, and that a run
 * without one still behaves the way it did before this slice.
 *
 * The prompt is captured from a stub LLM rather than asserted against a golden
 * string, so this fails when the level stops being passed — not when the
 * wording changes.
 */

import { describe, expect, it, vi } from "vitest";
import { LuaGeneratorAgent } from "../agents/implementations/LuaGeneratorAgent";

/** A level with coordinates nothing in production could have guessed. */
const spatialDesign = {
  map: {
    id: "map-1",
    name: "Designed Map",
    type: "main",
    size: { x: 384, y: 96, z: 384 },
    theme: "generated theme",
  },
  zones: [
    {
      id: "zone-a",
      name: "Landing",
      type: "safe",
      bounds: { minX: -48, minZ: -48, maxX: 48, maxZ: 48 },
      groundHeight: 7,
    },
    {
      id: "zone-b",
      name: "Ridge",
      type: "exploration",
      bounds: { minX: 64, minZ: 64, maxX: 192, maxZ: 192 },
    },
  ],
  spawns: [
    {
      id: "spawn-a",
      name: "Landing Spawn",
      type: "initial",
      position: { x: 3, y: 17, z: 5 },
    },
  ],
  terrain: [
    {
      id: "terrain-a",
      shape: "ball",
      material: "Sandstone",
      position: { x: 11, y: 2, z: 13 },
      size: { x: 37, y: 37, z: 37 },
    },
  ],
  objects: [
    {
      id: "object-a",
      name: "Span",
      objectType: "structure",
      position: { x: 23, y: 29, z: 31 },
      size: { x: 6, y: 1, z: 41 },
      orientation: { x: 0, y: 19, z: 0 },
      material: "Wood",
      zoneId: "zone-a",
    },
    {
      id: "object-b",
      name: "Pickup",
      objectType: "interactive",
      position: { x: 43, y: 47, z: 53 },
    },
  ],
  paths: [{ id: "path-a", fromZoneId: "zone-a", toZoneId: "zone-b", width: 9 }],
};

const validLuaResponse = JSON.stringify({
  lua_generator: {
    server: [
      { name: "Game.server.lua", code: "-- replaced by the assertions" },
    ],
    client: [{ name: "HUD.client.lua", code: "-- replaced by the assertions" }],
    shared: [],
  },
});

function baseInput(architecture: Record<string, unknown>) {
  return {
    blueprint: {
      name: "Wired Game",
      description: "A generated game used to check that the level is passed.",
    },
    architecture,
    gameplay: { mechanics: [{ name: "Collection" }] },
  };
}

/** Run the agent against a stub LLM and return the prompt it was given. */
async function capturePrompt(
  architecture: Record<string, unknown>,
): Promise<string> {
  const generate = vi.fn().mockResolvedValue(validLuaResponse);
  const agent = new LuaGeneratorAgent();
  agent.setLLM({ generate });
  await agent.execute(baseInput(architecture));

  expect(generate).toHaveBeenCalled();
  return String(generate.mock.calls[0]?.[0] ?? "");
}

describe("FP-1B the designed level reaches the Lua generator", () => {
  it("carries the architect's coordinates, extents and materials into the prompt", async () => {
    const prompt = await capturePrompt({
      services: ["WorldService"],
      spatialDesign,
    });

    // Coordinates the agent could only have got from the design.
    expect(prompt).toContain("(3, 17, 5)");
    expect(prompt).toContain("(11, 2, 13)");
    expect(prompt).toContain("(23, 29, 31)");
    expect(prompt).toContain("(43, 47, 53)");
    // Kinds and materials, not just numbers.
    expect(prompt).toContain("ball Sandstone");
    expect(prompt).toContain("material Wood");
    expect(prompt).toContain("(interactive)");
    expect(prompt).toContain("Path path-a connects zone-a to zone-b");
    expect(prompt).toContain("groundHeight=7");
  });

  it("instructs the model to build real terrain with the voxel API", async () => {
    const prompt = await capturePrompt({
      services: ["WorldService"],
      spatialDesign,
    });

    expect(prompt).toContain("Terrain:FillBall");
    expect(prompt).toContain("Terrain:FillBlock");
    expect(prompt).toContain("Terrain:Clear()");
    expect(prompt).toContain("SpawnLocation");
    // Generic API guidance only — never a level baked into the platform.
    expect(prompt).not.toMatch(/tropical|island|coin/i);
  });

  it("reads the design from the architect output the executor accumulates", async () => {
    // `roblox_architect` is the key PlanExecutor merges in from the dependency,
    // and is what the agent sees in production when `architecture` is absent.
    const generate = vi.fn().mockResolvedValue(validLuaResponse);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });
    await agent.execute({
      blueprint: { name: "Wired Game", description: "brief" },
      roblox_architect: { services: ["WorldService"], spatialDesign },
      gameplay: { mechanics: [] },
    });

    expect(String(generate.mock.calls[0]?.[0] ?? "")).toContain("(3, 17, 5)");
  });

  it("states no level, and says so, when no design was produced", async () => {
    const prompt = await capturePrompt({ services: ["WorldService"] });

    // The section header is part of the template; what matters is that it
    // carries nothing, and that the model is told to lay out its own level
    // rather than being left with an empty instruction.
    expect(prompt).toContain("Level to build:\n\n");
    expect(prompt).toContain("If the level section is empty");
    // Nothing invented a position to fill the gap.
    expect(prompt).not.toMatch(/Spawn spawn-|Terrain terrain-|Object object-/);
    // The pre-FP-1 instruction is still there, so a run without a level
    // degrades to what the platform did before rather than losing its prompt.
    expect(prompt).toContain("playable vertical slice");
  });

  it("ignores a structurally invalid design rather than passing it through", async () => {
    const broken = {
      ...spatialDesign,
      // No spawn point: the parser rejects the whole design.
      spawns: [],
    };
    const prompt = await capturePrompt({
      services: ["WorldService"],
      spatialDesign: broken,
    });

    // Rejected wholesale — not partially salvaged. None of its coordinates
    // reach the model, including the ones that were individually well-formed.
    expect(prompt).toContain("Level to build:\n\n");
    expect(prompt).not.toContain("(11, 2, 13)");
    expect(prompt).not.toContain("(23, 29, 31)");
    expect(prompt).not.toMatch(/Terrain terrain-|Object object-/);
    expect(prompt).toContain("playable vertical slice");
  });
});
