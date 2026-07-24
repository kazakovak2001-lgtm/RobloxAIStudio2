import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class LuaGeneratorAgent extends BaseAgent {
  public readonly name = "LuaGenerator";
  public readonly description =
    "Generates Roblox Luau server, client, and shared modules";

  public readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      architecture: { type: "object" },
      gameplay: { type: "object" },
      blueprint: { type: "object" },
    },
  };

  public readonly outputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      generatedCode: { type: "object" },
      lua_generator: { type: "object" },
    },
    required: ["lua_generator"],
  };

  constructor(config?: Partial<AgentConfig>) {
    super(config);
  }

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    const bp = input.blueprint as Record<string, unknown> | undefined;
    const arch = (input.architecture ?? input.roblox_architect) as
      Record<string, unknown> | undefined;
    const gameplay = input.gameplay as Record<string, unknown> | undefined;

    const name = String(bp?.name ?? "UnnamedGame");
    const services = (arch as any)?.services ?? {};
    const serviceNames: string[] =
      typeof services === "object"
        ? Object.keys(services).slice(0, 5)
        : ["GameManager", "DataService", "PlayerService"];

    const mechanicsArr = (gameplay as any)?.mechanics;
    const systemsSummary = Array.isArray(mechanicsArr)
      ? mechanicsArr
          .slice(0, 4)
          .map((m: any) => String(m?.name ?? m))
          .join(", ")
      : "core systems";

    const fallback: Record<string, unknown> = {
      generatedCode: { scripts: [], modules: {} },
      lua_generator: {
        server: serviceNames.map((svc) => ({
          name: `${svc}.server.lua`,
          code: `-- ${svc}\nlocal ${svc} = {}\n\nfunction ${svc}.init()\n\tprint("[${svc}] Initialized")\nend\n\nreturn ${svc}`,
        })),
        client: [
          {
            name: "LocalController.client.lua",
            code: '-- LocalController\nlocal LocalController = {}\n\nfunction LocalController.init()\n\tprint("[LocalController] Ready")\nend\n\nreturn LocalController',
          },
        ],
        shared: [
          {
            name: "GameConfig.lua",
            code: `-- Shared game configuration\nlocal GameConfig = {\n\tGAME_NAME = "${name}",\n\tVERSION = "1.0.0",\n}\n\nreturn GameConfig`,
          },
        ],
        modules: [],
        patterns: [
          "Server-authoritative state management",
          "RemoteEvent-based client communication",
          "Module caching pattern",
        ],
      },
    };

    if (!this.llm) return fallback;

    const codingStandards =
      "PascalCase modules, camelCase functions, server-authoritative, RemoteEvents for client communication";

    const registryPrompt = this.buildPrompt({
      name,
      architecture_summary: serviceNames.join(", "),
      systems_summary: systemsSummary,
      coding_standards: codingStandards,
    });

    const inlinePrompt =
      "You are a Roblox Luau developer. Generate structured module code. " +
      "Respond with a single JSON object:\n" +
      '{ "lua_generator": { "server": Array<{name,code}>, "client": Array<{name,code}>, ' +
      '"shared": Array<{name,code}>, "patterns": string[] } }\n\n' +
      `Game Name: ${name}\nServices: ${serviceNames.join(", ")}\n` +
      `Gameplay Systems: ${systemsSummary}\nCoding Standards: ${codingStandards}\n\n` +
      "Generate 2-3 server scripts, 1-2 client scripts, 1-2 shared modules. " +
      "Each script must be complete and runnable. Return only valid JSON.";

    const prompt = registryPrompt ?? inlinePrompt;

    const result = await this.generateWithRetry(
      prompt,
      ["lua_generator"],
      fallback,
      {
        temperature: 0.4,
        maxTokens: 3000,
      },
    );

    if (!result.generatedCode) {
      result.generatedCode = { scripts: [], modules: {} };
    }

    return result;
  }
}
