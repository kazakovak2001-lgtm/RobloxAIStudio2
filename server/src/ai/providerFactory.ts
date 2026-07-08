import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "../providers/openai";
import { AnthropicProvider } from "../providers/anthropic";
import { GeminiProvider } from "../providers/gemini";
import { OpenRouterProvider } from "../providers/openrouter";
import { OllamaProvider } from "../providers/ollama";

export type ProviderMode =
  "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "none";

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
 *   1. OPENAI_API_KEY      → OpenAI
 *   2. ANTHROPIC_API_KEY   → Anthropic Claude
 *   3. GEMINI_API_KEY      → Google Gemini
 *   4. OPENROUTER_API_KEY  → OpenRouter (multi-model)
 *   5. OLLAMA_URL          → Remote Ollama
 *   6. OLLAMA_LOCAL=true   → Ollama localhost
 *   7. (none)              → Agents run in stub mode
 *
 * Environment variables:
 *   OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
 *   GEMINI_API_KEY, GEMINI_MODEL
 *   OPENROUTER_API_KEY, OPENROUTER_MODEL
 *   OLLAMA_URL, OLLAMA_MODEL, OLLAMA_LOCAL
 */
export class LLMProviderFactory {
  static create(): ProviderFactoryResult {
    // 1. OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey?.trim()) {
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const provider = new OpenAIProvider({
        apiKey: openaiKey.trim(),
        baseURL: process.env.OPENAI_BASE_URL?.trim(),
        model,
      });
      return {
        provider,
        mode: "openai",
        model,
        info: `OpenAI (model: ${model})`,
      };
    }

    // 2. Anthropic
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey?.trim()) {
      const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
      const provider = new AnthropicProvider({
        apiKey: anthropicKey.trim(),
        model,
      });
      return {
        provider,
        mode: "anthropic",
        model,
        info: `Anthropic (model: ${model})`,
      };
    }

    // 3. Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey?.trim()) {
      const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
      const provider = new GeminiProvider({ apiKey: geminiKey.trim(), model });
      return {
        provider,
        mode: "gemini",
        model,
        info: `Gemini (model: ${model})`,
      };
    }

    // 4. OpenRouter
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey?.trim()) {
      const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
      const provider = new OpenRouterProvider({
        apiKey: openrouterKey.trim(),
        model,
      });
      return {
        provider,
        mode: "openrouter",
        model,
        info: `OpenRouter (model: ${model})`,
      };
    }

    // 5. Ollama (remote)
    const ollamaUrl = process.env.OLLAMA_URL;
    const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3";
    if (ollamaUrl?.trim()) {
      const provider = new OllamaProvider({ baseURL: ollamaUrl.trim() });
      return {
        provider,
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama (url: ${ollamaUrl}, model: ${ollamaModel})`,
      };
    }

    // 6. Ollama (localhost)
    if (process.env.OLLAMA_LOCAL === "true") {
      const provider = new OllamaProvider({
        baseURL: "http://localhost:11434",
      });
      return {
        provider,
        mode: "ollama",
        model: ollamaModel,
        info: `Ollama (localhost, model: ${ollamaModel})`,
      };
    }

    // 7. No provider
    return {
      provider: null,
      mode: "none",
      model: "",
      info: "No LLM provider configured — agents running in stub mode. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or OLLAMA_URL to activate.",
    };
  }
}
