import type { LLMProvider } from "../types/llm";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";
import { OllamaProvider } from "./ollama";
import { GroqProvider } from "./groq";

export type ProviderMode =
  "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "groq" | "none";

export interface ProviderFactoryResult {
  provider: LLMProvider | null;
  mode: ProviderMode;
  model: string;
  info: string;
  /**
   * The provider the operator explicitly requested through DEFAULT_PROVIDER,
   * when one was requested. Present even if it could not be constructed.
   */
  requested?: ProviderMode;
  /**
   * True when an explicitly requested provider could not be constructed and
   * the process therefore has no LLM. This is what separates "the operator
   * asked for AI and did not get it" from "no provider was configured".
   * Never let this state be reported as a successful AI generation.
   */
  unsatisfied?: boolean;
  /** Why the requested provider could not be constructed. */
  unsatisfiedReason?: string;
}

/** Default localhost endpoint used when Ollama is requested without a URL. */
const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";

/**
 * Request timeout for Ollama, in milliseconds.
 *
 * Local models generate far more slowly than hosted ones, and a single
 * completion can legitimately outlast the provider's own default. This is
 * scoped to Ollama on purpose: no other provider's timeout is changed, and an
 * unset or unusable value falls through to the provider default rather than
 * silently disabling the deadline.
 */
function resolveOllamaTimeout(): number | undefined {
  const raw = process.env.OLLAMA_TIMEOUT_MS?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Every provider name DEFAULT_PROVIDER accepts, excluding the "none" stub. */
const KNOWN_PROVIDER_MODES = new Set<ProviderMode>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "ollama",
  "groq",
]);

/** Keeps the runtime membership check and the compile-time type in sync. */
function isKnownProviderMode(value: string): value is ProviderMode {
  return (KNOWN_PROVIDER_MODES as ReadonlySet<string>).has(value);
}

/**
 * Normalized provider response for cost tracking and observability.
 */
export interface ProviderResponse {
  text: string;
  json?: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  latencyMs: number;
  provider: string;
  model: string;
  finishReason: string;
}

/**
 * Estimated cost per 1K tokens (USD) for common models.
 */
const COST_PER_1K: Record<string, number> = {
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gpt-4": 0.03,
  "claude-sonnet-4-20250514": 0.003,
  "claude-3-haiku-20240307": 0.00025,
  "gemini-2.5-flash": 0.00015,
  "gemini-1.5-pro": 0.00125,
  "llama3-8b-8192": 0.00005,
  "llama3-70b-8192": 0.00059,
  default: 0.001,
};

/**
 * Public-safe summary of how AI is (or is not) configured.
 *
 * Deliberately carries only the provider name, model name and whether an
 * explicit request went unsatisfied. It never carries API keys, endpoint
 * URLs, or prompt content, so it is safe on unauthenticated health output.
 */
export interface AiModeSummary {
  /** "stub" whenever no provider is available, otherwise the provider name. */
  llm: string;
  /** Model name, when a provider resolved. */
  model?: string;
  /** Provider explicitly requested through DEFAULT_PROVIDER, if any. */
  requested?: string;
  /** True when a requested provider could not be constructed. */
  unsatisfied?: boolean;
}

/**
 * Whether startup must be refused because no LLM resolved.
 *
 * Gated on the absence of a provider, not on `unsatisfied`. An empty
 * configuration produces `mode: "none"` with `unsatisfied` unset, and that is
 * exactly the case an operator setting REQUIRE_LLM_PROVIDER wants caught: a
 * release image that lost its provider configuration would otherwise start
 * normally and serve deterministic fallback content.
 */
export function shouldRefuseStartupWithoutProvider(
  result: ProviderFactoryResult,
  requireProvider: string | undefined,
): boolean {
  return result.provider === null && requireProvider === "true";
}

