/**
 * PromptRankingRepository — Tracks prompt performance for optimization.
 */

import { randomUUID } from "crypto";
import type { PromptRecord } from "./KnowledgeTypes";

export class PromptRankingRepository {
  private records: PromptRecord[] = [];

  store(record: Omit<PromptRecord, "id" | "createdAt">): PromptRecord {
    const full: PromptRecord = {
      ...record,
      id: `prompt-${randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
    };
    this.records.push(full);
    return full;
  }

  getByAgent(agentType: string): PromptRecord[] {
    return this.records
      .filter((r) => r.agentType === agentType)
      .sort((a, b) => b.successRate - a.successRate);
  }

  getTopPrompts(limit = 10): PromptRecord[] {
    return [...this.records]
      .sort((a, b) => b.playtestScore - a.playtestScore)
      .slice(0, limit);
  }

  getByGenre(genre: string): PromptRecord[] {
    return this.records
      .filter((r) => r.genre === genre)
      .sort((a, b) => b.successRate - a.successRate);
  }

  getAll(): PromptRecord[] {
    return [...this.records];
  }

  getStats(): {
    totalPrompts: number;
    avgScore: number;
    avgCost: number;
    avgTokens: number;
  } {
    if (this.records.length === 0)
      return { totalPrompts: 0, avgScore: 0, avgCost: 0, avgTokens: 0 };
    const total = this.records.length;
    return {
      totalPrompts: total,
      avgScore: Math.round(
        this.records.reduce((s, r) => s + r.playtestScore, 0) / total,
      ),
      avgCost: this.records.reduce((s, r) => s + r.cost, 0) / total,
      avgTokens: Math.round(
        this.records.reduce((s, r) => s + r.tokenUsage, 0) / total,
      ),
    };
  }
}
