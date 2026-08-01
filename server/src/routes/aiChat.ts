/**
 * AI Chat API — Conversational multi-turn AI with agent delegation.
 * Uses existing LLMProvider + AgentRegistry. No new frameworks.
 */

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { LLMProvider } from "../ai/provider";
import type { AgentRegistry } from "../agents/core/AgentRegistry";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface DetectedIntent {
  agent: string | null;
  confidence: number;
}

function requireAiChatUserSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
  if (!userId) {
    res.status(403).json({
      success: false,
      error: "AI chat user session required",
    });
    return;
  }
  next();
}

export function createAiChatRouter(
  llm: LLMProvider | null,
  agentRegistry?: AgentRegistry,
): Router {
  const router = Router();

  router.post("/chat", requireAiChatUserSession, async (req, res) => {
    const { messages, gameContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: "messages required" });
      return;
    }

    const trimmed: ChatMessage[] = messages.slice(-20);
    const lastUser = [...trimmed].reverse().find((m) => m.role === "user");

    if (!llm) {
      res.json({
        success: true,
        data: {
          role: "assistant",
          content: `I understand: "${(lastUser?.content ?? "").slice(0, 100)}"\n\n**Stub mode** — set OPENAI_API_KEY or ANTHROPIC_API_KEY for real AI.`,
          model: "stub",
        },
      });
      return;
    }

    // Agent delegation via semantic intent classification
    if (agentRegistry && lastUser && llm) {
      console.log("[ai-chat] classifying intent...");
      const intent = await classifyIntent(llm, lastUser.content, trimmed);
      console.log(
        `[ai-chat] intent: agent=${intent.agent}, confidence=${intent.confidence}, msg="${lastUser.content.slice(0, 60)}"`,
      );
      if (intent.agent && intent.confidence >= 70) {
        console.log(`[ai-chat] delegating to: ${intent.agent}`);
        const input = buildAgentInput(intent.agent, trimmed, gameContext);
        const result = await agentRegistry.executeAgent(intent.agent, input);
        if (!("_failed" in result) && !("_skipped" in result)) {
          console.log(`[ai-chat] agent ${intent.agent} OK`);
          res.json({
            success: true,
            data: {
              role: "assistant",
              content: formatAgentResult(intent.agent, result),
              model: `agent:${intent.agent}`,
            },
          });
          return;
        }
        console.log(`[ai-chat] agent failed, fallback to LLM`);
      }
    }

    // Default: LLM conversation with language-aware system prompt
    console.log("[ai-chat] using LLM conversation");
    const parts: string[] = [
      "You are Roblox AI Studio — an expert Roblox game developer AI assistant. " +
        "Help users design, plan, and create Roblox games using Lua/Luau. " +
        "Be practical, use code examples in markdown code blocks. " +
        "IMPORTANT: Always reply in the same language as the user's latest message. " +
        "If the user writes in Czech, answer in Czech. If in English, answer in English. " +
        "If in Russian, answer in Russian. Never switch language unless the user does.",
    ];
    if (gameContext) {
      const ctx: string[] = [];
      if (gameContext.name) ctx.push(`Game: ${gameContext.name}`);
      if (gameContext.genre) ctx.push(`Genre: ${gameContext.genre}`);
      if (ctx.length > 0) parts.push(`\nProject:\n${ctx.join("\n")}`);
    }
    parts.push("\n--- Conversation ---\n");
    for (const msg of trimmed) {
      const p =
        msg.role === "user"
          ? "User"
          : msg.role === "assistant"
            ? "Assistant"
            : "System";
      parts.push(`${p}: ${msg.content}`);
    }
    parts.push("\nAssistant:");

    try {
      const prompt = parts.join("\n");
      console.log(`[ai-chat] LLM prompt length: ${prompt.length} chars`);
      console.log(`[ai-chat] LLM provider: ${llm.name}`);
      console.log("[ai-chat] calling llm.generate()...");
      const response = await llm.generate(prompt, {
        temperature: 0.7,
        maxTokens: 2048,
      });
      console.log(`[ai-chat] LLM response length: ${response?.length ?? 0}`);
      res.json({
        success: true,
        data: { role: "assistant", content: response, model: llm.name },
      });
    } catch (err) {
      console.error("[ai-chat] LLM EXCEPTION:", err);
      console.error(
        "[ai-chat] Stack:",
        err instanceof Error ? err.stack : "no stack",
      );
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "LLM failed",
      });
    }
  });

  return router;
}

// ─── Semantic Intent Classification ─────────────────────────────────────────

const VALID_AGENTS = [
  "game_designer",
  "lua_generator",
  "roblox_architect",
  "ui_generator",
  "none",
] as const;

/**
 * Use the LLM to classify user intent into an agent or "none".
 * Replaces keyword-based matching with semantic understanding.
 */
async function classifyIntent(
  llm: LLMProvider,
  message: string,
  messages: ChatMessage[],
): Promise<DetectedIntent> {
  const recentContext = messages
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
    .join("\n");

  const prompt =
    "Classify the user's intent into exactly one category. " +
    "Respond with ONLY the category name, nothing else.\n\n" +
    "Categories:\n" +
    "- game_designer: design mechanics, add features, create/modify game concept, add systems (crafting, inventory, combat, quests, economy, multiplayer)\n" +
    "- lua_generator: generate actual Lua/Luau code or scripts\n" +
    "- roblox_architect: project structure, folder organization, architecture, data models\n" +
    "- ui_generator: UI, HUD, menus, screen layouts, GUI elements\n" +
    "- none: general question, conversation, advice, or doesn't fit above\n\n" +
    `Recent context:\n${recentContext}\n\n` +
    `User message: "${message}"\n\nCategory:`;

  try {
    const response = await llm.generate(prompt, {
      temperature: 0.1,
      maxTokens: 20,
    });
    const cleaned = response
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");
    const matched = VALID_AGENTS.find((a) => cleaned.includes(a));

    if (matched && matched !== "none") {
      return { agent: matched, confidence: 85 };
    }
    return { agent: null, confidence: 0 };
  } catch {
    return { agent: null, confidence: 0 };
  }
}

