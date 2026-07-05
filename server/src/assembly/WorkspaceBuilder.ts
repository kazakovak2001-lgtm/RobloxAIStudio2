import type {
  WorkspaceEntry,
  AssetPlaceholder,
  NetworkObject,
  AssemblyConfig,
} from "./AssemblyTypes";
import type { GameBlueprint } from "../generation/GenerationBlueprint";

/**
 * WorkspaceBuilder
 *
 * Creates the internal Workspace model: folders, spawns, NPC placeholders,
 * interactive objects, terrain stubs, tags, and collections.
 * Also generates asset placeholders and networking layout.
 */
export class WorkspaceBuilder {
  private entryCounter = 0;
  private assetCounter = 0;
  private networkCounter = 0;

  build(blueprint: GameBlueprint): {
    world: WorkspaceEntry[];
    assets: AssetPlaceholder[];
    network: NetworkObject[];
    configuration: AssemblyConfig[];
  } {
    const world = this.buildWorld(blueprint);
    const assets = this.buildAssetPlaceholders(blueprint);
    const network = this.buildNetworkLayout(blueprint);
    const configuration = this.buildConfiguration(blueprint);

    console.log(
      `[ASSEMBLY] Workspace Created | World: ${world.length} | Assets: ${assets.length} | Network: ${network.length} | Config: ${configuration.length}`,
    );

    return { world, assets, network, configuration };
  }

  private buildWorld(blueprint: GameBlueprint): WorkspaceEntry[] {
    const entries: WorkspaceEntry[] = [];

    // Root folders
    entries.push(this.entry("Map", "Folder", "Workspace/Map"));
    entries.push(this.entry("Spawns", "Folder", "Workspace/Spawns"));
    entries.push(this.entry("NPCs", "Folder", "Workspace/NPCs"));
    entries.push(this.entry("Props", "Folder", "Workspace/Props"));

    // Default spawn location
    entries.push(
      this.entry(
        "DefaultSpawn",
        "SpawnLocation",
        "Workspace/Spawns/DefaultSpawn",
        {
          Anchored: true,
          CanCollide: true,
          Transparency: 1,
        },
      ),
    );

    // Terrain placeholder
    entries.push(
      this.entry("Terrain", "Terrain", "Workspace/Terrain", {
        WaterEnabled: true,
        GrassLength: 1,
      }),
    );

    // World places from blueprint
    if (blueprint.world?.places && Array.isArray(blueprint.world.places)) {
      for (const place of blueprint.world.places) {
        const name =
          typeof place === "object" && place !== null
            ? String((place as any).name ?? "Place")
            : String(place);
        entries.push(this.entry(name, "Folder", `Workspace/Map/${name}`));
      }
    }

    // NPC placeholders from world
    if (blueprint.world?.models && Array.isArray(blueprint.world.models)) {
      for (const model of blueprint.world.models) {
        const name =
          typeof model === "object" && model !== null
            ? String((model as any).name ?? "Model")
            : String(model);
        entries.push(this.entry(name, "Model", `Workspace/Props/${name}`));
      }
    }

    // Tags from gameplay mechanics
    if (blueprint.gameplay?.mechanics) {
      for (const mech of blueprint.gameplay.mechanics) {
        entries.push(
          this.entry(
            `Tag_${mech.name}`,
            "Tag",
            `CollectionService/${mech.name}`,
            {
              description: mech.description,
            },
          ),
        );
      }
    }

    return entries;
  }

