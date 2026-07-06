/**
 * CapabilityRegistry.ts — Registry + resolution of agent capabilities.
 */

import type { BaseAgentV2 } from "./BaseAgentV2";
import type { AgentCapability } from "./types";

export class CapabilityRegistry {
  private agents: Map<string, BaseAgentV2> = new Map();

  register(agent: BaseAgentV2): void {
    this.agents.set(agent.agentId, agent);
  }
  get(id: string): BaseAgentV2 | undefined {
    return this.agents.get(id);
  }
  has(id: string): boolean {
    return this.agents.has(id);
  }
  getAll(): BaseAgentV2[] {
    return [...this.agents.values()];
  }
  getCapabilities(): AgentCapability[] {
    return this.getAll().map((a) => a.capability);
  }
  findForTask(task: string): BaseAgentV2[] {
    return this.getAll().filter((a) => a.canHandle(task));
  }
  get size(): number {
    return this.agents.size;
  }
  clear(): void {
    this.agents.clear();
  }
}
