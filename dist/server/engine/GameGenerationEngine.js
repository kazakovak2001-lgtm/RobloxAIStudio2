import { GameGenerationService } from "../projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "../projects/repository/blueprint.repository";
import { BlueprintCache } from "../projects/cache/blueprint.cache";
import { StreamingUpdateHandler, PipelineEventEmitter } from "../socket/streaming";
export class GameGenerationEngine {
    constructor() {
        this.service = new GameGenerationService(new InMemoryBlueprintRepository(), new BlueprintCache(), new StreamingUpdateHandler(), new PipelineEventEmitter());
    }
    async generate(input) {
        return this.service.startGeneration(input.projectId, input.userId);
    }
}
