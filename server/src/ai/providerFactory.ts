import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "../providers/openai";
import { AnthropicProvider } from "../providers/anthropic";
import { OllamaProvider } from "../providers/ollama";

export type ProviderMode = "openai" | "anthropic" | "ollama" | "none";

export interface ProviderFactoryResult {
  provider: LLMProvider | null;
  mode: ProviderMode;
  model: string;
  info: string;
}

/**
 * LLMProviderFactory
 *
 * Reads environment variables and instantiates the correct LLMProvider.
 *
 * Priority order:
 *   1. OPENAI_API_KEY   → OpenAI-compatible (also covers Azure via OPENAI_BASE_URL)
 *   2. ANTHROPIC_API_KEY → Anthropic Claude
 *   3. OLLAMA_URL        → Remote Ollama instance
 *   4. OLLAMA_LOCAL=true → Ollama on localhost:11434
 *   5. (none)            → Agents run in stub mode; pipeline still executes
 *
 * All config is read from process.env — no hardcoded keys.
 *
 * Environment variables:
 *   OPENAI_API_KEY     — OpenAI secret key
 *   OPENAI_BASE_URL    — Optional base URL override (Azure, proxies)
 *   OPENAI_MODEL       — Model name (default: gpt-4o-mini)
 *   ANTHROPIC_API_KEY  — Anthropic secret key
 *   ANTHROPIC_MODEL    — Model name (default: claude-3-5-sonnet-20241022)
 *   OLLAMA_URL         — Remote Ollama base URL
 *   OLLAMA_MODEL       — Model name (default: llama3)
 *   OLLAMA_LOCAL       — "true" to use localhost:11434
 */
export class LLMProviderFactory {
  static create(): ProviderFactoryResult {
    // ── 1. OpenAI ──────────────────────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL;
    const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    if (openaiKey && openaiKey.trim().length > 0) {
      const provider = new OpenAIProvider({
        apiKey: openaiKey.trim(),
        baseURL: openaiBaseUrl?.trim(),
      });
      return {
        provider,
        mode: "openai",
        model: openaiModel,
        info: `OpenAI provider (model: ${openaiModel}${openaiBaseUrl ? `, base: ${openaiBaseUrl}` : ""})`,
      };
    }

    // ── 2. Anthropic ───────────────────────────────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel =
      process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

    if (anthropicKey && anthropicKey.trim().length > 0) {
      const provider = new AnthropicProvider({ apiKey: anthropicKey.trim() });
      return {
        provider,
        mode: "anthropic",
        model: anthropicModel,
        info: `Anthropic provider (model: ${anthropicModel})`,
      };
    }

    // ── 3. Ollama (remote URL) ─────────────────────────────────────────────
    const ollamaUrl = process.env.OLLAMA_URL;
    const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3";

    if (ollamaUrl && ollamaUrl.trim().length > 0) {
      const provider = new OllamaProvider({ baseURL: ollamaUrl.trim() });
      return {
        provider,
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama provider (url: ${ollamaUrl}, model: ${ollamaModel})`,
      };
    }

    // ── 4. Ollama (localhost) ──────────────────────────────────────────────
    if (process.env.OLLAMA_LOCAL === "true") {
      const provider = new OllamaProvider({
        baseURL: "http://localhost:11434",
      });
      return {
        provider,
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama provider (localhost:11434, model: ${ollamaModel})`,
      };
    }

    // ── 5. No provider ─────────────────────────────────────────────────────
    return {
      provider: null,
      mode: "none",
      model: "",
      info:
        "No LLM provider configured — agents running in stub mode. " +
        "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_URL to activate.",
    };
  }
}
