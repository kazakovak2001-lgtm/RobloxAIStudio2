/**
 * Memory entry types for the AI memory store.
 */

import { randomUUID } from "crypto";

export type MemoryType =
  | "decision"
  | "asset"
  | "validation"
  | "correction"
  | "failure"
  | "output"
  | "context";

export interface MemoryEntryData {
  id: string;
  type: MemoryType;
  agentId: string;
  sessionId: string;
  timestamp: number;
  content: unknown;
  importance: number; // 1-10
  tags: string[];
}

export function createMemoryEntry(
  params: Omit<MemoryEntryData, "id" | "timestamp">,
): MemoryEntryData {
  return {
    id: `mem-${randomUUID().slice(0, 10)}`,
    timestamp: Date.now(),
    ...params,
  };
}
