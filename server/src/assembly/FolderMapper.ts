import type { RobloxService, AssemblyFolder } from "./AssemblyTypes";
import type { GameBlueprint } from "../generation/GenerationBlueprint";

/**
 * FolderMappingRule — declarative mapping from blueprint section to Roblox service.
 */
export interface FolderMappingRule {
  section: string;
  service: RobloxService;
  basePath: string;
  subfolders?: string[];
  purpose: string;
}

/**
 * Default configurable folder mapping rules.
 */
export const DEFAULT_FOLDER_MAPPINGS: FolderMappingRule[] = [
  {
    section: "gameplay",
    service: "ServerScriptService",
    basePath: "ServerScriptService/Game",
    subfolders: ["Mechanics", "Systems", "Events"],
    purpose: "Core gameplay server logic",
  },
  {
    section: "architecture",
    service: "ServerScriptService",
    basePath: "ServerScriptService/Services",
    subfolders: ["Data", "Network", "Player"],
    purpose: "Server infrastructure services",
  },
  {
    section: "scripts.server",
    service: "ServerScriptService",
    basePath: "ServerScriptService",
    purpose: "Server scripts root",
  },
  {
    section: "scripts.client",
    service: "StarterPlayer",
    basePath: "StarterPlayer/StarterPlayerScripts",
    subfolders: ["Controllers", "UI"],
    purpose: "Client-side scripts",
  },
  {
    section: "scripts.shared",
    service: "ReplicatedStorage",
    basePath: "ReplicatedStorage/Shared",
    subfolders: ["Modules", "Config", "Types"],
    purpose: "Shared modules",
  },
  {
    section: "ui",
    service: "StarterGui",
    basePath: "StarterGui",
    subfolders: ["Screens", "Components", "Themes"],
    purpose: "UI layouts and components",
  },
  {
    section: "world",
    service: "Workspace",
    basePath: "Workspace",
    subfolders: ["Map", "Spawns", "NPCs", "Props"],
    purpose: "World objects and geometry",
  },
  {
    section: "assets",
    service: "ServerStorage",
    basePath: "ServerStorage/Assets",
    subfolders: ["Models", "Textures", "Sounds", "Animations"],
    purpose: "Asset storage",
  },
  {
    section: "network",
    service: "ReplicatedStorage",
    basePath: "ReplicatedStorage/Network",
    subfolders: ["Events", "Functions"],
    purpose: "Networking remotes",
  },
  {
    section: "configuration",
    service: "ReplicatedStorage",
    basePath: "ReplicatedStorage/Config",
    purpose: "Game configuration values",
  },
];

/**
 * FolderMapper
 *
 * Maps GameBlueprint sections to a Roblox folder structure.
 * Configurable via rules — no hardcoded paths.
 */
export class FolderMapper {
  private rules: FolderMappingRule[];

  constructor(rules?: FolderMappingRule[]) {
    this.rules = rules ?? DEFAULT_FOLDER_MAPPINGS;
  }

  /**
   * Generate the complete folder structure from the blueprint.
   */
  mapFolders(_blueprint: GameBlueprint): AssemblyFolder[] {
    const folders: AssemblyFolder[] = [];

    for (const rule of this.rules) {
      // Create base folder
      folders.push({
        name: rule.basePath.split("/").pop() ?? rule.section,
        service: rule.service,
        path: rule.basePath,
        children: rule.subfolders ?? [],
        purpose: rule.purpose,
      });

      // Create subfolders
      if (rule.subfolders) {
        for (const sub of rule.subfolders) {
          folders.push({
            name: sub,
            service: rule.service,
            path: `${rule.basePath}/${sub}`,
            children: [],
            purpose: `${rule.purpose} — ${sub}`,
          });
        }
      }
    }

    console.log(
      `[ASSEMBLY] Mapping Complete | ${this.rules.length} rules → ${folders.length} folders`,
    );

    return folders;
  }

  /**
   * Resolve which service a given section maps to.
   */
  resolveService(section: string): RobloxService | null {
    const rule = this.rules.find((r) => r.section === section);
    return rule?.service ?? null;
  }

  /**
   * Resolve the base path for a section.
   */
  resolvePath(section: string): string | null {
    const rule = this.rules.find((r) => r.section === section);
    return rule?.basePath ?? null;
  }
}
