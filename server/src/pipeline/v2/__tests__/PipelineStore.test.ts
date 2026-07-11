import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryPipelineStore } from "../store/InMemoryPipelineStore";
import { createPipelineState } from "../PipelineStage";

describe("PipelineStore", () => {
  let store: InMemoryPipelineStore;

  beforeEach(() => {
    store = new InMemoryPipelineStore();
  });

  describe("basic operations", () => {
    it("saves and retrieves a pipeline state", () => {
      const state = createPipelineState("project-1");
      store.save(state);
      const retrieved = store.get(state.pipelineId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.projectId).toBe("project-1");
    });

    it("returns null for non-existent pipeline", () => {
      expect(store.get("nonexistent")).toBeNull();
    });

    it("counts stored pipelines", () => {
      expect(store.count()).toBe(0);
      store.save(createPipelineState("p1"));
      store.save(createPipelineState("p2"));
      expect(store.count()).toBe(2);
    });

    it("deletes a pipeline", () => {
      const state = createPipelineState("p1");
      store.save(state);
      expect(store.delete(state.pipelineId)).toBe(true);
      expect(store.get(state.pipelineId)).toBeNull();
    });

    it("getAll returns all states", () => {
      store.save(createPipelineState("p1"));
      store.save(createPipelineState("p2"));
      store.save(createPipelineState("p3"));
      expect(store.getAll()).toHaveLength(3);
    });
  });

  describe("server restart recovery", () => {
    it("marks running pipelines as interrupted", () => {
      const running = createPipelineState("p1");
      running.status = "running";
      running.currentStage = "GAME_DESIGN";
      running.stages[2].status = "running"; // GAME_DESIGN is index 2

      const completed = createPipelineState("p2");
      completed.status = "completed";

      store.save(running);
      store.save(completed);

      const count = store.markInterrupted();
      expect(count).toBe(1);

      const recovered = store.get(running.pipelineId);
      expect(recovered!.status).toBe("failed");
      expect(recovered!.finishedAt).toBeDefined();
      expect(recovered!.stages[2].status).toBe("failed");
      expect(recovered!.stages[2].error).toContain("Interrupted");

      // Completed pipeline should be unchanged
      const unchanged = store.get(completed.pipelineId);
      expect(unchanged!.status).toBe("completed");
    });

    it("does not mark non-running pipelines", () => {
      const failed = createPipelineState("p1");
      failed.status = "failed";
      const paused = createPipelineState("p2");
      paused.status = "paused";

      store.save(failed);
      store.save(paused);

      const count = store.markInterrupted();
      expect(count).toBe(0);
    });
  });

  describe("failed stage recovery", () => {
    it("preserves error information in failed stages", () => {
      const state = createPipelineState("p1");
      state.status = "failed";
      state.stages[3].status = "failed";
      state.stages[3].error = "LLM timeout after 30s";
      state.failedStages.push("ARCHITECTURE");

      store.save(state);

      const retrieved = store.get(state.pipelineId);
      expect(retrieved!.status).toBe("failed");
      expect(retrieved!.stages[3].error).toBe("LLM timeout after 30s");
      expect(retrieved!.failedStages).toContain("ARCHITECTURE");
    });
  });

  describe("duplicate execution prevention", () => {
    it("getByStatus finds running pipelines for a project", () => {
      const state1 = createPipelineState("project-x");
      state1.status = "running";
      const state2 = createPipelineState("project-y");
      state2.status = "completed";

      store.save(state1);
      store.save(state2);

      const running = store.getByStatus("running");
      expect(running).toHaveLength(1);
      expect(running[0].projectId).toBe("project-x");
    });

    it("has() correctly reports existence", () => {
      const state = createPipelineState("p1");
      store.save(state);
      expect(store.has(state.pipelineId)).toBe(true);
      expect(store.has("fake-id")).toBe(false);
    });
  });
});
