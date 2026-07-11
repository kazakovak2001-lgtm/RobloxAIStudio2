/**
 * Game Architect Types — Core type definitions for the AI Game Architect module.
 */

export interface GameIdeaInput {
  title?: string;
  description: string;
  genre?: string;
  theme?: string;
  visualStyle?: string;
  gameplayMechanics?: string[];
  targetAudience?: string;
  multiplayerType?: string;
  monetizationGoals?: string[];
  references?: string[];
}

export interface GameAnalysis {
  genre: string;
  subGenre: string;
  gameplayLoop: string;
  playerMotivation: string[];
  progressionSystem: string;
  difficultyModel: string;
  requiredSystems: string[];
  technicalComplexity: number;
  estimatedAgents: string[];
  risks: string[];
  improvements: string[];
}

export interface GameDesignDocument {
  gameVision: string;
  coreLoop: string;
  targetPlayer: string;
  worldDesign: string;
  characters: string;
  progressionSystem: string;
  economyDesign: string;
  multiplayerDesign: string;
  uiUxDirection: string;
  technicalArchitecture: string;
  performanceStrategy: string;
}

export interface GameArchitecturePlan {
  serverArchitecture: string[];
  clientArchitecture: string[];
  dataStoreUsage: string[];
  remoteEvents: string[];
  moduleScripts: string[];
  optimizationStrategy: string[];
  securityConsiderations: string[];
}

export interface AgentPrompt {
  agentId: string;
  agentName: string;
  objective: string;
  responsibilities: string[];
  technicalRequirements: string[];
  expectedOutput: string[];
  validationRules: string[];
  context: string;
}

export interface AgentPromptPackage {
  projectTitle: string;
  generatedAt: number;
  prompts: AgentPrompt[];
  totalAgents: number;
}

export interface PromptQualityScore {
  overall: number;
  completeness: number;
  technicalAccuracy: number;
  robloxCompatibility: number;
  classification:
    "production_ready" | "needs_refinement" | "requires_improvement";
  issues: string[];
}

export interface GameArchitectResult {
  analysis: GameAnalysis;
  designDocument: GameDesignDocument;
  architecturePlan: GameArchitecturePlan;
  agentPrompts: AgentPromptPackage;
  qualityScore: PromptQualityScore;
  generatedAt: number;
}
