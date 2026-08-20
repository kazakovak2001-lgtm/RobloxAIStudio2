import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { summariseForPrompt } from "../../ai/promptValues";
import type { AgentInput } from "../../types";
import {
  assertPlayableLuaScripts,
  normalizeLuaScripts,
} from "../../types/playableLua";
import {
  buildSpatialDesign,
  describeSpatialDesign,
} from "../../validation/spatialDesign";

const DEFAULT_SERVICES = ["GameManager", "DataService", "PlayerService"];

/**
 * GEN-CANONICAL-FIDELITY-1. What the design actually asked for, carried
 * through this agent's own prompt enrichment and deterministic fallback.
 *
 * Independent of, and not derived from, `server/src/generation/lua/LuaGenerator.ts`
 * (the legacy deterministic generator GEN-FIDELITY-1/2 improved). That
 * generator is not on the canonical `POST /:projectId/generate` path and is
 * not imported here — this agent's fallback is its own, smaller,
 * purpose-built implementation of the same class of behavior: multiple
 * ordered objectives, server-authoritative progress and reward, and a HUD
 * that reports both.
 */
interface FallbackGameplayContext {
  /** Mechanic names in design order. Empty means the design named none. */
  readonly mechanicNames: readonly string[];
  readonly progressionLoop: string;
  readonly unlockingSystem: string;
  readonly economySummary: string;
}

/** Escape a value for embedding inside a double-quoted Luau string literal. */
function luaString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/** Deterministic colour cycle so multiple fallback objectives are visually distinct. */
const OBJECTIVE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 200, 40],
  [230, 126, 34],
  [231, 76, 60],
  [26, 188, 156],
  [155, 89, 182],
];

function color3(rgb: readonly [number, number, number]): string {
  return `Color3.fromRGB(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Mechanic name from either a bare string or a `{name}`/`{title}` object, matching how GameDesignerAgent shapes `gameplay.mechanics`. */
function readMechanicNames(mechanicsArr: unknown): string[] {
  if (!Array.isArray(mechanicsArr)) return [];
  return mechanicsArr
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") {
        const record = m as Record<string, unknown>;
        if (typeof record.name === "string") return record.name;
        if (typeof record.title === "string") return record.title;
      }
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extra prompt instructions asking the model for the same class of gameplay
 * depth GEN-FIDELITY-1/2 built deterministically: multiple ordered
 * objectives, server-authoritative progress and reward, and a HUD that
 * reports all of it. Empty when the design named no mechanics, so a design
 * with nothing to build multiple objectives from is not told to invent some.
 */
function buildGameplayDepthInstructions(ctx: FallbackGameplayContext): string {
  if (ctx.mechanicNames.length === 0) return "";
  const objectiveList = ctx.mechanicNames
    .map((mechanicName, index) => `${index + 1}. ${mechanicName}`)
    .join("\n");
  const plural = ctx.mechanicNames.length === 1 ? "" : "s";
  return `

Gameplay depth requirements — this design names ${ctx.mechanicNames.length} mechanic${plural}. Build one distinct, positioned objective per mechanic below, not a single generic collectible:
${objectiveList}
- Gate completion server-side and in this exact order: an objective only advances a player's progress and pays a reward when it is that player's current objective. A client touching an out-of-order or already-completed objective must be a no-op — no reward, no progress change.
- Track each player's progress and reward balance in one authoritative server-side table, read and mutated only by the code that decides completion. Never keep a second, competing copy of that state anywhere else.
- Pay a reward for each completed objective by mutating that authoritative balance directly. Never only print or log a reward — that is not a reward.
- This design's progression: ${ctx.progressionLoop}, unlocked via ${ctx.unlockingSystem}.
- This design's reward/economy model: ${ctx.economySummary}.
- Every completion must fire the progress RemoteEvent with the completed objective's name, how many objectives are complete out of the total, the next objective (or "complete"), and the current authoritative reward balance. The client HUD must render all of that, not only a mechanic name.`;
}

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

