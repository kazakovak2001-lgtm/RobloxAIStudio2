/**
 * ConsensusEngine — Resolves conflicts between agent proposals.
 */

import { randomUUID } from "crypto";
import type { ConsensusDecision, AgentMessage } from "./CollaborationTypes";

export class ConsensusEngine {
  private decisions: ConsensusDecision[] = [];

  /**
   * Resolve a conflict by having the reviewer decide.
   */
  resolve(
    topic: string,
    proposals: Array<{ agentId: string; proposal: string }>,
  ): ConsensusDecision {
    // Strategy: pick the proposal with highest estimated quality
    // In production, this would use LLM-based reasoning
    const decision = this.selectBest(proposals);

    const record: ConsensusDecision = {
      id: `consensus-${randomUUID().slice(0, 8)}`,
      topic,
      proposals,
      decision: decision.proposal,
      decidedBy: "reviewer",
      timestamp: Date.now(),
    };

    this.decisions.push(record);
    return record;
  }

  /**
   * Auto-resolve from conflicting messages.
   */
  resolveFromMessages(messages: AgentMessage[]): ConsensusDecision | null {
    const proposals = messages
      .filter((m) => m.type === "proposal" || m.type === "alternative")
      .map((m) => ({ agentId: m.from, proposal: m.content }));

    if (proposals.length < 2) return null;

    const topic = messages[0]?.subject ?? "Unknown topic";
    return this.resolve(topic, proposals);
  }

  getDecisions(): ConsensusDecision[] {
    return [...this.decisions];
  }

  getDecision(id: string): ConsensusDecision | null {
    return this.decisions.find((d) => d.id === id) ?? null;
  }

  private selectBest(proposals: Array<{ agentId: string; proposal: string }>): {
    agentId: string;
    proposal: string;
  } {
    // Simple heuristic: prefer shorter, more specific proposals
    // In production: use LLM or scoring
    return proposals.reduce((best, curr) =>
      curr.proposal.length > best.proposal.length ? curr : best,
    );
  }
}
