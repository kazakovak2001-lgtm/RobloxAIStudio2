import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "../providers/openai";
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
 * Priority order:
 *   1. OPENAI_API_KEY  → OpenAI-compatible (also covers Azure, etc. via OPENAI_BASE_URL)
 *   2. OLLAMA_URL      → Local Ollama instance
 *   3. (none)          → Agents run in stub mode, pipeline still executes
 *
 * All config is read from process.env — no hardcoded keys.
 */
export class LLMProviderFactory {
  static create(): ProviderFactoryResult {
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

    // Default Ollama on localhost — only used if port is reachable,
    // but we instantiate it anyway; the provider handles connection errors gracefully.
    const localOllama = process.env.OLLAMA_LOCAL === "true";
    if (localOllama) {
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

    return {
      provider: null,
      mode: "none",
      model: "",
      info: "No LLM provider configured — agents running in stub mode. Set OPENAI_API_KEY or OLLAMA_URL.",
    };
  }
}
