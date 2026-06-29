import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import { StreamingUpdateHandler, PipelineEventEmitter } from "../socket/streaming";

export class GameGenerationEngine {
  private service: GameGenerationService;

  constructor() {
    const events = new PipelineEventEmitter();
    const streaming = new StreamingUpdateHandler();
    events.setStreamingHandler(streaming);

    this.service = new GameGenerationService(
      new InMemoryBlueprintRepository(),
      new BlueprintCache(),
      streaming,
      events,
    );
  }

  async generate(input: { projectId: string; userId: string; prompt: string }) {
    return this.service.startGeneration(input.projectId, input.userId);
  }
}
