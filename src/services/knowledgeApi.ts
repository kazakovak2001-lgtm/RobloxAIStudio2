/**
 * Knowledge API client — frontend service for AI learning & pattern retrieval.
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

export interface KnowledgeRecommendation {
  similarProjects: Array<{
    projectId: string;
    score: number;
    matchedSystems: string[];
    matchedGenre: boolean;
    recommendedPatterns: string[];
  }>;
  recommendedPatterns: GamePattern[];
  bestPrompts: PromptRecord[];
}

export async function getPatterns(type?: PatternType): Promise<{
  success: boolean;
  data?: GamePattern[];
  error?: string;
}> {
  try {
    const url = type
      ? `/api/knowledge/patterns?type=${type}`
      : "/api/knowledge/patterns";
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getPrompts(agent?: string): Promise<{
  success: boolean;
  data?: PromptRecord[];
  stats?: unknown;
  error?: string;
}> {
  try {
    const url = agent
      ? `/api/knowledge/prompts?agent=${agent}`
      : "/api/knowledge/prompts";
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data, stats: json.stats };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function searchKnowledge(
  genre?: string,
  systems?: string[],
): Promise<{
  success: boolean;
  data?: unknown[];
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (genre) params.set("genre", genre);
    if (systems?.length) params.set("systems", systems.join(","));
    const url = `/api/knowledge/search${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getRecommendations(
  genre: string,
  systems: string[] = [],
): Promise<{
  success: boolean;
  data?: KnowledgeRecommendation;
  error?: string;
}> {
  try {
    const params = new URLSearchParams({ genre });
    if (systems.length) params.set("systems", systems.join(","));
    const res = await fetch(`/api/knowledge/recommend?${params}`);
    const json = await res.json();
    if (!res.ok)
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
