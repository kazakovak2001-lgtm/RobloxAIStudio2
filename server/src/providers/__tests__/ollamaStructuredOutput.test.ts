/**
 * FP-1C structured output for Ollama.
 *
 * The remaining FP-1C blocker was JSON transport fidelity, not content: the
 * model generated usable Luau but wrapped it in JSON it could not encode —
 * raw newlines inside string values, and unterminated strings. No parser
 * heuristic can reliably recover that, so the constraint is moved to the
 * decoder via Ollama's native `format` field.
 *
 * These tests pin that the constraint is actually sent, that it coexists with
 * the B2 streaming fix, and that nothing about rejection behaviour softened.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../ollama";
import { OpenAIProvider } from "../openai";
import { LuaGeneratorAgent } from "../../agents/implementations/LuaGeneratorAgent";
import {
  getPlayableLuaIssues,
  normalizeLuaScripts,
} from "../../types/playableLua";

afterEach(() => vi.restoreAllMocks());

function streamed(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const l of lines) controller.enqueue(encoder.encode(l + "\n"));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

/** One NDJSON stream carrying `payload` as the completion. */
function completionOf(payload: string): Response {
  return streamed([
    JSON.stringify({ response: payload, done: false }),
    JSON.stringify({ done: true, eval_count: 1 }),
  ]);
}

function lastBody(mock: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = (mock as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  return JSON.parse(
    String((calls[calls.length - 1]?.[1] as RequestInit)?.body),
  );
}

describe("Ollama sends the structured-output constraint", () => {
  it("passes a JSON schema through as `format`", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completionOf("{}"));
    const schema = {
      type: "object",
      properties: { lua_generator: { type: "object" } },
      required: ["lua_generator"],
    };

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseSchema: schema,
    });

    expect(lastBody(fetchMock).format).toEqual(schema);
  });

  it('falls back to `format: "json"` when only a format was requested', async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completionOf("{}"));

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseFormat: "json",
    });

    expect(lastBody(fetchMock).format).toBe("json");
  });

  it("prefers the schema over the weaker format flag", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completionOf("{}"));
    const schema = { type: "object" };

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseFormat: "json",
      responseSchema: schema,
    });

    expect(lastBody(fetchMock).format).toEqual(schema);
  });

  it("omits `format` entirely when nothing was requested", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completionOf("hello"));

    await new OllamaProvider({ model: "m" }).generate("p");

    expect(lastBody(fetchMock)).not.toHaveProperty("format");
  });

  it("keeps streaming enabled alongside the constraint (B2 coexistence)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completionOf("{}"));

    await new OllamaProvider({ model: "m" }).generate("p", {
      responseSchema: { type: "object" },
    });

    const body = lastBody(fetchMock);
    expect(body.stream).toBe(true);
    expect(body.format).toEqual({ type: "object" });
  });
});

describe("multiline Luau survives the JSON transport", () => {
  const LUA_SERVER = [
    'local Players = game:GetService("Players")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    "",
    'local event = Instance.new("RemoteEvent")',
    'event.Name = "ProgressEvent"',
    "event.Parent = ReplicatedStorage",
    "",
    'local world = Instance.new("Folder")',
    "world.Parent = workspace",
    'local spawnPoint = Instance.new("SpawnLocation")',
    "spawnPoint.Anchored = true",
    "spawnPoint.Position = Vector3.new(0, 5, 0)",
    "spawnPoint.Parent = world",
    "",
    'local target = Instance.new("Part")',
    "target.Anchored = true",
    "target.Size = Vector3.new(4, 4, 4)",
    "target.Material = Enum.Material.Neon",
    "target.Parent = world",
    "",
    "local score = 0",
    "target.Touched:Connect(function(hit)",
    "  local player = Players:GetPlayerFromCharacter(hit.Parent)",
    "  if player then",
    "    score = score + 1",
    "    event:FireClient(player, score)",
    "  end",
    "end)",
  ].join("\n");

  const LUA_CLIENT = [
    'local Players = game:GetService("Players")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    "",
    'local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")',
    'local gui = Instance.new("ScreenGui")',
    "gui.Parent = playerGui",
    "",
    'local label = Instance.new("TextLabel")',
    "label.Size = UDim2.new(0.3, 0, 0.1, 0)",
    'label.Text = "Progress: 0"',
    "label.Parent = gui",
    "",
    "ReplicatedStorage.ProgressEvent.OnClientEvent:Connect(function(score)",
    '  label.Text = "Progress: " .. tostring(score)',
    "end)",
  ].join("\n");

  /** What a schema-constrained decoder produces: newlines properly escaped. */
  const CONFORMING = JSON.stringify({
    lua_generator: {
      server: [{ name: "World.server.lua", code: LUA_SERVER }],
      client: [{ name: "Hud.client.lua", code: LUA_CLIENT }],
      shared: [],
    },
  });

  it("round-trips embedded newlines through the streamed provider", async () => {
    // Split mid-string to prove reassembly is not what makes this work.
    const half = Math.floor(CONFORMING.length / 2);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamed([
        JSON.stringify({ response: CONFORMING.slice(0, half), done: false }),
        JSON.stringify({ response: CONFORMING.slice(half), done: false }),
        JSON.stringify({ done: true, eval_count: 7 }),
      ]),
    );

    const raw = await new OllamaProvider({ model: "m" }).generate("p", {
      responseSchema: { type: "object" },
    });

    expect(raw).toBe(CONFORMING);
    expect(JSON.parse(raw).lua_generator.server[0].code).toContain("\n");
  });

  it("schema-conforming output parses through the existing Lua output path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(completionOf(CONFORMING));

    const provider = new OllamaProvider({ model: "m" });
    const agent = new LuaGeneratorAgent();
    agent.setLLM(provider);

    const result = await agent.execute({
      blueprint: { name: "Probe", description: "A contract probe" },
      architecture: { services: ["WorldService"] },
    } as never);

    expect(result.success).toBe(true);
    expect(result.usedFallback).toBeUndefined();
    const scripts = normalizeLuaScripts(result.data);
    expect(getPlayableLuaIssues(scripts)).toEqual([]);
  });

  it("still rejects output that parses but is not playable", () => {
    const scripts = normalizeLuaScripts({
      lua_generator: {
        server: [{ name: "World.server.lua", code: "local x = 1" }],
        client: [{ name: "Hud.client.lua", code: "local y = 2" }],
        shared: [],
      },
    });
    expect(getPlayableLuaIssues(scripts).length).toBeGreaterThan(0);
  });

  it("still rejects malformed JSON rather than salvaging it", async () => {
    // A raw newline inside a JSON string: exactly the live failure mode.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completionOf(
        '{"lua_generator": {"server": [{"code": "local a = 1\nlocal b = 2"}]}}',
      ),
    );

    const agent = new LuaGeneratorAgent();
    agent.setLLM(new OllamaProvider({ model: "m", maxRetries: 1 }));

    const result = await agent.execute({
      blueprint: { name: "Probe", description: "A contract probe" },
    } as never);

    expect(result.success).toBe(false);
  });
});

describe("providers without the capability are unchanged", () => {
  it("OpenAI ignores responseSchema and sends no format field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
          model: "gpt-4o-mini",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await new OpenAIProvider({ apiKey: "k", model: "gpt-4o-mini" }).generate(
      "p",
      { responseSchema: { type: "object" } },
    );

    const body = lastBody(fetchMock);
    expect(body).not.toHaveProperty("format");
    expect(body).not.toHaveProperty("response_format");
  });
});