// ─── Agent Input Builder ────────────────────────────────────────────────────

function buildAgentInput(
  agent: string,
  messages: ChatMessage[],
  gameContext?: Record<string, unknown>,
): Record<string, unknown> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const description = lastUser?.content ?? "";
  const name = gameContext?.name ?? extractGameName(messages);
  const genre = gameContext?.genre ?? "adventure";

  const blueprint = { name, genre, game_type: genre, description };

  switch (agent) {
    case "game_designer":
      return {
        blueprint,
        gameDesignSeed: {
          coreLoop: "explore → engage → reward",
          theme: genre,
          mechanics: extractMechanics(description),
        },
      };
    case "requirements":
      return { blueprint };
    case "roblox_architect":
      return {
        blueprint,
        gameplay: {
          mechanics: extractMechanics(description).map((m) => ({
            name: m,
            description: m,
          })),
        },
      };
    case "lua_generator":
      return { blueprint, architecture: {}, gameplay: {} };
    case "ui_generator":
      return {
        blueprint,
        gameplay: {
          mechanics: extractMechanics(description).map((m) => ({
            name: m,
            description: m,
          })),
        },
      };
    default:
      return { blueprint };
  }
}

function extractGameName(messages: ChatMessage[]): string {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const match = msg.content.match(
      /(?:create|make|build|design)\s+(?:a\s+)?(?:roblox\s+)?(.+?)(?:\s+game|\s+simulator|\s+experience|$)/i,
    );
    if (match) return match[1].trim();
  }
  return "Unnamed Game";
}

function extractMechanics(text: string): string[] {
  const keywords = [
    "movement",
    "combat",
    "inventory",
    "trading",
    "mining",
    "racing",
    "building",
    "crafting",
    "multiplayer",
    "progression",
    "rebirth",
    "pets",
    "collection",
    "exploration",
    "parkour",
  ];
  return keywords.filter((k) => text.toLowerCase().includes(k));
}

// ─── Result Formatter ───────────────────────────────────────────────────────

function formatAgentResult(
  agent: string,
  result: Record<string, unknown>,
): string {
  switch (agent) {
    case "game_designer":
      return formatGameDesign(result);
    case "lua_generator":
      return formatLuaCode(result);
    case "roblox_architect":
      return formatArchitecture(result);
    case "ui_generator":
      return formatUI(result);
    default:
      return JSON.stringify(result, null, 2).slice(0, 2000);
  }
}

function formatGameDesign(result: Record<string, unknown>): string {
  const gp = result.gameplay as Record<string, unknown> | undefined;
  const lines: string[] = ["**Game Design Generated** 🎮\n"];
  if (gp?.mechanics && Array.isArray(gp.mechanics)) {
    lines.push("**Mechanics:**");
    for (const m of (gp.mechanics as Array<Record<string, string>>).slice(
      0,
      6,
    )) {
      lines.push(`- **${m.name}**: ${m.description}`);
    }
  }
  if (gp?.progression)
    lines.push(
      `\n**Progression:** ${JSON.stringify((gp.progression as Record<string, unknown>).loop ?? gp.progression)}`,
    );
  const loop = result.loop as string | undefined;
  if (loop) lines.push(`\n**Core Loop:** ${loop}`);
  return lines.join("\n");
}

function formatLuaCode(result: Record<string, unknown>): string {
  const gen = result.lua_generator as Record<string, unknown> | undefined;
  if (!gen) return "Code generation completed (no scripts produced).";
  const lines: string[] = ["**Lua Scripts Generated** 📝\n"];
  const server = gen.server as Array<Record<string, string>> | undefined;
  const client = gen.client as Array<Record<string, string>> | undefined;
  if (server) {
    for (const s of server.slice(0, 3)) {
      lines.push(`**${s.name}**`);
      lines.push("```lua");
      lines.push(s.code.slice(0, 600));
      lines.push("```\n");
    }
  }
  if (client) {
    for (const c of client.slice(0, 2)) {
      lines.push(`**${c.name}**`);
      lines.push("```lua");
      lines.push(c.code.slice(0, 600));
      lines.push("```\n");
    }
  }
  return lines.join("\n");
}

function formatArchitecture(result: Record<string, unknown>): string {
  const arch = result.architecture as Record<string, unknown> | undefined;
  if (!arch) return "Architecture analysis complete.";
  const lines: string[] = ["**Architecture Design** 🏗️\n"];
  if (arch.folderStructure) {
    lines.push("**Folder Structure:**");
    for (const [folder, contents] of Object.entries(
      arch.folderStructure as Record<string, unknown>,
    )) {
      lines.push(
        `- \`${folder}/\` → ${Array.isArray(contents) ? contents.join(", ") : String(contents)}`,
      );
    }
  }
  if (arch.services) {
    lines.push("\n**Services:**");
    for (const [svc, desc] of Object.entries(
      arch.services as Record<string, string>,
    )) {
      lines.push(`- **${svc}**: ${desc}`);
    }
  }
  return lines.join("\n");
}

function formatUI(result: Record<string, unknown>): string {
  const lines: string[] = ["**UI Design Generated** 🖥️\n"];
  const ui = result.ui_generator as Record<string, unknown> | undefined;
  if (ui) lines.push(JSON.stringify(ui, null, 2).slice(0, 1500));
  else lines.push("UI layout generated successfully.");
  return lines.join("\n");
}
