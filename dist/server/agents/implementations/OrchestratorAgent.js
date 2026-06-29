import { BaseAgent } from "../core/BaseAgent";
import { RequirementsAgent } from "./RequirementsAgent";
import { PlannerAgent } from "./PlannerAgent";
import { GameDesignerAgent } from "./GameDesignerAgent";
import { RobloxArchitectAgent } from "./RobloxArchitectAgent";
import { LuaGeneratorAgent } from "./LuaGeneratorAgent";
import { UIGeneratorAgent } from "./UIGeneratorAgent";
import { AssetPlannerAgent } from "./AssetPlannerAgent";
import { DatabaseAgent } from "./DatabaseAgent";
import { DocumentationAgent } from "./DocumentationAgent";
import { TesterAgent } from "./TesterAgent";
import { DebugAgent } from "./DebugAgent";
import { PerformanceAgent } from "./PerformanceAgent";
const agentFactories = {
    requirements: (_llm, _options) => new RequirementsAgent(),
    planner: (_llm, _options) => new PlannerAgent(),
    game_designer: (_llm, _options) => new GameDesignerAgent(),
    roblox_architect: (_llm, _options) => new RobloxArchitectAgent(),
    lua_generator: (_llm, _options) => new LuaGeneratorAgent(),
    ui_generator: (_llm, _options) => new UIGeneratorAgent(),
    asset_planner: (_llm, _options) => new AssetPlannerAgent(),
    database_designer: (_llm, _options) => new DatabaseAgent(),
    documentation: (_llm, _options) => new DocumentationAgent(),
    tester: (_llm, _options) => new TesterAgent(),
    debugger: (_llm, _options) => new DebugAgent(),
    performance: (_llm, _options) => new PerformanceAgent(),
    orchestrator: () => {
        throw new Error("Orchestrator cannot be instantiated as a pipeline agent");
    },
};
export class OrchestratorAgent extends BaseAgent {
    constructor(_llm, _options) {
        super();
        this.name = "Orchestrator";
        this.description = "Coordinates the multi-agent pipeline execution with retry, logging, and error handling.";
        this.inputSchema = {
            type: "object",
            properties: {
                pipeline: { type: "array", items: { type: "string" } },
                input: { type: "object" },
            },
            required: ["pipeline", "input"],
        };
        this.outputSchema = {
            type: "object",
            properties: {
                pipelineRunId: { type: "string" },
                status: { type: "string" },
                steps: { type: "array", items: { type: "object" } },
                finalOutput: { type: "object" },
            },
            required: ["pipelineRunId", "status", "steps"],
        };
        this.pipelineContext = null;
    }
    async process(input) {
        const pipeline = input.pipeline;
        const userInput = input.input;
        const pipelineRunId = `run_${Date.now()}`;
        this.pipelineContext = {
            projectId: userInput.projectId ?? "unknown",
            userId: userInput.userId ?? "unknown",
            input: userInput,
            results: new Map(),
            metadata: { pipelineRunId },
        };
        const steps = [];
        let currentInput = userInput;
        let failedAt = null;
        for (const agentType of pipeline) {
            const agent = agentFactories[agentType](this.llm);
            const startedAt = new Date();
            let result = await agent.execute(currentInput);
            steps.push({
                agent: agent.name,
                status: result.success ? "completed" : "failed",
                result,
                startedAt,
                finishedAt: new Date(),
            });
            if (!result.success) {
                failedAt = { agent: agentType, result };
                break;
            }
            currentInput = { ...currentInput, ...(result.data ?? {}) };
        }
        if (failedAt) {
            const retryResult = failedAt.result.attempts >= 3
                ? failedAt.result
                : await agentFactories[failedAt.agent](this.llm).retry(currentInput, failedAt.result.error);
            const failedStep = steps.find((step) => step.agent === failedAt.agent);
            if (failedStep) {
                failedStep.status = retryResult.success ? "completed" : "failed";
                failedStep.result = retryResult;
                failedStep.finishedAt = new Date();
            }
        }
        const completedSteps = steps.filter((step) => step.status === "completed");
        const failedSteps = steps.filter((step) => step.status === "failed");
        const status = failedSteps.length === 0 ? "completed" : "failed";
        return {
            pipelineRunId,
            status,
            steps: steps.map(({ result, ...step }) => step),
            finalOutput: completedSteps.length > 0 ? completedSteps[completedSteps.length - 1].result?.data ?? {} : {},
        };
    }
    async retryAgent(agentType, input) {
        const agent = agentFactories[agentType](this.llm);
        return agent.retry(input);
    }
    getPipelineContext() {
        return this.pipelineContext;
    }
}
