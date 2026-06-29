export declare class GameGenerationEngine {
    private service;
    constructor();
    generate(input: {
        projectId: string;
        userId: string;
        prompt: string;
    }): Promise<import("../projects/types/blueprint").GenerationExecution>;
}
