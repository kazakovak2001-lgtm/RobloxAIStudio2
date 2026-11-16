import { describe, expect, it } from "vitest";
import {
  GameDesignerAgent,
  normalizeDesignExtensions,
} from "./GameDesignerAgent";

describe("GameDesignerAgent deterministic fallback", () => {
  it("honors explicit blueprint mechanics so a changed design can remove an entity", async () => {
    const mechanics = [
      "asymmetric co-op roles",
      "tower-defense inspired lanes",
      "base-building production lines",
      "combo-based traversal",
    ];
    const result = await new GameDesignerAgent().execute({
      blueprint: {
        name: "Changed Studio acceptance design",
        genre: ["adventure"],
        gameplay: {
          mechanics: mechanics.map((name) => ({
            name,
            description: `Explicit mechanic: ${name}`,
            parameters: {},
          })),
        },
      },
      gameDesignSeed: {
        genre: "adventure",
        coreLoop: "explore → engage → reward",
        mechanics: [...mechanics, "event-driven economy shocks"],
        constraints: [],
        theme: "aurora ruins",
        innovationModifiers: [],
      },
    });

    expect(result.success).toBe(true);
    const gameplay = (result.data as Record<string, unknown>).gameplay as {
      mechanics: Array<{ name: string }>;
    };
    expect(gameplay.mechanics.map((mechanic) => mechanic.name)).toEqual(
      mechanics,
    );
    expect(JSON.stringify(result.data)).not.toContain(
      "event-driven economy shocks",
    );
  });
});

describe("GameDesignerAgent design extensions", () => {
  const blueprint = { name: "Quest Town", genre: ["adventure"] };

  it("does not invent npcs, quests or overview in the deterministic fallback", async () => {
    const result = await new GameDesignerAgent().execute({ blueprint });
    const data = result.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("npcs");
    expect(data).not.toHaveProperty("quests");
    expect(data).not.toHaveProperty("overview");
  });

  it("keeps well-formed model extensions and asks for them in the prompt", async () => {
    const prompts: string[] = [];
    const agent = new GameDesignerAgent();
    agent.setLLM({
      name: "stub",
      generate: async (prompt: string) => {
        prompts.push(prompt);
        return JSON.stringify({
          gameplay: { mechanics: [{ name: "Trading" }] },
          overview: "  A small town economy.  ",
          npcs: [
            { name: "Mara", role: "Shopkeeper", description: "Sells tools" },
          ],
          quests: [{ name: "First delivery", objective: "Deliver 3 crates" }],
        });
      },
    });
    const result = await agent.execute({ blueprint });
    expect(prompts[0]).toContain('"npcs"');
    const data = result.data as Record<string, unknown>;
    expect(data.overview).toBe("A small town economy.");
    expect(data.npcs).toEqual([
      { name: "Mara", role: "Shopkeeper", description: "Sells tools" },
    ]);
    expect(data.quests).toEqual([
      { name: "First delivery", objective: "Deliver 3 crates" },
    ]);
  });

  it("drops malformed extensions instead of passing them on", () => {
    const out = normalizeDesignExtensions({
      gameplay: {},
      overview: 42,
      npcs: [{ role: "no name" }, "text", null],
      quests: "not an array",
    });
    expect(out).toEqual({ gameplay: {} });
  });
});
