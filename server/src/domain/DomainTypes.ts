/**
 * Roblox Domain Intelligence Types.
 */

export type GameGenre =
  | "obby"
  | "simulator"
  | "tycoon"
  | "rpg"
  | "fps"
  | "tower_defense"
  | "survival"
  | "horror"
  | "adventure"
  | "idle"
  | "pet_simulator"
  | "battle_arena";

export interface GenreBlueprint {
  genre: GameGenre;
  name: string;
  description: string;
  gameplayLoop: string;
  requiredSystems: string[];
  optionalSystems: string[];
  coreMechanics: string[];
  recommendedServices: string[];
  commonAssets: string[];
  expectedUI: string[];
  complexity: number;
  estimatedScripts: number;
}

export interface BestPractice {
  id: string;
  category: string;
  rule: string;
  reason: string;
  severity: "required" | "recommended" | "optional";
}

export interface ArchitecturePlan {
  genre: GameGenre;
  systems: string[];
  folderLayout: Record<string, string[]>;
  serviceLayout: Record<string, string[]>;
  initializationOrder: string[];
  agentAssignment: Record<string, string>;
}

export interface BenchmarkResult {
  genre: GameGenre;
  completeness: number;
  complexity: number;
  scalability: number;
  maintainability: number;
  overallScore: number;
  missingRequired: string[];
  recommendations: string[];
}

export interface DomainAnalysisInput {
  genre: string;
  systems: string[];
  scriptCount: number;
  assetCount: number;
  hasMultiplayer: boolean;
}
