import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";
import {
  assertPlayableLuaScripts,
  normalizeLuaScripts,
} from "../../types/playableLua";

const DEFAULT_SERVICES = ["GameManager", "DataService", "PlayerService"];

/** Extract stable architecture names from either array- or object-shaped output. */
export function extractServiceNames(services: unknown): string[] {
  const values = Array.isArray(services)
    ? services
    : services && typeof services === "object"
      ? Object.entries(services).map(([key, value]) =>
          typeof value === "string" ? value : { name: key, value },
        )
      : [];
  const names = values
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (value && typeof value === "object" && "name" in value) {
        return String(value.name).trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 5);
  return names.length > 0 ? names : DEFAULT_SERVICES;
}

function playableFallback(name: string): Record<string, unknown> {
  const gameName = JSON.stringify(name);
  return {
    lua_generator: {
      server: [
        {
          name: "AdventureBootstrap.server.lua",
          code: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local event = ReplicatedStorage:FindFirstChild("ObjectiveProgress") or Instance.new("RemoteEvent")
event.Name = "ObjectiveProgress"
event.Parent = ReplicatedStorage

local world = workspace:FindFirstChild("GeneratedAdventure") or Instance.new("Folder")
world.Name = "GeneratedAdventure"
world.Parent = workspace

local function makePart(name, position, color)
  local part = Instance.new("Part")
  part.Name = name
  part.Anchored = true
  part.Size = Vector3.new(5, 1, 5)
  part.Position = position
  part.Color = color
  part.Parent = world
  return part
end

makePart("StartIsland", Vector3.new(0, 3, 0), Color3.fromRGB(72, 120, 72))
for index = 1, 5 do
  local collectible = makePart("Collectible" .. index, Vector3.new(index * 8, 5, 0), Color3.fromRGB(255, 200, 40))
  collectible.Shape = Enum.PartType.Ball
  collectible.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if not player or not collectible.Parent then return end
    local score = player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Score")
    if score then score.Value += 1 end
    event:FireClient(player, score and score.Value or 0, 5)
    collectible:Destroy()
  end)
end

Players.PlayerAdded:Connect(function(player)
  local leaderstats = Instance.new("Folder")
  leaderstats.Name = "leaderstats"
  leaderstats.Parent = player
  local score = Instance.new("IntValue")
  score.Name = "Score"
  score.Parent = leaderstats
end)`,
        },
      ],
      client: [
        {
          name: "AdventureHUD.client.lua",
          code: `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "GeneratedAdventureHUD"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local objective = Instance.new("TextLabel")
objective.Size = UDim2.fromOffset(420, 56)
objective.Position = UDim2.fromOffset(24, 24)
objective.BackgroundColor3 = Color3.fromRGB(20, 25, 35)
objective.TextColor3 = Color3.new(1, 1, 1)
objective.TextScaled = true
objective.Text = ${gameName} .. ": collect 5 golden orbs (0/5)"
objective.Parent = gui

ReplicatedStorage:WaitForChild("ObjectiveProgress").OnClientEvent:Connect(function(score, target)
  objective.Text = ${gameName} .. ": collect 5 golden orbs (" .. score .. "/" .. target .. ")"
  if score >= target then objective.Text = "Objective complete!" end
end)`,
        },
      ],
      shared: [
        {
          name: "GameConfig.lua",
          code: `return { GAME_NAME = ${gameName}, COLLECTIBLE_TARGET = 5 }`,
        },
      ],
      patterns: [
        "Server-authoritative collectibles",
        "Runtime world bootstrap",
        "Client objective HUD",
      ],
    },
  };
}

export class LuaGeneratorAgent extends BaseAgent {
  public readonly name = "LuaGenerator";
  public readonly description =
    "Generates Roblox Luau server, client, and shared modules";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      architecture: { type: "object" },
      gameplay: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      generatedCode: { type: "object" },
      lua_generator: { type: "object" },
    },
    required: ["lua_generator"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super({ maxRetries: 1, ...config });
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const arch = (input.architecture ?? input.roblox_architect) as
      Record<string, unknown> | undefined;
    const gameplay = input.gameplay as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "UnnamedGame");
    const description = String(
      bp?.description ?? "Create a playable Roblox game",
    );
    const services = arch?.services ?? {};
    const serviceNames = extractServiceNames(services);

    const mechanicsArr = (gameplay as any)?.mechanics;
    const systemsSummary = Array.isArray(mechanicsArr)
      ? mechanicsArr
          .slice(0, 4)
          .map((m: any) => String(m?.name ?? m))
          .join(", ")
      : "core systems";

    const fallback = playableFallback(name);

    if (!this.llm) return fallback;

    const codingStandards =
      "PascalCase modules, camelCase functions, server-authoritative, RemoteEvents for client communication";

    const registryPrompt = this.buildPrompt({
      name,
      description,
      architecture_summary: serviceNames.join(", "),
      systems_summary: systemsSummary,
      coding_standards: codingStandards,
    });

    const inlinePrompt =
      "You are a Roblox Luau developer. Generate structured module code. " +
      "Respond with a single JSON object:\n" +
      '{ "lua_generator": { "server": Array<{name,code}>, "client": Array<{name,code}>, ' +
      '"shared": Array<{name,code}>, "patterns": string[] } }\n\n' +
      `Game Name: ${name}\nServices: ${serviceNames.join(", ")}\n` +
      `Game Brief: ${description}\n` +
      `Gameplay Systems: ${systemsSummary}\nCoding Standards: ${codingStandards}\n\n` +
      "Generate a playable vertical slice for a blank Baseplate: server code must create visible world parts and connect a Touched, Activated, Triggered, or MouseClick gameplay objective; client code must create a visible ScreenGui under PlayerGui. " +
      "Server/client entries are runnable Scripts, not modules, so they must not end with return. Shared entries may return modules. Never use TODOs, placeholders, empty functions, or comments instead of behavior. Return only valid JSON.";

    const prompt = registryPrompt ?? inlinePrompt;

    let result: Record<string, unknown>;
    try {
      result = await this.generateLua(prompt, {
        temperature: 0.4,
        maxTokens: 3000,
      });
      assertPlayableLuaScripts(normalizeLuaScripts(result));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result = await this.generateLua(
        `${prompt}\n\nREPAIR REQUIRED: ${reason}. Replace the entire response with complete executable code satisfying every runtime requirement.`,
        { temperature: 0.1, maxTokens: 4000 },
      );
      assertPlayableLuaScripts(normalizeLuaScripts(result));
    }

    return result;
  }

  private async generateLua(
    prompt: string,
    options: { temperature: number; maxTokens: number },
  ): Promise<Record<string, unknown>> {
    if (!this.llm) throw new Error("Lua LLM provider is unavailable");
    const { LLMOutputParser } = await import("../../ai/outputParser");
    const raw = await this.llm.generate(prompt, options);
    const parsed = LLMOutputParser.extractJSON(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Lua LLM response is not a valid JSON object");
    }
    const normalized = LLMOutputParser.normalizeKeys(
      parsed as Record<string, unknown>,
    );
    if (!("lua_generator" in normalized)) {
      throw new Error("Lua LLM response is missing lua_generator");
    }
    return normalized;
  }
}
