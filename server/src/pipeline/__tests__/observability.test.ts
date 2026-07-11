import { describe, it, expect, beforeEach } from "vitest";
import { DefaultPipelineEventBus } from "../events/DefaultPipelineEventBus";
import { createPipelineEvent } from "../events/PipelineEvent";
import { InMemoryAuditStore } from "../audit/InMemoryAuditStore";
import { createAuditEntry } from "../audit/PipelineAuditLog";
import { PipelineMetricsCollector } from "../metrics/PipelineMetrics";

describe("Pipeline Observability", () => {
  describe("PipelineEventBus", () => {
    let bus: DefaultPipelineEventBus;

    beforeEach(() => {
      bus = new DefaultPipelineEventBus();
    });

    it("delivers events to subscribers", () => {
      const received: string[] = [];
      bus.subscribe((e) => received.push(e.type));
      bus.emit(createPipelineEvent("p1", "PipelineStarted"));
      bus.emit(createPipelineEvent("p1", "StageStarted", "REQUIREMENTS"));
      expect(received).toEqual(["PipelineStarted", "StageStarted"]);
    });

    it("supports multiple subscribers", () => {
      let count = 0;
      bus.subscribe(() => count++);
      bus.subscribe(() => count++);
      bus.emit(createPipelineEvent("p1", "PipelineStarted"));
      expect(count).toBe(2);
    });

    it("does not crash on subscriber error", () => {
      bus.subscribe(() => {
        throw new Error("boom");
      });
      bus.subscribe(() => {
        /* ok */
      });
      expect(() =>
        bus.emit(createPipelineEvent("p1", "PipelineStarted")),
      ).not.toThrow();
    });

    it("tracks event history", () => {
      bus.emit(createPipelineEvent("p1", "PipelineStarted"));
      bus.emit(createPipelineEvent("p1", "StageCompleted", "GAME_DESIGN"));
      bus.emit(createPipelineEvent("p2", "PipelineStarted"));
      expect(bus.historyCount).toBe(3);
      expect(bus.getHistory("p1")).toHaveLength(2);
    });

    it("unsubscribes handlers", () => {
      let count = 0;
      const handler = () => count++;
      bus.subscribe(handler);
      bus.emit(createPipelineEvent("p1", "PipelineStarted"));
      bus.unsubscribe(handler);
      bus.emit(createPipelineEvent("p1", "PipelineStarted"));
      expect(count).toBe(1);
    });
  });

  describe("PipelineAuditStore", () => {
    let store: InMemoryAuditStore;

    beforeEach(() => {
      store = new InMemoryAuditStore();
    });

    it("appends and retrieves audit entries", () => {
      store.append(
        createAuditEntry("p1", "PipelineStarted", "Pipeline started"),
      );
      store.append(
        createAuditEntry(
          "p1",
          "StageCompleted",
          "REQUIREMENTS done",
          "REQUIREMENTS",
        ),
      );
      store.append(
        createAuditEntry("p2", "PipelineStarted", "Pipeline started"),
      );
      expect(store.getHistory("p1")).toHaveLength(2);
      expect(store.getHistory("p2")).toHaveLength(1);
      expect(store.count()).toBe(3);
    });

    it("includes stage and metadata", () => {
      store.append(
        createAuditEntry("p1", "StageFailed", "LUA failed", "LUA_GENERATION", {
          error: "timeout",
        }),
      );
      const entries = store.getHistory("p1");
      expect(entries[0].stage).toBe("LUA_GENERATION");
      expect(entries[0].metadata).toEqual({ error: "timeout" });
    });
  });

  describe("PipelineMetricsCollector", () => {
    let collector: PipelineMetricsCollector;

    beforeEach(() => {
      collector = new PipelineMetricsCollector();
    });

    it("tracks pipeline lifecycle", () => {
      collector.start("p1", 11);
      collector.stageCompleted("p1", 100);
      collector.stageCompleted("p1", 200);
      collector.stageFailed("p1");
      collector.finish("p1");

      const m = collector.get("p1");
      expect(m).not.toBeNull();
      expect(m!.stagesCompleted).toBe(2);
      expect(m!.failures).toBe(1);
      expect(m!.stagesTotal).toBe(11);
      expect(m!.duration).toBeGreaterThanOrEqual(0);
      expect(m!.finishedAt).toBeDefined();
    });

    it("tracks tokens and cost", () => {
      collector.start("p1", 5);
      collector.addTokens("p1", 1500, 0.003);
      collector.addTokens("p1", 2000, 0.004);
      const m = collector.get("p1");
      expect(m!.tokenUsage).toBe(3500);
      expect(m!.aiCost).toBeCloseTo(0.007);
    });

    it("tracks retries", () => {
      collector.start("p1", 5);
      collector.retried("p1");
      collector.retried("p1");
      expect(collector.get("p1")!.retryCount).toBe(2);
    });

    it("returns null for unknown pipeline", () => {
      expect(collector.get("unknown")).toBeNull();
    });
  });
});
