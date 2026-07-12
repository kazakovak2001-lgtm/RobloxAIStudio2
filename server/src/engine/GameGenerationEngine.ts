import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import {
  StreamingUpdateHandler,
  PipelineEventEmitter,
} from "../socket/streaming";
import { AIPipelineIntegrator } from "../execution/aiPipelineIntegrator";

export class GameGenerationEngine {
  private service: GameGenerationService;

  constructor() {
    const events = new PipelineEventEmitter();
    const streaming = new StreamingUpdateHandler();
    events.setStreamingHandler(streaming);

    // Composition root for the standalone engine wrapper.
    this.service = new GameGenerationService(
      new InMemoryBlueprintRepository(),
      new BlueprintCache(),
      streaming,
      events,
      // Uses the same event bus so pipeline events can stream.
      new AIPipelineIntegrator(events),
    );
  }

  async generate(input: { projectId: string; userId: string; prompt: string }) {
    return this.service.startGeneration(input.projectId, input.userId);
  }
}
