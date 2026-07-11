/**
 * Game Architect API client — frontend service for the AI Game Architect.
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

export interface PromptQualityScore {
  overall: number;
  completeness: number;
  technicalAccuracy: number;
  robloxCompatibility: number;
  classification: string;
  issues: string[];
}

export interface GameArchitectResult {
  analysis: GameAnalysis;
  designDocument: Record<string, string>;
  architecturePlan: Record<string, string[]>;
  agentPrompts: {
    projectTitle: string;
    generatedAt: number;
    prompts: AgentPrompt[];
    totalAgents: number;
  };
  qualityScore: PromptQualityScore;
  generatedAt: number;
}

/**
 * Analyze a game idea.
 */
export async function analyzeGameIdea(
  input: GameIdeaInput,
): Promise<{ success: boolean; data?: GameAnalysis; error?: string }> {
  try {
    const res = await fetch("/api/ai/game-architect/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
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

/**
 * Generate full game architect result (analysis + design + prompts + quality).
 */
export async function generateArchitectPlan(
  input: GameIdeaInput,
): Promise<{ success: boolean; data?: GameArchitectResult; error?: string }> {
  try {
    const res = await fetch("/api/ai/game-architect/generate-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
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
