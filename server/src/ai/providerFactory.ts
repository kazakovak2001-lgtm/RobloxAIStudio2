import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "../providers/openai";
import { AnthropicProvider } from "../providers/anthropic";
import { GeminiProvider } from "../providers/gemini";
import { OpenRouterProvider } from "../providers/openrouter";
import { OllamaProvider } from "../providers/ollama";
import { GroqProvider } from "../providers/groq";

export type ProviderMode =
  "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "groq" | "none";

export interface ProviderFactoryResult {
  provider: LLMProvider | null;
  mode: ProviderMode;
  model: string;
  info: string;
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
      return this.createByName(explicitProvider as ProviderMode, defaultModel);
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
        };
      }
    }
    return {
      provider: null,
      mode: "none",
      model: "",
      info: `Provider '${name}' requested but no API key found — falling back to stub mode.`,
    };
  }
}
