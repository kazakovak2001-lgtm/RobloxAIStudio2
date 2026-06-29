/**
 * Blueprint Assembler
 * Collects agent outputs and assembles them into a complete GameBlueprint
 */
export class BlueprintAssembler {
    /**
     * Assemble blueprint from pipeline outputs
     */
    static assembleBlueprint(baseBlueprint, pipelineOutputs) {
        return {
            ...baseBlueprint,
            requirements: this.extractRequirements(pipelineOutputs),
            gameplay: this.extractGameplay(pipelineOutputs),
            ui_layouts: this.extractUILayouts(pipelineOutputs),
            architecture: this.extractArchitecture(pipelineOutputs),
            assets: this.extractAssets(pipelineOutputs),
            code_spec: this.extractCodeSpec(pipelineOutputs),
            generation_metadata: {
                generated_at: new Date(),
                agents_involved: Object.keys(pipelineOutputs),
            },
        };
    }
    /**
     * Extract requirements from planner/requirements agent output
     */
    static extractRequirements(outputs) {
        const req = outputs.requirements || outputs.plan;
        if (!req)
            return undefined;
        if (typeof req === "object" && req !== null) {
            return {
                functional: req.functional_requirements || [],
                non_functional: req.non_functional_requirements || {},
                constraints: req.constraints || [],
                success_criteria: req.success_criteria || [],
            };
        }
        return {
            functional: [],
            non_functional: {},
            constraints: [],
            success_criteria: [],
        };
    }
    /**
     * Extract gameplay from game designer agent output
     */
    static extractGameplay(outputs) {
        const gameplay = outputs.gameplay || outputs.game_designer;
        if (!gameplay) {
            return {
                mechanics: [],
                progression: {},
                balance: {},
            };
        }
        if (typeof gameplay === "object" && gameplay !== null) {
            const gp = gameplay;
            return {
                mechanics: gp.mechanics || gp.game_mechanics || [],
                progression: gp.progression || {},
                balance: gp.balance || {},
            };
        }
        return {
            mechanics: [],
            progression: {},
            balance: {},
        };
    }
    /**
     * Extract UI layouts from UI generator agent output
     */
    static extractUILayouts(outputs) {
        const ui = outputs.ui_layouts || outputs.ui_generator;
        if (!ui)
            return [];
        if (Array.isArray(ui)) {
            return ui.map((layout) => ({
                name: layout.name || "UI Layout",
                type: layout.type || "hud",
                position: layout.position,
                elements: layout.elements || [],
            }));
        }
        if (typeof ui === "object" && ui !== null) {
            const uiObj = ui;
            if (Array.isArray(uiObj.layouts)) {
                return uiObj.layouts;
            }
            return [ui];
        }
        return [];
    }
    /**
     * Extract architecture from roblox architect agent output
     */
    static extractArchitecture(outputs) {
        const arch = outputs.architecture || outputs.roblox_architect;
        if (!arch) {
            return {
                client_architecture: {},
                server_architecture: {},
                networking: {},
            };
        }
        if (typeof arch === "object" && arch !== null) {
            const a = arch;
            return {
                client_architecture: a.client_architecture || {},
                server_architecture: a.server_architecture || {},
                networking: a.networking || {},
            };
        }
        return {
            client_architecture: {},
            server_architecture: {},
            networking: {},
        };
    }
    /**
     * Extract assets from asset planner agent output
     */
    static extractAssets(outputs) {
        const assets = outputs.assets || outputs.asset_planner;
        if (!assets) {
            return {
                models: [],
                textures: [],
                sounds: [],
                animations: [],
            };
        }
        if (typeof assets === "object" && assets !== null) {
            const ast = assets;
            return {
                models: ast.models || [],
                textures: ast.textures || [],
                sounds: ast.sounds || [],
                animations: ast.animations || [],
            };
        }
        return {
            models: [],
            textures: [],
            sounds: [],
            animations: [],
        };
    }
    /**
     * Extract code specification from lua generator agent output
     */
    static extractCodeSpec(outputs) {
        const code = outputs.code_spec || outputs.lua_generator;
        if (!code) {
            return {
                modules: [],
                patterns: [],
                coding_standards: {},
            };
        }
        if (typeof code === "object" && code !== null) {
            const c = code;
            return {
                modules: c.modules || [],
                patterns: c.patterns || [],
                coding_standards: c.coding_standards || {},
            };
        }
        return {
            modules: [],
            patterns: [],
            coding_standards: {},
        };
    }
    /**
     * Validate assembled blueprint
     */
    static validateAssembled(blueprint) {
        const issues = [];
        if (!blueprint.gameplay || blueprint.gameplay.mechanics.length === 0) {
            issues.push("No gameplay mechanics defined");
        }
        if (!blueprint.ui_layouts || blueprint.ui_layouts.length === 0) {
            issues.push("No UI layouts defined");
        }
        if (!blueprint.architecture) {
            issues.push("No architecture defined");
        }
        if (!blueprint.code_spec || blueprint.code_spec.modules.length === 0) {
            issues.push("No code modules defined");
        }
        return {
            valid: issues.length === 0,
            issues,
        };
    }
    /**
     * Merge partial blueprints
     */
    static mergePartial(base, partial) {
        return {
            ...base,
            ...partial,
            // Deep merge certain fields
            gameplay: partial.gameplay
                ? { ...base.gameplay, ...partial.gameplay }
                : base.gameplay,
            architecture: partial.architecture
                ? { ...base.architecture, ...partial.architecture }
                : base.architecture,
            assets: partial.assets
                ? { ...base.assets, ...partial.assets }
                : base.assets,
            code_spec: partial.code_spec
                ? { ...base.code_spec, ...partial.code_spec }
                : base.code_spec,
        };
    }
}
