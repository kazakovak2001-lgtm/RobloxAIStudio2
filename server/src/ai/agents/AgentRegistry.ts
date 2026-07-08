/**
 * AgentRegistry — Central governance registry for all AI agents.
 * Provides lookup, validation, and discovery APIs.
 */

import {
  AGENT_DEFINITIONS,
  type AgentMetadata,
  type AgentCapability,
} from "./AgentMetadata";

export class GovernanceAgentRegistry {
  private agents: Map<string, AgentMetadata> = new Map();

  constructor() {
    for (const def of AGENT_DEFINITIONS) {
      this.agents.set(def.id, def);
    }
  }

  get(id: string): AgentMetadata | undefined {
    return this.agents.get(id);
  }
  has(id: string): boolean {
    return this.agents.has(id);
  }
  getAll(): AgentMetadata[] {
    return [...this.agents.values()];
  }
  listIds(): string[] {
    return [...this.agents.keys()];
  }

  getByCategory(category: AgentMetadata["category"]): AgentMetadata[] {
    return this.getAll().filter((a) => a.category === category);
  }

  getByCapability(cap: keyof AgentCapability): AgentMetadata[] {
    return this.getAll().filter((a) => a.capabilities[cap]);
  }

  validateContext(
    agentId: string,
    context: Record<string, unknown>,
  ): { valid: boolean; missing: string[] } {
    const agent = this.agents.get(agentId);
    if (!agent)
      return { valid: false, missing: [`Agent not found: ${agentId}`] };
    const missing = agent.requiredContext.filter(
      (key) =>
        !(key in context) || context[key] === undefined || context[key] === "",
    );
    return { valid: missing.length === 0, missing };
  }

  get size(): number {
    return this.agents.size;
  }
}

let _instance: GovernanceAgentRegistry | null = null;
export function getGovernanceAgentRegistry(): GovernanceAgentRegistry {
  if (!_instance) _instance = new GovernanceAgentRegistry();
  return _instance;
}
