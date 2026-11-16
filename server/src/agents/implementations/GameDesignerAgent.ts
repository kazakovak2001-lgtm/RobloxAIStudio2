import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import { describeDesignInputs } from "../../types/projectDesignInputs";
import type { AgentInput, GameDesignSeed } from "../../types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readMechanicName(value: unknown): string | undefined {
  if (typeof value === "string") {
    const name = value.trim();
    return name.length > 0 ? name : undefined;
  }
  const mechanic = asRecord(value);
  const candidate = mechanic?.name ?? mechanic?.title;
  if (typeof candidate !== "string") return undefined;
  const name = candidate.trim();
  return name.length > 0 ? name : undefined;
}

export function readBlueprintMechanicNames(
  blueprint: Record<string, unknown> | undefined,
): string[] {
  const gameplay = asRecord(blueprint?.gameplay);
  if (!Array.isArray(gameplay?.mechanics)) return [];
  return gameplay.mechanics
    .map(readMechanicName)
    .filter((name): name is string => name !== undefined);
}

/**
 * Optional design sections requested from the model in addition to the
 * original contract. Additive: absent from the deterministic fallback, because
 * inventing NPCs or quests the user never asked for would present canned
 * content as design.
 */
export const DESIGN_EXTENSION_INSTRUCTION =
  "\n\nAlso include these OPTIONAL top-level keys in the same JSON object, " +
  "only where they fit the game and never contradicting the user's brief:\n" +
  '- "overview": string (2-4 sentences describing the game)\n' +
  '- "npcs": [{ "name": string, "role": string, "description": string }] (omit when the game has no NPCs)\n' +
  '- "quests": [{ "name": string, "objective": string, "reward": string }] (omit when the game has no quests)\n';

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, max) : undefined;
}

function cleanEntries(
  value: unknown,
  keys: readonly string[],
  limit = 20,
): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: Array<Record<string, string>> = [];
  for (const raw of value.slice(0, limit)) {
    const record = asRecord(raw);
    const name = cleanText(record?.name, 120);
    if (!record || !name) continue;
    const entry: Record<string, string> = { name };
    for (const key of keys) {
      const text = cleanText(record[key], 600);
      if (text) entry[key] = text;
    }
    entries.push(entry);
  }
  return entries.length > 0 ? entries : undefined;
}

/**
 * Keep only well-formed optional design sections from model output. Malformed
 * or empty ones are dropped, never replaced with invented content.
 */
export function normalizeDesignExtensions(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const { overview, npcs, quests, ...rest } = data;
  const result: Record<string, unknown> = { ...rest };
  const cleanOverview = cleanText(overview, 1500);
  if (cleanOverview) result.overview = cleanOverview;
  const cleanNpcs = cleanEntries(npcs, ["role", "description"]);
  if (cleanNpcs) result.npcs = cleanNpcs;
  const cleanQuests = cleanEntries(quests, ["objective", "reward"]);
  if (cleanQuests) result.quests = cleanQuests;
  return result;
}

export class GameDesignerAgent extends BaseAgent {
  public readonly name = "GameDesigner";
  public readonly description =
    "Designs game mechanics, systems, and gameplay loop";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      requirements: { type: "object" },
      plan: { type: "object" },
      blueprint: { type: "object" },
      gameDesignSeed: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      gameplay: { type: "object" },
      loop: { type: "string" },
      winCondition: { type: "string" },
      loseCondition: { type: "string" },
      progressionModel: { type: "string" },
      interactionSystems: { type: "array" },
      economyOrScoring: { type: "string" },
      overview: { type: "string" },
      npcs: { type: "array" },
      quests: { type: "array" },
    },
    required: ["gameplay"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const seed = input.gameDesignSeed as GameDesignSeed | undefined;

    const name = String(bp?.name ?? "Unnamed Game");
    const genre = Array.isArray(bp?.genre)
      ? (bp.genre as string[]).join(", ")
      : String(bp?.genre ?? "Adventure");
    const coreLoop = seed?.coreLoop ?? "explore → engage → reward";
    const theme = seed?.theme ?? "fantasy";
    const blueprintMechanics = readBlueprintMechanicNames(bp);
    const designMechanics =
      blueprintMechanics.length > 0
        ? blueprintMechanics
        : (seed?.mechanics ?? ["exploration", "combat", "progression"]);
    const mechanics = designMechanics.join(", ");
    const innovations = seed?.innovationModifiers?.join("; ") ?? "";

    const fallback: Record<string, unknown> = {
      gameplay: {
        mechanics: designMechanics.map((m: string) => ({
          name: m,
          description: `Core mechanic: ${m}`,
          parameters: {},
        })),
        progression: {
          loop: coreLoop,
          player_progression_model:
            "Milestone-based unlocking with escalating difficulty",
          unlocking_system: "Level thresholds",
        },
        balance: {
          winCondition: "Complete the core loop objective",
          loseCondition: "Fail to maintain the progression constraints",
          interactionSystems: designMechanics.slice(0, 5),
          economyOrScoring: "Points earned from successful interactions",
          theme,
        },
      },
      loop: coreLoop,
      winCondition: "Complete the core loop objective",
      loseCondition: "Fail to maintain the progression constraints",
      progressionModel: "Milestone-based unlocking with escalating difficulty",
      interactionSystems: designMechanics.slice(0, 5),
      economyOrScoring: "Points earned from successful interactions",
    };

    if (!this.llm) return fallback;

    const promptVars = {
      name,
      genre,
      core_loop: coreLoop,
      theme,
      mechanics,
      innovation_modifiers: innovations,
    };
    const registryPrompt = this.buildPrompt(promptVars);

    const inlinePrompt =
      "You are a Roblox game designer. Design detailed gameplay systems.\n" +
      "RULES:\n" +
      "- Return ONLY a valid JSON object. No markdown, no explanation, no code fences.\n" +
      "- Use exactly this schema:\n" +
      '{ "gameplay": { "mechanics": [{name,description,parameters}], ' +
      '"progression": {loop,player_progression_model,unlocking_system}, ' +
      '"balance": {winCondition,loseCondition,interactionSystems,economyOrScoring,theme} }, ' +
      '"loop": string, "winCondition": string, "loseCondition": string, ' +
      '"progressionModel": string, "interactionSystems": string[], "economyOrScoring": string }\n' +
      '- The root key MUST be "gameplay" (not gameplaySystems or gameDesign).\n\n' +
      `Game Name: ${name}\nGenre: ${genre}\nCore Loop: ${coreLoop}\nTheme: ${theme}\n` +
      `Mechanics: ${mechanics}\n` +
      (innovations ? `Innovation modifiers: ${innovations}\n` : "") +
      "\nReturn only valid JSON.";

    const prompt =
      (registryPrompt ?? inlinePrompt) +
      describeDesignInputs(bp) +
      DESIGN_EXTENSION_INSTRUCTION;

    const generated = await this.generateWithRetry(
      prompt,
      ["gameplay"],
      fallback,
      {
        temperature: 0.5,
        maxTokens: 1800,
        system: this.systemPromptFor(promptVars) ?? undefined,
      },
    );
    return normalizeDesignExtensions(generated);
  }
}
