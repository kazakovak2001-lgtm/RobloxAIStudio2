import { describe, expect, it } from "vitest";
import { GameDesignerAgent } from "./GameDesignerAgent";

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
