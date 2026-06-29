import type { GameBlueprint, CreateBlueprintInput, GenerationExecution } from "../types/blueprint";
import type { IBlueprintRepository } from "../repository/blueprint.repository";
import { BlueprintCache } from "../cache/blueprint.cache";
import { StreamingUpdateHandler, PipelineEventEmitter } from "../../socket/streaming";
export declare class GameGenerationService {
    private repository;
    private cache;
    private streaming;
    private validator;
    constructor(repository: IBlueprintRepository, cache: BlueprintCache, streaming: StreamingUpdateHandler, _events: PipelineEventEmitter);
    createBlueprint(userId: string, projectId: string, input: CreateBlueprintInput): Promise<GameBlueprint>;
    getBlueprint(id: string): Promise<GameBlueprint | null>;
    getBlueprintByProject(projectId: string): Promise<GameBlueprint | null>;
    updateBlueprint(id: string, updates: Partial<GameBlueprint>): Promise<GameBlueprint | null>;
    validateBlueprint(blueprint: GameBlueprint): import("./blueprint.validator").ValidationResult;
    startGeneration(blueprintId: string, userId: string): Promise<GenerationExecution>;
    getExecution(id: string): Promise<GenerationExecution | null>;
    getExecutions(blueprintId: string): Promise<GenerationExecution[]>;
    getStreamingHandler(): StreamingUpdateHandler;
    getCacheStats(): {
        size: number;
        ttl: number;
    };
}
