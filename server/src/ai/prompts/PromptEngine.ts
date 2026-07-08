/**
 * PromptEngine.ts — Production prompt management system.
 *
 * Centralizes all prompts with versioning, validation, metadata, and composition.
 * Replaces inline fallback prompts throughout the codebase.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptMetadata {
  id: string;
  agentType: string;
  version: string;
  description: string;
  category: "generation" | "validation" | "analysis" | "synthesis" | "planning";
  tags: string[];
  requiredVariables: string[];
  outputSchema: string[];
  maxTokenEstimate: number;
  deprecated?: boolean;
  deprecatedBy?: string;
}

export interface ManagedPrompt {
  metadata: PromptMetadata;
  system: string;
  user: string;
  fragments?: Record<string, string>;
}

export interface RenderResult {
  success: boolean;
  prompt: string;
  system: string;
  tokenEstimate: number;
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class PromptEngine {
  private prompts: Map<string, ManagedPrompt[]> = new Map(); // agentType → versions (latest last)
  private activeVersions: Map<string, string> = new Map(); // agentType → active version

  // ─── Metrics ─────────────────────────────────────────────────────────────
  private _metrics = {
    renderCount: 0,
    renderSuccess: 0,
    renderFailure: 0,
    validationErrors: 0,
    totalRenderTimeMs: 0,
  };

  get metrics() {
    return { ...this._metrics };
  }

  /**
   * Register a prompt with full metadata.
   */
  register(prompt: ManagedPrompt): void {
    const versions = this.prompts.get(prompt.metadata.agentType) ?? [];
    // Replace if same version exists
    const idx = versions.findIndex(
      (p) => p.metadata.version === prompt.metadata.version,
    );
    if (idx >= 0) versions[idx] = prompt;
    else versions.push(prompt);
    this.prompts.set(prompt.metadata.agentType, versions);
    // Auto-set active version to latest registered
    this.activeVersions.set(prompt.metadata.agentType, prompt.metadata.version);
  }

  /**
   * Set the active version for an agent type.
   */
  setActiveVersion(agentType: string, version: string): boolean {
    const versions = this.prompts.get(agentType);
    if (!versions?.some((p) => p.metadata.version === version)) return false;
    this.activeVersions.set(agentType, version);
    return true;
  }

  /**
   * Render a prompt for an agent type using the active version.
   */
  render(agentType: string, variables: Record<string, string>): RenderResult {
    const start = Date.now();
    this._metrics.renderCount++;

    const prompt = this.getActive(agentType);
    if (!prompt) {
      this._metrics.renderFailure++;
      return {
        success: false,
        prompt: "",
        system: "",
        tokenEstimate: 0,
        errors: [`No prompt registered for agent: ${agentType}`],
      };
    }

    // Validate variables
    const validation = this.validateVariables(prompt, variables);
    if (!validation.valid) {
      this._metrics.renderFailure++;
      this._metrics.validationErrors++;
      this._metrics.totalRenderTimeMs += Date.now() - start;
      return {
        success: false,
        prompt: "",
        system: "",
        tokenEstimate: 0,
        errors: validation.errors,
      };
    }

    // Interpolate
    const rendered = this.interpolate(prompt.user, variables);
    const system = this.interpolate(prompt.system, variables);
    const tokenEstimate = Math.ceil((system.length + rendered.length) / 4);

    this._metrics.renderSuccess++;
    this._metrics.totalRenderTimeMs += Date.now() - start;
    return { success: true, prompt: rendered, system, tokenEstimate };
  }

  /**
   * Validate a prompt's variables before rendering.
   */
  validate(
    agentType: string,
    variables: Record<string, string>,
  ): ValidationResult {
    const prompt = this.getActive(agentType);
    if (!prompt)
      return {
        valid: false,
        errors: [`No prompt for: ${agentType}`],
        warnings: [],
      };
    return this.validateVariables(prompt, variables);
  }

  /**
   * Get the active prompt for an agent type.
   */
  getActive(agentType: string): ManagedPrompt | null {
    const versions = this.prompts.get(agentType);
    if (!versions || versions.length === 0) return null;
    const activeVersion = this.activeVersions.get(agentType);
    return (
      versions.find((p) => p.metadata.version === activeVersion) ??
      versions[versions.length - 1]
    );
  }

  /**
   * Get all versions for an agent type.
   */
  getVersions(agentType: string): PromptMetadata[] {
    return (this.prompts.get(agentType) ?? []).map((p) => p.metadata);
  }

  /**
   * List all registered agent types.
   */
  listAgentTypes(): string[] {
    return [...this.prompts.keys()];
  }

  /**
   * Get metadata for the active prompt.
   */
  getMetadata(agentType: string): PromptMetadata | null {
    return this.getActive(agentType)?.metadata ?? null;
  }

  /**
   * Check if a prompt is registered.
   */
  has(agentType: string): boolean {
    return (
      this.prompts.has(agentType) && this.prompts.get(agentType)!.length > 0
    );
  }

  get size(): number {
    return this.prompts.size;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.split(`{{${key}}}`).join(value);
    }
    return result;
  }

  private validateVariables(
    prompt: ManagedPrompt,
    variables: Record<string, string>,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required variables
    for (const required of prompt.metadata.requiredVariables) {
      if (!(required in variables) || !variables[required]) {
        errors.push(`Missing required variable: {{${required}}}`);
      }
    }

    // Check for unknown variables provided
    const known = new Set(prompt.metadata.requiredVariables);
    for (const key of Object.keys(variables)) {
      if (!known.has(key))
        warnings.push(`Unknown variable provided: {{${key}}}`);
    }

    // Check total size
    const totalSize =
      (prompt.system + prompt.user).length +
      Object.values(variables).join("").length;
    if (totalSize > 100000)
      errors.push(`Prompt exceeds maximum size: ${totalSize} chars`);

    // Deprecated check
    if (prompt.metadata.deprecated) {
      warnings.push(
        `Prompt "${prompt.metadata.id}" is deprecated${prompt.metadata.deprecatedBy ? `. Use: ${prompt.metadata.deprecatedBy}` : ""}`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
