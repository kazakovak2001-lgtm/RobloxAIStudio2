/**
 * ProviderFactory.ts — Creates and configures provider instances.
 */

import { ProviderRegistry } from "./ProviderRegistry";
import { OpenAIProvider } from "./adapters/OpenAIProvider";
import { AnthropicProvider } from "./adapters/AnthropicProvider";
import { GoogleProvider } from "./adapters/GoogleProvider";
import { LocalProvider } from "./adapters/LocalProvider";

export class ProviderFactory {
  /**
   * Create a registry with all default providers.
   */
  static createDefault(): ProviderRegistry {
    const registry = new ProviderRegistry();
    registry.register(new OpenAIProvider());
    registry.register(new AnthropicProvider());
    registry.register(new GoogleProvider());
    registry.register(new LocalProvider());
    return registry;
  }

  /**
   * Create a registry from environment configuration.
   */
  static createFromEnv(): ProviderRegistry {
    const registry = new ProviderRegistry();
    if (process.env.OPENAI_API_KEY) registry.register(new OpenAIProvider());
    if (process.env.ANTHROPIC_API_KEY)
      registry.register(new AnthropicProvider());
    if (process.env.GOOGLE_API_KEY) registry.register(new GoogleProvider());
    if (process.env.OLLAMA_BASE_URL || process.env.LOCAL_MODEL_URL)
      registry.register(new LocalProvider());
    // Always have at least one (local fallback)
    if (registry.size === 0) registry.register(new LocalProvider());
    return registry;
  }
}
