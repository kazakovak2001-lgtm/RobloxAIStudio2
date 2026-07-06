# Agent Architecture — Roblox AI Studio DevKit

## Single Canonical Location

```
server/src/agents/
├── core/
│   ├── BaseAgent.ts        ← abstract base class
│   └── AgentRegistry.ts    ← singleton registry + LLM wiring
└── implementations/
    ├── RequirementsAgent.ts
    ├── PlannerAgent.ts
    ├── GameDesignerAgent.ts
    ├── RobloxArchitectAgent.ts
    ├── LuaGeneratorAgent.ts
    ├── UIGeneratorAgent.ts
    ├── AssetPlannerAgent.ts
    ├── DatabaseAgent.ts
    ├── DocumentationAgent.ts
    ├── TesterAgent.ts
    ├── DebugAgent.ts
    ├── PerformanceAgent.ts
    └── OrchestratorAgent.ts
```

## Base Class: `BaseAgent`

```typescript
abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, unknown>;
  abstract readonly outputSchema: Record<string, unknown>;

  protected llm?: LLMProvider;

  setLLM(llm): void;
  setTemplateRegistry(registry): void;
  execute(input): Promise<AgentResult<AgentOutput>>;
  protected abstract process(input): Promise<Record<string, unknown>>;
  protected generateWithRetry(
    prompt,
    required,
    fallback,
    opts,
  ): Promise<Record<string, unknown>>;
  protected buildPrompt(vars): string | null;
  protected renderPrompt(vars, part): string | null;
  protected agentTypeKey(): string | null;
}
```

## Agent Registry

```typescript
class AgentRegistry {
  constructor(llm?: LLMProvider); // auto-registers all 13 agents
  setLLM(llm): void; // wires LLM into every agent
  executeAgent(type, input): Promise<Record<string, unknown>>;
  getAgent(type): BaseAgent | undefined;
  registeredTypes(): string[];
}
```

## Provider Abstraction

Single provider interface at `server/src/ai/provider.ts`:

```typescript
interface LLMProvider {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
  stream?(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
}
```

Concrete implementations: `server/src/providers/`

- `openai.ts` — OpenAI / Azure
- `anthropic.ts` — Anthropic Claude
- `gemini.ts` — Google Gemini
- `ollama.ts` — Local Ollama

Factory: `server/src/ai/providerFactory.ts` (reads env vars, instantiates provider)

## Orchestrator

`OrchestratorAgent` is the final pipeline stage:

- **Mode A** (default): Synthesises all prior outputs into world/systems summary
- **Mode B** (standalone): Coordinates sub-pipelines via injected registry

The `AgentRegistry` injects itself into `OrchestratorAgent.setRegistry(this)` at construction.

## Execution Flow

```
CompilerAPI.buildAssembly(projectId, blueprint)
  → GameGenerationService.startGeneration()
    → AIPipelineIntegrator.executePipeline()
      → PlanningEngine.next() selects step
        → AgentRegistry.executeAgent(type, input)
          → agent.execute(input)
            → agent.process(input)
              → this.generateWithRetry(prompt, keys, fallback)
                → this.llm.generate(prompt)
                → LLMOutputParser.parseAndValidate()
          → EvaluationRegistry.evaluate(output)
          → ProjectMemory.writeContext()
      → next step...
```

## Prompt System

`PromptTemplateRegistry` (server/src/ai/promptTemplates.ts) is the single source of truth:

- Default templates for all 8 pipeline agents
- `{{variable}}` interpolation
- Agents use `this.buildPrompt(vars)` which delegates to registry
- Inline prompts serve as fallback only

## Key Design Decisions

1. **Agents are stateless** — all context comes through input
2. **No agent-to-agent communication** — all goes through Memory
3. **Deterministic fallbacks** — every agent returns valid output even without LLM
4. **Retry with repair** — `generateWithRetry()` retries once with stricter prompt
5. **Single registry** — `AgentRegistry` is the only way to instantiate/execute agents
