import type { GameBlueprint } from "../types/blueprint";
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class BlueprintValidator {
    validate(blueprint: GameBlueprint): ValidationResult;
}