/**
 * GEN-CANONICAL-FIDELITY-1. Deterministic fallback, used when there is no LLM
 * at all and as the last resort after every AI attempt failed playability.
 *
 * Previously this always emitted "collect 5 golden orbs" regardless of what
 * the design actually asked for — the richer mechanics, progression and
 * economy a real generation produced were discarded the moment a fallback
 * was needed. Now it builds one interactable objective per named mechanic
 * (falling back to a single generic objective only when the design named
 * none, same as before), gated to complete in order by one authoritative
 * per-player server-side state table, paying a reward from that same table
 * on each completion, and reporting the full objective/progress/reward
 * state to the client HUD — the same class of behavior GEN-FIDELITY-1/2
 * built for the legacy generator, reimplemented here independently.
 */
function playableFallback(
  name: string,
  ctx: FallbackGameplayContext,
): Record<string, unknown> {
  const gameName = JSON.stringify(name);
  const mechanicNames =
    ctx.mechanicNames.length > 0 ? ctx.mechanicNames : ["objective"];

  const objectiveEntries = mechanicNames.map(
    (mechanicName, index) =>
      `\t{ name = "${luaString(mechanicName)}", reward = ${(index + 1) * 10} },`,
  );

  const objectiveParts: string[] = [];
  mechanicNames.forEach((mechanicName, index) => {
    const varName = `objective${index + 1}`;
    objectiveParts.push(
      `local ${varName} = Instance.new("Part")`,
      `${varName}.Name = "${luaString(mechanicName)}_Interactable"`,
      `${varName}.Anchored = true`,
      `${varName}.Shape = Enum.PartType.Ball`,
      `${varName}.Size = Vector3.new(5, 5, 5)`,
      `${varName}.Position = Vector3.new(${index * 8}, 5, 0)`,
      `${varName}.Color = ${color3(OBJECTIVE_COLORS[index % OBJECTIVE_COLORS.length])}`,
      `${varName}.Parent = world`,
      `${varName}.Touched:Connect(function(hit)`,
      `\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)`,
      `\tif not player then`,
      `\t\treturn`,
      `\tend`,
      `\tonObjectiveTouched(player, ${index + 1})`,
      `end)`,
      ``,
    );
  });

  const serverCode = [
    `local Players = game:GetService("Players")`,
    `local ReplicatedStorage = game:GetService("ReplicatedStorage")`,
    ``,
    `local event = ReplicatedStorage:FindFirstChild("ObjectiveProgress") or Instance.new("RemoteEvent")`,
    `event.Name = "ObjectiveProgress"`,
    `event.Parent = ReplicatedStorage`,
    ``,
    `local world = workspace:FindFirstChild("GeneratedAdventure") or Instance.new("Folder")`,
    `world.Name = "GeneratedAdventure"`,
    `world.Parent = workspace`,
    ``,
    `local startIsland = Instance.new("Part")`,
    `startIsland.Name = "StartIsland"`,
    `startIsland.Anchored = true`,
    `startIsland.Size = Vector3.new(10, 1, 10)`,
    `startIsland.Position = Vector3.new(0, 3, 0)`,
    `startIsland.Color = Color3.fromRGB(72, 120, 72)`,
    `startIsland.Parent = world`,
    ``,
    `-- Single authoritative store of per-player progress and reward. Read`,
    `-- and mutated only here; the objective handlers below never keep a`,
    `-- second, competing copy of this state.`,
    `local PlayerState = {}`,
    ``,
    `local function ensureState(userId)`,
    `\tlocal state = PlayerState[userId]`,
    `\tif not state then`,
    `\t\tstate = { progress = 1, currency = 0 }`,
    `\t\tPlayerState[userId] = state`,
    `\tend`,
    `\treturn state`,
    `end`,
    ``,
    `local OBJECTIVES = {`,
    ...objectiveEntries,
    `}`,
    `local TOTAL_OBJECTIVES = #OBJECTIVES`,
    ``,
    `Players.PlayerAdded:Connect(function(player)`,
    `\tPlayerState[player.UserId] = { progress = 1, currency = 0 }`,
    `end)`,
    ``,
    `Players.PlayerRemoving:Connect(function(player)`,
    `\tPlayerState[player.UserId] = nil`,
    `end)`,
    ``,
    `-- Server-authoritative: an objective only advances progress and pays a`,
    `-- reward when it is the touching player's current objective, in order.`,
    `local function onObjectiveTouched(player, objectiveIndex)`,
    `\tlocal state = ensureState(player.UserId)`,
    `\tif objectiveIndex ~= state.progress then`,
    `\t\treturn`,
    `\tend`,
    `\tlocal objective = OBJECTIVES[objectiveIndex]`,
    `\tstate.progress = state.progress + 1`,
    `\tstate.currency = state.currency + objective.reward`,
    `\tlocal nextObjective = OBJECTIVES[state.progress]`,
    `\tevent:FireClient(player, {`,
    `\t\tcompleted = objective.name,`,
    `\t\tcompletedCount = objectiveIndex,`,
    `\t\ttotalObjectives = TOTAL_OBJECTIVES,`,
    `\t\tnextObjective = nextObjective and nextObjective.name or "complete",`,
    `\t\tcurrency = state.currency,`,
    `\t})`,
    `end`,
    ``,
    ...objectiveParts,
  ].join("\n");

  const clientCode = [
    `local Players = game:GetService("Players")`,
    `local ReplicatedStorage = game:GetService("ReplicatedStorage")`,
    `local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")`,
    ``,
    `local gui = Instance.new("ScreenGui")`,
    `gui.Name = "GeneratedAdventureHUD"`,
    `gui.ResetOnSpawn = false`,
    `gui.Parent = playerGui`,
    ``,
    `local objective = Instance.new("TextLabel")`,
    `objective.Size = UDim2.fromOffset(420, 56)`,
    `objective.Position = UDim2.fromOffset(24, 24)`,
    `objective.BackgroundColor3 = Color3.fromRGB(20, 25, 35)`,
    `objective.TextColor3 = Color3.new(1, 1, 1)`,
    `objective.TextScaled = true`,
    `objective.Text = ${gameName} .. ": 0/${mechanicNames.length} objectives"`,
    `objective.Parent = gui`,
    ``,
    `ReplicatedStorage:WaitForChild("ObjectiveProgress").OnClientEvent:Connect(function(data)`,
    `\tif typeof(data) ~= "table" then`,
    `\t\treturn`,
    `\tend`,
    `\tobjective.Text = ${gameName} .. ": " .. tostring(data.completed) .. " (" .. tostring(data.completedCount) .. "/" .. tostring(data.totalObjectives) .. ") | Next: " .. tostring(data.nextObjective) .. " | Reward: " .. tostring(data.currency)`,
    `end)`,
  ].join("\n");

  return {
    lua_generator: {
      server: [{ name: "AdventureBootstrap.server.lua", code: serverCode }],
      client: [{ name: "AdventureHUD.client.lua", code: clientCode }],
      shared: [
        {
          name: "GameConfig.lua",
          code: `return { GAME_NAME = ${gameName}, OBJECTIVE_COUNT = ${mechanicNames.length} }`,
        },
      ],
      patterns: [
        "Server-authoritative ordered objectives",
        "Authoritative per-player progress and reward state",
        "Runtime world bootstrap",
        "Client objective/progress/reward HUD",
      ],
    },
  };
}

