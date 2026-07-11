/**
 * Knowledge Types — AI Learning & Knowledge Repository types.
 */

export type PatternType =
  | "inventory"
  | "quest"
  | "combat"
  | "dialogue"
  | "economy"
  | "save"
  | "lobby"
  | "multiplayer"
  | "progression"
  | "ui";

export interface GamePattern {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  scripts: string[];
  dependencies: string[];
  genre: string[];
  successRate: number;
  usageCount: number;
  averageScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromptRecord {
  id: string;
  promptId: string;
  agentType: string;
  genre: string;
  tokenUsage: number;
  cost: number;
  repairCount: number;
  playtestScore: number;
  successRate: number;
  usageCount: number;
  createdAt: number;
}

export interface GenerationRecord {
  id: string;
  projectId: string;
  genre: string;
  systems: string[];
  mechanics: string[];
  scriptCount: number;
  assetCount: number;
  playtestScore: number;
  finalScore: number;
  repairIterations: number;
  totalTokens: number;
  totalCost: number;
  duration: number;
  patterns: string[];
  createdAt: number;
}

export interface SimilarityResult {
  projectId: string;
  score: number;
  matchedSystems: string[];
  matchedGenre: boolean;
  recommendedPatterns: string[];
}

export interface KnowledgeSearchQuery {
  genre?: string;
  systems?: string[];
  mechanics?: string[];
  minScore?: number;
}
