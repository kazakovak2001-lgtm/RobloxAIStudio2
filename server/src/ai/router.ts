export type AIProviderConfig = Record<string, unknown>;

export class AIRouter {
  async route(_config: AIProviderConfig): Promise<unknown> {
    return null;
  }
}