function safeRepairFallback(
  name: string,
  ctx: FallbackGameplayContext,
  reason: string,
): Record<string, unknown> {
  const fallback = playableFallback(name, ctx);
  const generated = fallback.lua_generator as Record<string, unknown>;
  const patterns = Array.isArray(generated.patterns) ? generated.patterns : [];

  return {
    ...fallback,
    lua_generator: {
      ...generated,
      patterns: [...patterns, "Deterministic validated safe repair"],
      generationMode: "safe_repair",
      repairReason: reason,
    },
  };
}

function isPlayableValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Lua generation is not playable:")
  );
}

const SEMANTIC_FIDELITY_ERROR_PREFIX =
  "Lua generation is not semantically faithful:";

function isSemanticFidelityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(SEMANTIC_FIDELITY_ERROR_PREFIX)
  );
}

/** Either failure class this agent's repair cascade retries on. */
function isRetryableGenerationError(error: unknown): boolean {
  return isPlayableValidationError(error) || isSemanticFidelityError(error);
}

/**
 * GEN-CANONICAL-FIDELITY-2. `assertPlayableLuaScripts` proves a response is
 * *runnable*; nothing proved it was *faithful* to the design. A model could
 * satisfy every structural rule with one generic collectible while the
 * design named several distinct mechanics — playable, but a silent
 * downgrade. This is the narrowest possible check for that gap, scoped to
 * this agent rather than added to `types/playableLua.ts`: it does not touch
 * blueprint schema, world structure, or security, only whether every named
 * mechanic actually appears in what was generated.
 *
 * A no-op when the design named fewer than two mechanics — a single
 * generic objective is not a downgrade when there was nothing to lose.
 * Checked against raw script content, not comment/string-stripped source:
 * a mechanic's evidence here is legitimately a quoted Part name or an
 * `OBJECTIVES` table entry, both of which live inside string literals.
 */
