/**
 * TraceStore.ts
 *
 * In-memory store for execution traces.
 * Provides:
 *   - Create / read / update traces
 *   - Append events to a trace
 *   - Query by executionId
 *   - Export to JSON
 *   - Configurable retention (max traces kept)
 *
 * Design decision: in-memory with LRU eviction.
 * For persistence, use EventStore (eventsource/) which is already in the system.
 */

import type { ExecutionTrace, ExecutionTraceEvent } from "./types";

export interface TraceStoreConfig {
  maxTraces: number;
}

const DEFAULT_CONFIG: TraceStoreConfig = {
  maxTraces: 100,
};

export class TraceStore {
  private static _instance: TraceStore | null = null;
  private traces: Map<string, ExecutionTrace> = new Map();
  private insertionOrder: string[] = [];
  private config: TraceStoreConfig;

  constructor(config?: Partial<TraceStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static instance(): TraceStore {
    if (!TraceStore._instance) {
      TraceStore._instance = new TraceStore();
    }
    return TraceStore._instance;
  }

  static resetInstance(): void {
    TraceStore._instance = null;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────

  createTrace(trace: ExecutionTrace): void {
    this.evictIfNeeded();
    this.traces.set(trace.executionId, trace);
    this.insertionOrder.push(trace.executionId);
  }

  getTrace(executionId: string): ExecutionTrace | undefined {
    return this.traces.get(executionId);
  }

  updateTrace(executionId: string, updates: Partial<ExecutionTrace>): void {
    const trace = this.traces.get(executionId);
    if (!trace) return;
    Object.assign(trace, updates);
  }

  appendEvent(executionId: string, event: ExecutionTraceEvent): void {
    const trace = this.traces.get(executionId);
    if (!trace) return;
    trace.events.push(event);
  }

  // ─── Query ─────────────────────────────────────────────────────────────

  listTraces(): ExecutionTrace[] {
    return [...this.traces.values()];
  }

  getTracesByStatus(status: ExecutionTrace["status"]): ExecutionTrace[] {
    return this.listTraces().filter((t) => t.status === status);
  }

  getEventsForNode(executionId: string, nodeId: string): ExecutionTraceEvent[] {
    const trace = this.traces.get(executionId);
    if (!trace) return [];
    return trace.events.filter((e) => e.nodeId === nodeId);
  }

  getEventsByType(
    executionId: string,
    eventType: ExecutionTraceEvent["eventType"],
  ): ExecutionTraceEvent[] {
    const trace = this.traces.get(executionId);
    if (!trace) return [];
    return trace.events.filter((e) => e.eventType === eventType);
  }

  // ─── Export ────────────────────────────────────────────────────────────

  exportTrace(executionId: string): string | null {
    const trace = this.traces.get(executionId);
    if (!trace) return null;
    return JSON.stringify(trace, null, 2);
  }

  exportAll(): string {
    return JSON.stringify(this.listTraces(), null, 2);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  deleteTrace(executionId: string): boolean {
    const deleted = this.traces.delete(executionId);
    if (deleted) {
      this.insertionOrder = this.insertionOrder.filter(
        (id) => id !== executionId,
      );
    }
    return deleted;
  }

  clear(): void {
    this.traces.clear();
    this.insertionOrder = [];
  }

  get size(): number {
    return this.traces.size;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    while (
      this.traces.size >= this.config.maxTraces &&
      this.insertionOrder.length > 0
    ) {
      const oldest = this.insertionOrder.shift()!;
      this.traces.delete(oldest);
    }
  }
}
