/**
 * PromptBuilder.ts — Assembles prompts from templates + context. Provider-agnostic.
 */

export interface PromptTemplate {
  id: string;
  system: string;
  user: string;
  variables: string[];
}
export interface PromptContext {
  variables: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export class PromptBuilder {
  private templates: Map<string, PromptTemplate> = new Map();

  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Build a prompt by rendering a template with context variables.
   */
  build(
    templateId: string,
    context: PromptContext,
  ): { success: boolean; prompt?: string; error?: string } {
    const template = this.templates.get(templateId);
    if (!template)
      return { success: false, error: `Template "${templateId}" not found` };

    // Check required variables
    const missing = template.variables.filter((v) => !(v in context.variables));
    if (missing.length > 0)
      return {
        success: false,
        error: `Missing variables: ${missing.join(", ")}`,
      };

    // Render
    let prompt = `${template.system}\n\n${template.user}`;
    for (const [key, value] of Object.entries(context.variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    return { success: true, prompt };
  }

  /**
   * Validate a prompt (non-empty, reasonable length).
   */
  validate(prompt: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!prompt || prompt.trim().length === 0) errors.push("Prompt is empty");
    if (prompt.length > 500000)
      errors.push("Prompt exceeds max length (500K chars)");
    if (/\{\{[^}]+\}\}/.test(prompt))
      errors.push("Unresolved template variables remain");
    return { valid: errors.length === 0, errors };
  }

  get templateCount(): number {
    return this.templates.size;
  }
}