function assertSemanticFidelity(
  scripts: ReadonlyArray<{ readonly content: string }>,
  ctx: FallbackGameplayContext,
): void {
  if (ctx.mechanicNames.length < 2) return;
  const combined = scripts
    .map((script) => script.content)
    .join("\n")
    .toLowerCase();
  const missing = ctx.mechanicNames.filter(
    (mechanicName) => !combined.includes(mechanicName.toLowerCase()),
  );
  if (missing.length > 0) {
    throw new Error(
      `${SEMANTIC_FIDELITY_ERROR_PREFIX} the design named ${ctx.mechanicNames.length} mechanics ` +
        `(${ctx.mechanicNames.join(", ")}), but the generated code has no objective for: ${missing.join(", ")}.`,
    );
  }
}

/**
 * GEN-CANONICAL-FIDELITY-2. Stamps which tier of the repair cascade
 * produced a successful AI response, reusing the exact `generationMode`
 * field `safeRepairFallback` already stamps on its own output — not a new,
 * parallel provenance system. Combined with `AgentResult.usedFallback`
 * (true only for the deterministic tier), downstream evidence can tell
 * primary success, first-repair success, constrained-repair success, and
 * deterministic fallback apart.
 */
function withGenerationMode(
  result: Record<string, unknown>,
  mode: "primary" | "repaired" | "constrained_repair",
): Record<string, unknown> {
  const generated = result.lua_generator;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    return result;
  }
  return {
    ...result,
    lua_generator: {
      ...(generated as Record<string, unknown>),
      generationMode: mode,
    },
  };
}

/**
 * Some local models emit multiline Lua code as JavaScript-style template
 * literals inside an otherwise JSON-shaped response. Normalize only an
 * unambiguous `code` property and leave every other malformed construct
 * untouched so the response still fails closed.
 */
export function normalizeBacktickLuaCode(raw: string): string | null {
  const codeProperty = /"code"\s*:\s*`/g;
  let cursor = 0;
  let normalized = "";
  let replacements = 0;

  for (
    let match = codeProperty.exec(raw);
    match;
    match = codeProperty.exec(raw)
  ) {
    const openingBacktick = codeProperty.lastIndex - 1;
    let closingBacktick = raw.indexOf("`", openingBacktick + 1);

    while (closingBacktick !== -1) {
      const suffix = raw.slice(closingBacktick + 1);
      if (/^\s*[,}]/.test(suffix)) break;
      closingBacktick = raw.indexOf("`", closingBacktick + 1);
    }

    if (closingBacktick === -1) return null;

    normalized += raw.slice(cursor, openingBacktick);
    normalized += JSON.stringify(
      raw.slice(openingBacktick + 1, closingBacktick),
    );
    cursor = closingBacktick + 1;
    replacements += 1;
    codeProperty.lastIndex = cursor;
  }

  if (replacements === 0) return null;
  return normalized + raw.slice(cursor);
}

