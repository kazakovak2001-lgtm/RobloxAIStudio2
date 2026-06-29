export class BlueprintValidator {
    validate(blueprint) {
        const errors = [];
        const warnings = [];
        if (!blueprint.name)
            errors.push("Blueprint name is required");
        if (!blueprint.gameType)
            errors.push("Game type is required");
        if (!blueprint.genre)
            errors.push("Genre is required");
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
}
