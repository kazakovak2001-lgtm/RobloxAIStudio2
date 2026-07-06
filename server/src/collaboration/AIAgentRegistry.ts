/**
 * AIAgentRegistry.ts
 *
 * Central registry for all AI collaboration agents.
 * Manages lifecycle, capabilities, and role-based lookup.
 */

import type { AIAgent, AgentRole } from "./CollaborationTypes";

export class AIAgentRegistry {
  private agents = new Map<string, AIAgent>();

  register(agent: AIAgent): void {
    this.agents.set(agent.agentId, agent);
    console.log(
      `[AI-REGISTRY] Registered | ID: ${agent.agentId} | Role: ${agent.role} | Capabilities: ${agent.capabilities.join(", ")}`,
    );
  }

  get(agentId: string): AIAgent | null {
    return this.agents.get(agentId) ?? null;
  }

  listAll(): AIAgent[] {
    return Array.from(this.agents.values());
  }

  listEnabled(): AIAgent[] {
    return this.listAll().filter((a) => a.enabled);
  }

  listByRole(role: AgentRole): AIAgent[] {
    return this.listEnabled().filter((a) => a.role === role);
  }

  listByCapability(capability: string): AIAgent[] {
    return this.listEnabled().filter((a) =>
      a.capabilities.includes(capability),
    );
  }

  enable(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.enabled = true;
  }

  disable(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.enabled = false;
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  get size(): number {
    return this.agents.size;
  }
}

let _instance: AIAgentRegistry | null = null;
export function getAIAgentRegistry(): AIAgentRegistry {
  if (!_instance) _instance = new AIAgentRegistry();
  return _instance;
}