export function describeAiMode(result: ProviderFactoryResult): AiModeSummary {
  const summary: AiModeSummary = {
    llm: result.mode === "none" ? "stub" : result.mode,
  };
  if (result.model) summary.model = result.model;
  if (result.requested) summary.requested = result.requested;
  if (result.unsatisfied) summary.unsatisfied = true;
  return summary;
}

export function estimateCost(model: string, totalTokens: number): number {
  const rate = COST_PER_1K[model] ?? COST_PER_1K.default;
  return Math.round(rate * (totalTokens / 1000) * 100000) / 100000;
}

/**
 * LLMProviderFactory — reads environment variables and instantiates the correct LLMProvider.
 *
 * Priority order:
 *   DEFAULT_PROVIDER (explicit override)
 *   1. OPENAI_API_KEY      → OpenAI
 *   2. ANTHROPIC_API_KEY   → Anthropic Claude
 *   3. GEMINI_API_KEY      → Google Gemini
 *   4. OPENROUTER_API_KEY  → OpenRouter (multi-model)
 *   5. GROQ_API_KEY        → Groq (fast inference)
 *   6. OLLAMA_URL          → Remote Ollama
 *   7. OLLAMA_LOCAL=true   → Ollama localhost
 *   8. (none)              → Stub mode
 */
export class LLMProviderFactory {
  static create(): ProviderFactoryResult {
    const explicitProvider = process.env.DEFAULT_PROVIDER?.toLowerCase().trim();
    const defaultModel = process.env.DEFAULT_MODEL?.trim();

    // Override: force specific provider
    if (explicitProvider && explicitProvider !== "none") {
      if (!isKnownProviderMode(explicitProvider)) {
        const reason = `unknown provider name — expected one of ${[...KNOWN_PROVIDER_MODES].join(", ")}`;
        return {
          provider: null,
          mode: "none",
          model: "",
          info: `DEFAULT_PROVIDER '${explicitProvider}' is not a supported provider (${reason}) — no LLM is available.`,
          unsatisfied: true,
          unsatisfiedReason: reason,
        };
      }
      return this.createByName(explicitProvider, defaultModel);
    }

    // 1. OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey?.trim()) {
      const model = defaultModel ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      return {
        provider: new OpenAIProvider({
          apiKey: openaiKey.trim(),
          baseURL: process.env.OPENAI_BASE_URL?.trim(),
          model,
        }),
        mode: "openai",
        model,
        info: `OpenAI (model: ${model})`,
      };
    }

