/**
 * FP-1C. LuaGenerator generation budgets.
 *
 * A live repair produced ~17k characters and was cut mid-string at the old
 * 4000-token ceiling. Truncated JSON is unparseable regardless of how correct
 * the generated Luau is, so the budgets are pinned here: raising them silently
 * later, or lowering them back, should fail a test rather than surface as an
 * unexplained parse error.
 *
 * These budgets are per-call arguments from this agent, not provider defaults.
 * The provider's own `num_predict ?? 2000` fallback is asserted separately so
 * the two cannot drift into each other.
 */

import { describe, expect, it, vi } from "vitest";
import { LuaGeneratorAgent } from "../agents/implementations/LuaGeneratorAgent";
import { OllamaProvider } from "../providers/ollama";

const INPUT = {
  blueprint: { name: "Probe", description: "A contract probe" },
  architecture: { services: ["WorldService"] },
} as never;

/** Output that parses but fails playability, to force the repair chain onward. */
const UNPLAYABLE = JSON.stringify({
  lua_generator: {
    server: [{ name: "World.server.lua", code: "local a = 1" }],
    client: [{ name: "Hud.client.lua", code: "local b = 2" }],
    shared: [],
  },
});

function maxTokensPerCall(generate: ReturnType<typeof vi.fn>): number[] {
  return generate.mock.calls.map(
    (call) => (call[1] as { maxTokens: number }).maxTokens,
  );
}

describe("LuaGenerator generation budgets", () => {
  it("requests 6000 tokens for the initial generation", async () => {
    const generate = vi.fn().mockResolvedValue(UNPLAYABLE);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    await agent.execute(INPUT);

    expect(maxTokensPerCall(generate)[0]).toBe(6000);
  });

  it("requests 8000 tokens on both repair paths", async () => {
    const generate = vi.fn().mockResolvedValue(UNPLAYABLE);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    await agent.execute(INPUT);

    const budgets = maxTokensPerCall(generate);
    // Initial, repair 1, repair 2 — the chain runs to the end because every
    // response parses but never satisfies the playability contract.
    expect(budgets).toEqual([6000, 8000, 8000]);
  });

  it("still carries the schema constraint on every attempt", async () => {
    const generate = vi.fn().mockResolvedValue(UNPLAYABLE);
    const agent = new LuaGeneratorAgent();
    agent.setLLM({ generate });

    await agent.execute(INPUT);

    for (const call of generate.mock.calls) {
      expect((call[1] as { responseSchema?: unknown }).responseSchema).toEqual(
        agent.outputSchema,
      );
    }
  });
});

describe("unrelated defaults are untouched", () => {
  it("keeps the provider's own num_predict fallback at 2000", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ response: "x", done: true, eval_count: 1 }) +
                  "\n",
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    await new OllamaProvider({ model: "m" }).generate("p");

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body),
    );
    expect(body.options.num_predict).toBe(2000);
    vi.restoreAllMocks();
  });

  it("leaves other agents' budgets alone", async () => {
    const { GameDesignerAgent } =
      await import("../agents/implementations/GameDesignerAgent");
    const source = (await import("node:fs")).readFileSync(
      "server/src/agents/implementations/GameDesignerAgent.ts",
      "utf8",
    );
    expect(source).toContain("maxTokens: 1800");
    expect(GameDesignerAgent).toBeDefined();
  });
});
