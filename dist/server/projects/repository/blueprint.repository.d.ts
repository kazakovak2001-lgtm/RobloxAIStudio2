import type { GameBlueprint, BlueprintVersion, GenerationExecution, CreateBlueprintInput, UpdateBlueprintInput, BlueprintQueryOptions } from "../types/blueprint";
export interface IBlueprintRepository {
    createBlueprint(userId: string, input: CreateBlueprintInput): Promise<GameBlueprint>;
    getBlueprint(id: string): Promise<GameBlueprint | null>;
    getBlueprintByProjectId(projectId: string): Promise<GameBlueprint | null>;
    updateBlueprint(id: string, input: UpdateBlueprintInput): Promise<GameBlueprint | null>;
    deleteBlueprint(id: string): Promise<boolean>;
    listBlueprints(options: BlueprintQueryOptions): Promise<{
        items: GameBlueprint[];
        total: number;
    }>;
    saveVersion(blueprintId: string, userId: string, description?: string): Promise<BlueprintVersion>;
    getVersion(blueprintId: string, versionNumber: number): Promise<BlueprintVersion | null>;
    listVersions(blueprintId: string): Promise<BlueprintVersion[]>;
    restoreVersion(blueprintId: string, versionNumber: number): Promise<GameBlueprint | null>;
    recordExecution(execution: GenerationExecution): Promise<GenerationExecution>;
    getExecution(id: string): Promise<GenerationExecution | null>;
    listExecutions(blueprintId: string): Promise<GenerationExecution[]>;
    updateExecution(id: string, updates: Partial<GenerationExecution>): Promise<GenerationExecution | null>;
}
export declare class InMemoryBlueprintRepository implements IBlueprintRepository {
    private blueprints;
    private versions;
    private executions;
    createBlueprint(userId: string, input: CreateBlueprintInput): Promise<GameBlueprint>;
    getBlueprint(id: string): Promise<GameBlueprint | null>;
    getBlueprintByProjectId(projectId: string): Promise<GameBlueprint | null>;
    updateBlueprint(id: string, input: UpdateBlueprintInput): Promise<GameBlueprint | null>;
    deleteBlueprint(id: string): Promise<boolean>;
    listBlueprints(options: BlueprintQueryOptions): Promise<{
        items: GameBlueprint[];
        total: number;
    }>;
    saveVersion(blueprintId: string, userId: string, description?: string): Promise<BlueprintVersion>;
    getVersion(blueprintId: string, versionNumber: number): Promise<BlueprintVersion | null>;
    listVersions(blueprintId: string): Promise<BlueprintVersion[]>;
    restoreVersion(blueprintId: string, versionNumber: number): Promise<GameBlueprint | null>;
    recordExecution(execution: GenerationExecution): Promise<GenerationExecution>;
    getExecution(id: string): Promise<GenerationExecution | null>;
    listExecutions(blueprintId: string): Promise<GenerationExecution[]>;
    updateExecution(id: string, updates: Partial<GenerationExecution>): Promise<GenerationExecution | null>;
    private generateId;
}