    // 2. Anthropic
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey?.trim()) {
      const model =
        defaultModel ??
        process.env.ANTHROPIC_MODEL ??
        "claude-sonnet-4-20250514";
      return {
        provider: new AnthropicProvider({ apiKey: anthropicKey.trim(), model }),
        mode: "anthropic",
        model,
        info: `Anthropic (model: ${model})`,
      };
    }

    // 3. Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey?.trim()) {
      const model =
        defaultModel ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
      return {
        provider: new GeminiProvider({ apiKey: geminiKey.trim(), model }),
        mode: "gemini",
        model,
        info: `Gemini (model: ${model})`,
      };
    }

    // 4. OpenRouter
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey?.trim()) {
      const model =
        defaultModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
      return {
        provider: new OpenRouterProvider({
          apiKey: openrouterKey.trim(),
          model,
        }),
        mode: "openrouter",
        model,
        info: `OpenRouter (model: ${model})`,
      };
    }

    // 5. Groq
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey?.trim()) {
      const model = defaultModel ?? process.env.GROQ_MODEL ?? "llama3-8b-8192";
      return {
        provider: new GroqProvider({ apiKey: groqKey.trim(), model }),
        mode: "groq",
        model,
        info: `Groq (model: ${model})`,
      };
    }

    // 6. Ollama (remote)
    const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
    const ollamaModel = defaultModel ?? process.env.OLLAMA_MODEL ?? "llama3";
    if (ollamaUrl?.trim()) {
      return {
        provider: new OllamaProvider({
          baseURL: ollamaUrl.trim(),
          model: ollamaModel,
          timeout: resolveOllamaTimeout(),
        }),
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama (url: ${ollamaUrl}, model: ${ollamaModel})`,
      };
    }

    // 7. Ollama (localhost)
    if (process.env.OLLAMA_LOCAL === "true") {
      const localUrl = "http://127.0.0.1:11434";
      return {
        provider: new OllamaProvider({
          baseURL: localUrl,
          model: ollamaModel,
          timeout: resolveOllamaTimeout(),
        }),
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama (localhost, model: ${ollamaModel})`,
      };
    }

    // 8. No provider — stub mode
    return {
      provider: null,
      mode: "none",
      model: "",
      info: "No LLM provider configured — agents running in stub mode. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or OLLAMA_URL to activate.",
    };
  }

  private static createByName(
    name: ProviderMode,
    model?: string,
  ): ProviderFactoryResult {
    let reason = `no API key found for provider '${name}'`;

    switch (name) {
      case "openai": {
        const key = process.env.OPENAI_API_KEY;
        if (!key) break;
        const m = model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
        return {
          provider: new OpenAIProvider({ apiKey: key.trim(), model: m }),
          mode: "openai",
          model: m,
          info: `OpenAI (forced, model: ${m})`,
          requested: name,
        };
      }
      case "anthropic": {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) break;
        const m = model ?? "claude-sonnet-4-20250514";
        return {
          provider: new AnthropicProvider({ apiKey: key.trim(), model: m }),
          mode: "anthropic",
          model: m,
          info: `Anthropic (forced, model: ${m})`,
          requested: name,
        };
      }
      case "gemini": {
        const key = process.env.GEMINI_API_KEY;
        if (!key) break;
        const m = model ?? "gemini-2.5-flash";
        return {
          provider: new GeminiProvider({ apiKey: key.trim(), model: m }),
          mode: "gemini",
          model: m,
          info: `Gemini (forced, model: ${m})`,
          requested: name,
        };
      }
      case "groq": {
        const key = process.env.GROQ_API_KEY;
        if (!key) break;
        const m = model ?? "llama3-8b-8192";
        return {
          provider: new GroqProvider({ apiKey: key.trim(), model: m }),
          mode: "groq",
          model: m,
          info: `Groq (forced, model: ${m})`,
          requested: name,
        };
      }
      case "openrouter": {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key?.trim()) break;
        const m = model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
        return {
          provider: new OpenRouterProvider({ apiKey: key.trim(), model: m }),
          mode: "openrouter",
          model: m,
          info: `OpenRouter (forced, model: ${m})`,
          requested: name,
        };
      }
      case "ollama": {
        // Ollama is keyless. An explicit request resolves to the configured
        // endpoint, or the provider's own localhost default.
        const url =
          process.env.OLLAMA_URL?.trim() ||
          process.env.OLLAMA_BASE_URL?.trim() ||
          OLLAMA_DEFAULT_URL;
        const m = model ?? process.env.OLLAMA_MODEL?.trim();
        if (!m) {
          reason =
            "Ollama requires an explicit model — set OLLAMA_MODEL or DEFAULT_MODEL";
          break;
        }
        return {
          provider: new OllamaProvider({
            baseURL: url,
            model: m,
            timeout: resolveOllamaTimeout(),
          }),
          mode: "ollama",
          model: m,
          info: `Ollama (forced, url: ${url}, model: ${m})`,
          requested: name,
        };
      }
      case "none":
        return {
          provider: null,
          mode: "none",
          model: "",
          info: "No LLM provider requested — agents running in stub mode.",
          requested: name,
        };
    }

    return {
      provider: null,
      mode: "none",
      model: "",
      info: `Provider '${name}' was explicitly requested but could not be constructed (${reason}) — no LLM is available.`,
      requested: name,
      unsatisfied: true,
      unsatisfiedReason: reason,
    };
  }
}
