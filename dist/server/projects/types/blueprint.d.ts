export interface GameBlueprint {
    id: string;
    projectId: string;
    userId: string;
    name: string;
    description?: string;
    gameType: string;
    genre: string;
    targetAudience?: string;
    difficulty: string;
    estimatedPlayers: string;
    status: string;
    version: number;
    requirements?: string;
    gameplay?: string;
    uiLayouts?: string;
    architecture?: string;
    assets?: string;
    codeSpec?: string;
    validationErrors?: string;
    warnings?: string;
    generationMetadata?: string;
    exportMetadata?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateBlueprintInput {
    name: string;
    game_type: string;
    description?: string;
    genre?: string;
    targetAudience?: string;
    difficulty?: string;
    estimated_players?: string;
}
export interface UpdateBlueprintInput {
    name?: string;
    description?: string;
    genre?: string;
    status?: string;
    validationErrors?: string;
    warnings?: string;
}
export interface BlueprintQueryOptions {
    projectId?: string;
    userId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    offset?: number;
    limit?: number;
}
export interface BlueprintVersion {
    id: string;
    blueprintId: string;
    versionNumber: number;
    createdAt: Date;
    createdBy: string;
    snapshot: string;
    changeDescription?: string;
    isActive: boolean;
}
export interface GenerationExecution {
    id: string;
    blueprintId: string;
    projectId: string;
    userId: string;
    startedAt: Date;
    completedAt?: Date;
    status: string;
    totalDurationMs?: number;
    errorMessage?: string;
    retryCount: number;
    pipelineSteps?: string;
}
