import type {
  JsonObject,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../types";

export class LocalModelProvider implements ModelProvider {
  readonly name = "local-rule-engine";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const normalizedPrompt = request.prompt.toLowerCase();
    const intent = this.detectIntent(normalizedPrompt);

    const structuredData: JsonObject = {
      intent,
      summary: `Prepared ${intent} guidance for the AI pipeline based on the supplied prompt.`,
      recommendations: [
        "Break work into phases",
        "Capture dependencies early",
        "Keep outputs structured",
      ],
      confidence: 0.92,
    };

    return {
      text: JSON.stringify(structuredData),
      structuredData,
    };
  }

  private detectIntent(prompt: string): string {
    if (prompt.includes("requirements")) return "requirements";
    if (prompt.includes("planner")) return "planning";
    if (prompt.includes("designer")) return "design";
    if (prompt.includes("architecture")) return "architecture";
    if (prompt.includes("lua")) return "lua";
    if (prompt.includes("ui")) return "ui";
    if (prompt.includes("asset")) return "asset";
    if (prompt.includes("database")) return "database";
    if (prompt.includes("doc")) return "documentation";
    if (prompt.includes("test")) return "testing";
    if (prompt.includes("debug")) return "debugging";
    if (prompt.includes("performance")) return "performance";
    return "general";
  }
}
