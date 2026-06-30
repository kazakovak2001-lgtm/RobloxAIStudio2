import type { LLMProvider } from "./provider";
import type { AIRoutingRule } from "../types/ai";

/**
 * AIRouter
 *
 * Selects the appropriate LLMProvider for a given agent type based on
 * configurable routing rules. Falls back to the default provider when
 * no matching rule is found.
 *
 * This is the interface boundary for future multi-provider wiring (v0.3).
 * Current agents call `this.llm.generate()` — the router determines which
 * concrete LLMProvider backs that call.
 */
export class AIRouter {
  private providers = new Map<string, LLMProvider>();
  private rules: AIRoutingRule[] = [];
  private defaultProvider?: LLMProvider;

  /**
   * Register a named provider instance.
   */
  registerProvider(id: string, provider: LLMProvider): void {
    this.providers.set(id, provider);
  }

  /**
   * Set the provider used when no routing rule matches.
   */
  setDefaultProvider(provider: LLMProvider): void {
    this.defaultProvider = provider;
  }

  /**
   * Add or replace a routing rule for an agent type.
   * Rules are matched by exact agentType.
   */
  addRule(rule: AIRoutingRule): void {
    const existing = this.rules.findIndex(
      (r) => r.agentType === rule.agentType,
    );
    if (existing >= 0) {
      this.rules[existing] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * Resolve the LLMProvider for a given agent type.
   *
   * Resolution order:
   *  1. Matching rule → preferredProvider
   *  2. Matching rule → fallbackProvider (if preferred not registered)
   *  3. Default provider
   *  4. null (caller must handle)
   */
  resolve(agentType: string): LLMProvider | null {
    const rule = this.rules.find((r) => r.agentType === agentType);

    if (rule) {
      const preferred = this.providers.get(rule.preferredProvider);
      if (preferred) return preferred;

      if (rule.fallbackProvider) {
        const fallback = this.providers.get(rule.fallbackProvider);
        if (fallback) return fallback;
      }
    }

    return this.defaultProvider ?? null;
  }

  /**
   * Build a provider-bound generate function for a specific agent type.
   * Returns undefined if no provider is resolvable so callers can decide
   * whether to skip LLM calls or use a fallback strategy.
   */
  resolveGenerateFn(agentType: string): LLMProvider["generate"] | undefined {
    const provider = this.resolve(agentType);
    if (!provider) return undefined;
    return provider.generate.bind(provider);
  }

  /**
   * Check whether at least one provider is registered.
   */
  hasProviders(): boolean {
    return this.providers.size > 0 || this.defaultProvider !== undefined;
  }

  /**
   * Return all registered provider IDs.
   */
  registeredProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }
}