  private buildAssetPlaceholders(blueprint: GameBlueprint): AssetPlaceholder[] {
    const assets: AssetPlaceholder[] = [];

    if (blueprint.assets?.models) {
      for (const m of blueprint.assets.models as Array<{
        name?: string;
        description?: string;
      }>) {
        assets.push(
          this.asset(
            String(m.name ?? "Model"),
            "Model",
            "ServerStorage/Assets/Models",
            m.description,
          ),
        );
      }
    }
    if (blueprint.assets?.textures) {
      for (const t of blueprint.assets.textures as Array<{ name?: string }>) {
        assets.push(
          this.asset(
            String(t.name ?? "Texture"),
            "Texture",
            "ServerStorage/Assets/Textures",
          ),
        );
      }
    }
    if (blueprint.assets?.sounds) {
      for (const s of blueprint.assets.sounds as Array<{ name?: string }>) {
        assets.push(
          this.asset(String(s.name ?? "Sound"), "Audio", "SoundService"),
        );
      }
    }
    if (blueprint.assets?.animations) {
      for (const a of blueprint.assets.animations as Array<{ name?: string }>) {
        assets.push(
          this.asset(
            String(a.name ?? "Animation"),
            "Animation",
            "ServerStorage/Assets/Animations",
          ),
        );
      }
    }

    return assets;
  }

  private buildNetworkLayout(blueprint: GameBlueprint): NetworkObject[] {
    const objects: NetworkObject[] = [];

    // Generate remotes from architecture API contracts
    if (blueprint.architecture?.apiContracts) {
      for (const [name, _contract] of Object.entries(
        blueprint.architecture.apiContracts,
      )) {
        objects.push(
          this.networkObj(
            name,
            "RemoteEvent",
            "client-to-server",
            `Client request: ${name}`,
          ),
        );
      }
    }

    // Default networking objects
    objects.push(
      this.networkObj(
        "PlayerReady",
        "RemoteEvent",
        "client-to-server",
        "Client signals ready after loading",
      ),
    );
    objects.push(
      this.networkObj(
        "GameStateUpdate",
        "RemoteEvent",
        "server-to-client",
        "Server broadcasts game state",
      ),
    );
    objects.push(
      this.networkObj(
        "GetPlayerData",
        "RemoteFunction",
        "client-to-server",
        "Client requests player data",
      ),
    );

    return objects;
  }

  private buildConfiguration(blueprint: GameBlueprint): AssemblyConfig[] {
    const configs: AssemblyConfig[] = [];

    configs.push({
      name: "GameName",
      key: "game.name",
      service: "ReplicatedStorage",
      path: "ReplicatedStorage/Config",
      value: blueprint.project?.name ?? "Game",
    });
    configs.push({
      name: "GameType",
      key: "game.type",
      service: "ReplicatedStorage",
      path: "ReplicatedStorage/Config",
      value: blueprint.project?.gameType ?? "adventure",
    });
    configs.push({
      name: "Difficulty",
      key: "game.difficulty",
      service: "ReplicatedStorage",
      path: "ReplicatedStorage/Config",
      value: blueprint.project?.difficulty ?? "medium",
    });
    configs.push({
      name: "MaxPlayers",
      key: "game.maxPlayers",
      service: "ReplicatedStorage",
      path: "ReplicatedStorage/Config",
      value: blueprint.project?.estimatedPlayers ?? "small-group",
    });

    return configs;
  }

  private entry(
    name: string,
    type: WorkspaceEntry["type"],
    path: string,
    properties?: Record<string, unknown>,
  ): WorkspaceEntry {
    this.entryCounter++;
    return { id: `ws-${this.entryCounter}`, name, type, path, properties };
  }

  private asset(
    name: string,
    type: AssetPlaceholder["type"],
    path: string,
    description?: string,
  ): AssetPlaceholder {
    this.assetCounter++;
    return {
      id: `asset-${this.assetCounter}`,
      name,
      type,
      service: "ServerStorage",
      path: `${path}/${name}`,
      description,
    };
  }

  private networkObj(
    name: string,
    type: NetworkObject["type"],
    direction: NetworkObject["direction"],
    description?: string,
  ): NetworkObject {
    this.networkCounter++;
    return {
      id: `net-${this.networkCounter}`,
      name,
      type,
      service: "ReplicatedStorage",
      path: `ReplicatedStorage/Network/${name}`,
      direction,
      description,
    };
  }
}
