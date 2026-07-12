/**
 * AgentRegistryService — Production agent registry with metadata, versioning, and health.
 */

export interface AgentRegistryEntry {
  id: string;
  name: string;
  version: string;
  status: "active" | "deprecated" | "disabled";
  capabilities: string[];
  avgTokenUsage: number;
  avgCost: number;
  successRate: number;
  totalExecutions: number;
  lastExecutedAt?: number;
}

export class AgentRegistryService {
  private agents: Map<string, AgentRegistryEntry> = new Map();

  constructor() {
    this.seedAgents();
  }

  get(id: string): AgentRegistryEntry | null {
    return this.agents.get(id) ?? null;
  }

  getAll(): AgentRegistryEntry[] {
    return [...this.agents.values()];
  }

  getActive(): AgentRegistryEntry[] {
    return this.getAll().filter((a) => a.status === "active");
  }

  recordExecution(
    id: string,
    tokens: number,
    cost: number,
    success: boolean,
  ): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.totalExecutions++;
    agent.lastExecutedAt = Date.now();
    agent.avgTokenUsage = Math.round(
      (agent.avgTokenUsage * (agent.totalExecutions - 1) + tokens) /
        agent.totalExecutions,
    );
    agent.avgCost =
      (agent.avgCost * (agent.totalExecutions - 1) + cost) /
      agent.totalExecutions;
    agent.successRate =
      (agent.successRate * (agent.totalExecutions - 1) + (success ? 1 : 0)) /
      agent.totalExecutions;
  }

  private seedAgents(): void {
    const agents: Omit<
      AgentRegistryEntry,
      "avgTokenUsage" | "avgCost" | "successRate" | "totalExecutions"
    >[] = [
      {
        id: "requirements",
        name: "Requirements Agent",
        version: "2.0.0",
        status: "active",
        capabilities: ["requirement_extraction", "scope_analysis"],
      },
      {
        id: "game_designer",
        name: "Game Designer",
        version: "2.0.0",
        status: "active",
        capabilities: ["game_design", "mechanics", "progression"],
      },
      {
        id: "roblox_architect",
        name: "Roblox Architect",
        version: "2.0.0",
        status: "active",
        capabilities: ["architecture", "service_layout", "networking"],
      },
      {
        id: "lua_generator",
        name: "Lua Generator",
        version: "2.0.0",
        status: "active",
        capabilities: ["lua_generation", "module_scripts", "server_scripts"],
      },
      {
        id: "ui_generator",
        name: "UI Generator",
        version: "2.0.0",
        status: "active",
        capabilities: ["ui_design", "screen_gui", "hud"],
      },
      {
        id: "asset_planner",
        name: "Asset Planner",
        version: "2.0.0",
        status: "active",
        capabilities: ["asset_planning", "textures", "audio", "meshes"],
      },
      {
        id: "tester",
        name: "QA Tester",
        version: "2.0.0",
        status: "active",
        capabilities: ["testing", "validation", "performance"],
      },
      {
        id: "performance",
        name: "Performance Agent",
        version: "2.0.0",
        status: "active",
        capabilities: ["optimization", "profiling", "memory"],
      },
      {
        id: "documentation",
        name: "Documentation Agent",
        version: "2.0.0",
        status: "active",
        capabilities: ["documentation", "readme", "comments"],
      },
    ];

    for (const a of agents) {
      this.agents.set(a.id, {
        ...a,
        avgTokenUsage: 0,
        avgCost: 0,
        successRate: 1,
        totalExecutions: 0,
      });
    }
  }
}