/**
 * GEN-CANONICAL-FIDELITY-2. Now receives the same `gameplayContext` the
 * primary prompt and the deterministic fallback already use. Previously
 * this prompt was built from only `name`, `description`, `reason` and
 * `spatialDesign` — no mechanic, progression or economy information
 * reached the last AI attempt, so its own instructions asked for a single
 * generic "collectible", and a response satisfying that literally could
 * pass `assertPlayableLuaScripts` while silently discarding everything the
 * design named beyond one mechanic.
 *
 * The single-objective runtime-pattern bullets are kept verbatim when the
 * design named fewer than two mechanics — there is nothing to lose in that
 * case, and the previously-tested exact wording stays exact. With two or
 * more, those bullets switch to the multi-objective, server-authoritative
 * shape, and `buildGameplayDepthInstructions` (the same block the primary
 * prompt uses) is appended so the objective list, ordering, authoritative
 * state and HUD requirements are stated identically everywhere this agent
 * asks a model to generate.
 *
 * Spatial preservation is unchanged: the level section still says "preserve
 * this exactly" and nothing here replaces or removes it.
 */
function buildConstrainedPlayableRepairPrompt(
  name: string,
  description: string,
  reason: string,
  spatialDesign: string,
  gameplayContext: FallbackGameplayContext,
): string {
  // The designed level, carried into the last attempt. Without it this prompt
  // asked for a game with no level, so a response that passed validation was a
  // generic minimal slice with no terrain, spawn or designed geometry — the
  // world silently disappeared on the third try. Same `describeSpatialDesign`
  // text the primary prompt uses; no second spatial representation exists.
  const level = spatialDesign
    ? `
Level to build (preserve this exactly):
${spatialDesign}

World requirements:
- Build the level above. Keep its coordinates, extents, orientations and materials.
- Simplify the code structure, never the world: fewer functions and less abstraction is fine, dropping designed terrain, objects or spawns is not.
- Do not invent replacement coordinates or unrelated world content.
- Do not omit a required spatial element to make validation pass.
- Build terrain with workspace.Terrain:Clear() then :FillBlock(CFrame.new(x,y,z), Vector3.new(sx,sy,sz), Enum.Material.NAME), :FillBall(Vector3.new(x,y,z), radius, Enum.Material.NAME) or :FillCylinder(CFrame.new(x,y,z), height, radius, Enum.Material.NAME).
- Create a SpawnLocation at each stated spawn, and build each object as an anchored Part or Model with its stated Size, CFrame and Material.
- Wire the objective to the objects of type interactive, preserving the original objective.
`
    : "";

  const multiObjective = gameplayContext.mechanicNames.length >= 2;
  const serverObjectivePattern = multiObjective
    ? "- Server: create one distinct, positioned interactable Part per mechanic named below and connect each one's Touched:Connect(function(hit) ... end) to a shared completion handler."
    : "- Server: create a collectible Part in workspace and connect collectible.Touched:Connect(function(hit) ... end).";
  const serverRemotePattern = multiObjective
    ? "- Server: create a RemoteEvent in ReplicatedStorage and call event:FireClient(player, data) with the completed objective's name, completed/total count, the next objective, and the current authoritative reward balance."
    : "- Server: create a RemoteEvent in ReplicatedStorage and call event:FireClient(player, score, target) when the player touches the collectible.";
  const clientUpdatePattern = multiObjective
    ? "- Client: connect event.OnClientEvent:Connect(function(data) ... end) and update the TextLabel with the completed objective, progress count, next objective and reward balance."
    : "- Client: connect event.OnClientEvent:Connect(function(score, target) ... end) and update the TextLabel.";

  return `You are repairing Roblox Luau that failed a strict playability check.
Return one valid JSON object only, with this exact shape:
{ "lua_generator": { "server": [{"name":"Game.server.lua","code":"..."}], "client": [{"name":"HUD.client.lua","code":"..."}], "shared": [] } }

Game: ${name}
Brief: ${description}
Validation failure: ${reason}
${level}

Replace the previous solution completely. Keep the implementation small and use these exact runtime patterns:
- Output exactly one server entry and exactly one client entry. Keep shared empty. Do not split the playable loop across scripts.
- Server: create at least one Folder or Part with Instance.new and parent the generated world to workspace.
${serverObjectivePattern}
${serverRemotePattern}
- Client: local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui").
- Client: local gui = Instance.new("ScreenGui"), then gui.Parent = playerGui.
- Client: create a visible TextLabel and parent it to gui.
${clientUpdatePattern}
- Create the HUD before connecting OnClientEvent so it is visible immediately when Play starts.
- Create every runtime dependency yourself. Do not use require or assume Workspace children already exist.
- Use game:GetService to access services. Never call InsertService or request GamePassService.
- Use only Roblox Luau APIs. Do not use promises, :andThen, DataStoreService, TODOs, placeholders, or client-side FireClient.
- Server and client entries must execute directly and must not return modules.
Return only the JSON object, with complete code strings.${buildGameplayDepthInstructions(gameplayContext)}`;
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

  /**
   * The raw response contract, described completely.
   *
   * This is handed to providers that support constrained decoding, so anything
   * this schema permits is a shape the model can actually emit. An earlier
   * version declared `lua_generator: { type: "object" }`, which permitted any
   * nesting at all: constrained decoding then produced syntactically valid but
   * structurally degenerate output (a lone truncated code string followed by
   * junk keys). Describing the real shape is what closes that.
   *
   * Matches `normalizeLuaScripts`, which accepts each entry as either
   * `{ path, content }` or `{ name, code }`. This pins the `{ name, code }`
   * form because that is what the lua_generator prompt template asks for and
   * a grammar needs one concrete shape — a strict subset of the parser
   * contract, not a second representation. `shared` is genuinely optional and
   * maps to ReplicatedStorage/Shared; the `modules` alias the normalizer also
   * accepts is deliberately not offered, since no prompt requests it.
   */
  public readonly outputSchema: Record<string, unknown> = (() => {
    const scriptEntry = {
      type: "object",
      additionalProperties: false,
      required: ["name", "code"],
      properties: {
        name: { type: "string", minLength: 1 },
        code: { type: "string", minLength: 1 },
      },
    };
    return {
      type: "object",
      additionalProperties: false,
      required: ["lua_generator"],
      properties: {
        lua_generator: {
          type: "object",
          additionalProperties: false,
          required: ["server", "client"],
          properties: {
            server: { type: "array", minItems: 1, items: scriptEntry },
            client: { type: "array", minItems: 1, items: scriptEntry },
            shared: { type: "array", items: scriptEntry },
          },
        },
      },
    };
  })();

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
    // FIRST-PLAYABLE-1 (FP-1C diagnostic). These names come from the
    // architect's own component list, not from Roblox. Presenting them as a
    // bare service list made models call game:GetService on them, so the
    // boundary is stated here rather than left to inference.
    const architectureSummary =
      serviceNames.map((n) => `logical component "${n}"`).join(", ") +
      ". Each is a responsibility implemented inside the generated game code. None of them is a Roblox service: never pass any of these names to game:GetService().";

    const mechanicsArr = (gameplay as any)?.mechanics;
    // SERIALIZATION-001. This is the prompt that generates the Lua, so a
    // mechanic reduced to `[object Object]` here is a system the generated
    // game was asked to implement with no description of it.
    const mechanicsDescription = Array.isArray(mechanicsArr)
      ? summariseForPrompt(mechanicsArr.slice(0, 8), "core systems")
      : "core systems";

    // GEN-CANONICAL-FIDELITY-1. GameDesignerAgent's output — this agent's own
    // `gameplay` input — already carries progression and economy alongside
    // mechanics (`gameplay.progression`, `gameplay.balance.economyOrScoring`).
    // Neither reached this prompt before: only mechanics did, and only the
    // first four of them. Both the prompt and the deterministic fallback below
    // now read all three, the same fields GEN-FIDELITY-1/2 preserved on the
    // legacy generator's blueprint path.
    const mechanicNames = readMechanicNames(mechanicsArr);
    const progression = (gameplay as any)?.progression as
      Record<string, unknown> | undefined;
    const progressionLoop = String(
      progression?.loop ?? "discover → engage → reward → repeat",
    );
    const unlockingSystem = String(
      progression?.unlocking_system ??
        progression?.player_progression_model ??
        "level thresholds",
    );
    const balance = (gameplay as any)?.balance as
      Record<string, unknown> | undefined;
    const economySummary = String(
      balance?.economyOrScoring ?? "points earned from successful interactions",
    );
    const gameplayContext: FallbackGameplayContext = {
      mechanicNames,
      progressionLoop,
      unlockingSystem,
      economySummary,
    };

    const systemsSummary =
      mechanicNames.length > 0
        ? `${mechanicNames.length} ordered gameplay objectives — ${mechanicsDescription}. Progression: ${progressionLoop} via ${unlockingSystem}. Reward economy: ${economySummary}.`
        : `${mechanicsDescription}. Progression: ${progressionLoop} via ${unlockingSystem}. Reward economy: ${economySummary}.`;

    const fallback = playableFallback(name, gameplayContext);

    if (!this.llm) return fallback;

    const codingStandards =
      "PascalCase modules, camelCase functions, server-authoritative, RemoteEvents for client communication";

    // FIRST-PLAYABLE-1 (FP-1B). The level the architect designed, rendered as
    // instructions. Read from the architect's output on the input the executor
    // already accumulated from that dependency — no new plumbing.
    //
    // An absent or unreadable design leaves this empty, and the prompt tells
    // the model to lay out its own small level in that case. That is the
    // pre-FP-1 behaviour, so a stage that answered in the wrong shape degrades
    // to what the platform did before rather than failing the generation.
    const spatialResult = buildSpatialDesign(
      (arch as Record<string, unknown> | undefined)?.spatialDesign ??
        (input.spatialDesign as unknown),
    );
    const spatialDesignText =
      spatialResult.outcome === "designed"
        ? describeSpatialDesign(spatialResult.design)
        : "";

    const registryPrompt = this.buildPrompt({
      name,
      description,
      architecture_summary: architectureSummary,
      systems_summary: systemsSummary,
      coding_standards: codingStandards,
      spatial_design: spatialDesignText,
    });

    const inlinePrompt =
      "You are a Roblox Luau developer. Generate structured module code. " +
      "Respond with a single JSON object:\n" +
      '{ "lua_generator": { "server": Array<{name,code}>, "client": Array<{name,code}>, ' +
      '"shared": Array<{name,code}>, "patterns": string[] } }\n\n' +
      `Game Name: ${name}\nServices: ${architectureSummary}\n` +
      `Game Brief: ${description}\n` +
      `Gameplay Systems: ${systemsSummary}\nCoding Standards: ${codingStandards}\n` +
      (spatialDesignText ? `\nLevel to build:\n${spatialDesignText}\n` : "") +
      "\n" +
      "Generate a playable vertical slice for a blank Baseplate: server code must create visible world parts and connect a Touched, Activated, Triggered, or MouseClick gameplay objective; client code must create a visible ScreenGui under PlayerGui. " +
      (spatialDesignText
        ? "Build exactly the level above using its coordinates, extents and materials. Call workspace.Terrain:Clear() once, then build terrain with workspace.Terrain:FillBlock(CFrame.new(x,y,z), Vector3.new(sx,sy,sz), Enum.Material.NAME), :FillBall(Vector3.new(x,y,z), radius, Enum.Material.NAME) and :FillCylinder(CFrame.new(x,y,z), height, radius, Enum.Material.NAME). Create a SpawnLocation at each stated spawn, and build each object as an anchored Part or Model with its stated Size, CFrame, Material and orientation, parented under a named Folder in workspace. Wire the objective to the objects of type interactive. "
        : "") +
      "Server/client entries are runnable Scripts, not modules, so they must not end with return. Shared entries may return modules. Never use TODOs, placeholders, empty functions, or comments instead of behavior. Return only valid JSON.";

    // GEN-CANONICAL-FIDELITY-1. Appended rather than templated: the registry
    // prompt (`prompt-lua-generator-v1`) and the inline fallback prompt both
    // stay as they are, and this names the concrete, per-request objective
    // list, ordering, and reward/economy model neither of them can — they are
    // static text, this is derived from the actual design.
    const depthInstructions = buildGameplayDepthInstructions(gameplayContext);
    const prompt = (registryPrompt ?? inlinePrompt) + depthInstructions;

    let result: Record<string, unknown>;
    try {
      // A playable slice is a whole server Script plus a whole client
      // LocalScript. At the previous budgets the response was being truncated
      // mid-string, which is unparseable no matter how well-formed the rest is.
      // Scoped to this agent; the generic provider default is unchanged.
      result = await this.generateLua(prompt, {
        temperature: 0.4,
        maxTokens: 6000,
      });
      const scripts = normalizeLuaScripts(result);
      assertPlayableLuaScripts(scripts);
      // GEN-CANONICAL-FIDELITY-2. Playable is not the same claim as
      // faithful: a response can satisfy every structural rule with one
      // generic collectible while the design named several mechanics. A
      // failure here is retried through the same cascade as a playability
      // failure, below.
      assertSemanticFidelity(scripts, gameplayContext);
      result = withGenerationMode(result, "primary");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        result = await this.generateLua(
          `${prompt}\n\nREPAIR REQUIRED: ${reason}. Replace the entire response with complete executable code satisfying every runtime requirement.`,
          { temperature: 0.1, maxTokens: 8000 },
        );
        const scripts = normalizeLuaScripts(result);
        assertPlayableLuaScripts(scripts);
        assertSemanticFidelity(scripts, gameplayContext);
        result = withGenerationMode(result, "repaired");
      } catch (repairError) {
        if (!isRetryableGenerationError(repairError)) throw repairError;
        const repairReason =
          repairError instanceof Error
            ? repairError.message
            : String(repairError);
        try {
          result = await this.generateLua(
            buildConstrainedPlayableRepairPrompt(
              name,
              description,
              repairReason,
              spatialDesignText,
              gameplayContext,
            ),
            { temperature: 0, maxTokens: 8000 },
          );
          const scripts = normalizeLuaScripts(result);
          assertPlayableLuaScripts(scripts);
          assertSemanticFidelity(scripts, gameplayContext);
          result = withGenerationMode(result, "constrained_repair");
        } catch (finalRepairError) {
          if (!isRetryableGenerationError(finalRepairError)) {
            throw finalRepairError;
          }
          const finalReason =
            finalRepairError instanceof Error
              ? finalRepairError.message
              : String(finalRepairError);
          // Deterministic content of this agent's own making, substituted
          // after every AI attempt failed playability or semantic fidelity.
          // It never passed through the parser, so provenance must be
          // declared here or the execution would claim the model authored
          // it. `safeRepairFallback` stamps its own `generationMode:
          // "safe_repair"` and, by construction, names every mechanic the
          // design provided — no separate fidelity check is needed for it.
          this.markDeterministicFallback();
          result = safeRepairFallback(name, gameplayContext, finalReason);
          assertPlayableLuaScripts(normalizeLuaScripts(result));
        }
      }
    }

    return result;
  }

  private async generateLua(
    prompt: string,
    options: { temperature: number; maxTokens: number },
  ): Promise<Record<string, unknown>> {
    if (!this.llm) throw new Error("Lua LLM provider is unavailable");
    const { LLMOutputParser } = await import("../../ai/outputParser");
    // This agent's own declared output contract, handed to the provider so a
    // provider that supports constrained decoding cannot return unparseable
    // JSON. Providers without the capability ignore it, so nothing else about
    // this call changes. Applies to the repair attempts too, since they route
    // through here.
    const raw = await this.llm.generate(prompt, {
      ...options,
      responseSchema: this.outputSchema,
    });
    let parsed = LLMOutputParser.extractJSON(raw);
    if (!parsed) {
      const normalizedBackticks = normalizeBacktickLuaCode(raw);
      if (normalizedBackticks) {
        parsed = LLMOutputParser.extractJSON(normalizedBackticks);
      }
    }
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
