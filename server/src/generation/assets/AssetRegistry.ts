/**
 * AssetRegistry — Defines asset blueprints for different game genres and systems.
 */

import type {
  AssetType,
  AssetTargetService,
  AssetGenerationRequest,
} from "./AssetTypes";
import { createAssetId } from "./AssetTypes";
import type { GameAsset } from "./AssetTypes";

interface AssetBlueprint {
  name: string;
  type: AssetType;
  targetService: AssetTargetService;
  targetPath: string;
  category: string;
  generator: string;
}

const UI_ASSETS: AssetBlueprint[] = [
  {
    name: "MainMenuBackground",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "ButtonPrimary",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "ButtonSecondary",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "InventorySlot",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "HealthBar",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI/HUD",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "CurrencyIcon",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI/HUD",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "CrosshairDefault",
    type: "Image",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/UI/HUD",
    category: "ui",
    generator: "asset_planner",
  },
  {
    name: "UIFont",
    type: "FontReference",
    targetService: "StarterGui",
    targetPath: "StarterGui/Assets/Fonts",
    category: "ui",
    generator: "asset_planner",
  },
];

const AUDIO_ASSETS: AssetBlueprint[] = [
  {
    name: "BGM_Menu",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/Music",
    category: "audio",
    generator: "asset_planner",
  },
  {
    name: "BGM_Gameplay",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/Music",
    category: "audio",
    generator: "asset_planner",
  },
  {
    name: "SFX_Click",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/SFX",
    category: "audio",
    generator: "asset_planner",
  },
  {
    name: "SFX_Collect",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/SFX",
    category: "audio",
    generator: "asset_planner",
  },
  {
    name: "SFX_LevelUp",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/SFX",
    category: "audio",
    generator: "asset_planner",
  },
  {
    name: "SFX_Error",
    type: "Audio",
    targetService: "SoundService",
    targetPath: "SoundService/SFX",
    category: "audio",
    generator: "asset_planner",
  },
];

const ENVIRONMENT_ASSETS: AssetBlueprint[] = [
  {
    name: "Skybox",
    type: "Decal",
    targetService: "Lighting",
    targetPath: "Lighting/Sky",
    category: "environment",
    generator: "asset_planner",
  },
  {
    name: "GroundTexture",
    type: "Texture",
    targetService: "Workspace",
    targetPath: "Workspace/Assets/Terrain",
    category: "environment",
    generator: "asset_planner",
  },
  {
    name: "ParticleSparkle",
    type: "ParticleConfiguration",
    targetService: "ReplicatedStorage",
    targetPath: "ReplicatedStorage/Assets/Particles",
    category: "environment",
    generator: "asset_planner",
  },
  {
    name: "ParticleExplosion",
    type: "ParticleConfiguration",
    targetService: "ReplicatedStorage",
    targetPath: "ReplicatedStorage/Assets/Particles",
    category: "environment",
    generator: "asset_planner",
  },
];

const GAMEPLAY_ASSETS: AssetBlueprint[] = [
  {
    name: "SwordMesh",
    type: "MeshMetadata",
    targetService: "ServerStorage",
    targetPath: "ServerStorage/Assets/Weapons",
    category: "gameplay",
    generator: "asset_planner",
  },
  {
    name: "ShieldMesh",
    type: "MeshMetadata",
    targetService: "ServerStorage",
    targetPath: "ServerStorage/Assets/Weapons",
    category: "gameplay",
    generator: "asset_planner",
  },
  {
    name: "NPCPortrait",
    type: "Image",
    targetService: "ReplicatedStorage",
    targetPath: "ReplicatedStorage/Assets/NPC",
    category: "gameplay",
    generator: "asset_planner",
  },
  {
    name: "CharacterIdleAnim",
    type: "AnimationMetadata",
    targetService: "ReplicatedStorage",
    targetPath: "ReplicatedStorage/Assets/Animations",
    category: "gameplay",
    generator: "asset_planner",
  },
  {
    name: "CharacterRunAnim",
    type: "AnimationMetadata",
    targetService: "ReplicatedStorage",
    targetPath: "ReplicatedStorage/Assets/Animations",
    category: "gameplay",
    generator: "asset_planner",
  },
];

export class AssetRegistry {
  /**
   * Generate asset list based on the request.
   */
  generateAssets(request: AssetGenerationRequest): GameAsset[] {
    const blueprints: AssetBlueprint[] = [];

    // Always include UI and audio
    blueprints.push(...UI_ASSETS);
    blueprints.push(...AUDIO_ASSETS);

    // Add environment if any visual systems exist
    if (
      request.systems.some((s) =>
        ["gameplay", "lobby", "adventure"].includes(s),
      )
    ) {
      blueprints.push(...ENVIRONMENT_ASSETS);
    }

    // Add gameplay assets
    if (
      request.systems.some((s) =>
        ["combat", "inventory", "npc", "quest", "gameplay"].includes(s),
      )
    ) {
      blueprints.push(...GAMEPLAY_ASSETS);
    }

    const now = Date.now();
    return blueprints.map((bp) => this.toAsset(bp, now));
  }

  private toAsset(blueprint: AssetBlueprint, timestamp: number): GameAsset {
    return {
      assetId: createAssetId(),
      type: blueprint.type,
      name: blueprint.name,
      targetService: blueprint.targetService,
      targetPath: blueprint.targetPath,
      dependencies: [],
      generator: blueprint.generator,
      validationScore: 85, // Placeholder assets get base score
      generated: false,
      placeholder: true,
      metadata: {
        category: blueprint.category,
        description: `Placeholder for ${blueprint.name}`,
      },
      sizeBytes: 0,
      createdAt: timestamp,
    };
  }
}
