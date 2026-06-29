import type { GameBlueprint } from "../types/blueprint";
/**
 * Blueprint Assembler
 * Collects agent outputs and assembles them into a complete GameBlueprint
 */
export declare class BlueprintAssembler {
    /**
     * Assemble blueprint from pipeline outputs
     */
    static assembleBlueprint(baseBlueprint: GameBlueprint, pipelineOutputs: Record<string, unknown>): GameBlueprint;
    /**
     * Extract requirements from planner/requirements agent output
     */
    private static extractRequirements;
    /**
     * Extract gameplay from game designer agent output
     */
    private static extractGameplay;
    /**
     * Extract UI layouts from UI generator agent output
     */
    private static extractUILayouts;
    /**
     * Extract architecture from roblox architect agent output
     */
    private static extractArchitecture;
    /**
     * Extract assets from asset planner agent output
     */
    private static extractAssets;
    /**
     * Extract code specification from lua generator agent output
     */
    private static extractCodeSpec;
    /**
     * Validate assembled blueprint
     */
    static validateAssembled(blueprint: GameBlueprint): {
        valid: boolean;
        issues: string[];
    };
    /**
     * Merge partial blueprints
     */
    static mergePartial(base: GameBlueprint, partial: Partial<GameBlueprint>): GameBlueprint;
}
