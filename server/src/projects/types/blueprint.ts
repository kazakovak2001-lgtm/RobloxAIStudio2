// This file re-exports the canonical blueprint types from the shared types module.
// It exists to maintain backward compatibility with existing imports while the
// project migrates to the canonical type location.
export type {
  GameBlueprint,
  CreateBlueprintInput,
  UpdateBlueprintInput,
  BlueprintQueryOptions,
  BlueprintVersion,
  GenerationExecution,
  BlueprintStatus,
  GameplaySystem,
  GameplayMechanic,
  UILayout,
  GameArchitecture,
  AssetPlan,
  CodeGenSpec,
} from "../../types/blueprint";
