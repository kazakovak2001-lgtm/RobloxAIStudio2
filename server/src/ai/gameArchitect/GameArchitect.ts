/**
 * GameArchitect — Top-level facade that orchestrates the full game design pipeline.
 * Transforms a human game idea into professional production prompts for AI agents.
 */

import type {
  GameIdeaInput,
  GameArchitectResult,
  GameAnalysis,
  GameDesignDocument,
  GameArchitecturePlan,
  AgentPromptPackage,
  PromptQualityScore,
} from "./GameArchitectTypes";
import { GameIdeaAnalyzer } from "./GameIdeaAnalyzer";
import { GameDesignGenerator } from "./GameDesignGenerator";
import { ArchitecturePlanner } from "./ArchitecturePlanner";
import { AgentPromptGenerator } from "./AgentPromptGenerator";
import { PromptQualityValidator } from "./PromptQualityValidator";

export class GameArchitect {
  private analyzer: GameIdeaAnalyzer;
  private designGenerator: GameDesignGenerator;
  private architecturePlanner: ArchitecturePlanner;
  private promptGenerator: AgentPromptGenerator;
  private qualityValidator: PromptQualityValidator;

  constructor() {
    this.analyzer = new GameIdeaAnalyzer();
    this.designGenerator = new GameDesignGenerator();
    this.architecturePlanner = new ArchitecturePlanner();
    this.promptGenerator = new AgentPromptGenerator();
    this.qualityValidator = new PromptQualityValidator();
  }

  /**
   * Full pipeline: analyze idea → generate design → plan architecture → create prompts → validate quality.
   */
  process(input: GameIdeaInput): GameArchitectResult {
    const analysis = this.analyze(input);
    const designDocument = this.generateDesign(input, analysis);
    const architecturePlan = this.planArchitecture(analysis);
    const agentPrompts = this.generatePrompts(
      input,
      analysis,
      designDocument,
      architecturePlan,
    );
    const qualityScore = this.validateQuality(agentPrompts);

    return {
      analysis,
      designDocument,
      architecturePlan,
      agentPrompts,
      qualityScore,
      generatedAt: Date.now(),
    };
  }

  /**
   * Step 1: Analyze the game idea.
   */
  analyze(input: GameIdeaInput): GameAnalysis {
    return this.analyzer.analyze(input);
  }

  /**
   * Step 2: Generate game design document.
   */
  generateDesign(
    input: GameIdeaInput,
    analysis: GameAnalysis,
  ): GameDesignDocument {
    return this.designGenerator.generate(input, analysis);
  }

  /**
   * Step 3: Plan technical architecture.
   */
  planArchitecture(analysis: GameAnalysis): GameArchitecturePlan {
    return this.architecturePlanner.plan(analysis);
  }

  /**
   * Step 4: Generate agent prompts.
   */
  generatePrompts(
    input: GameIdeaInput,
    analysis: GameAnalysis,
    design: GameDesignDocument,
    architecture: GameArchitecturePlan,
  ): AgentPromptPackage {
    return this.promptGenerator.generate(input, analysis, design, architecture);
  }

  /**
   * Step 5: Validate prompt quality.
   */
  validateQuality(prompts: AgentPromptPackage): PromptQualityScore {
    return this.qualityValidator.validate(prompts);
  }
}
