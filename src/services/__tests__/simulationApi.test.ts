/**
 * Unit tests for simulationApi.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runFullSimulation, getSimulationMetrics } from "../simulationApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("simulationApi", () => {
  describe("runFullSimulation", () => {
    it("sends correct request body", async () => {
      const mockData = {
        simulation: { ticks: 100, completed: true },
        report: {
          engagementScore: 75,
          issues: 2,
          suggestions: ["Add variety"],
        },
        metrics: {
          blueprintId: "bp-1",
          completionRate: 0.8,
          dropOffTick: null,
          loopEngagementScore: 80,
          economyStability: 60,
          npcInteractionFrequency: 1.5,
          mechanicsDiscoveryRate: 0.9,
          totalEvents: 50,
          averageEventsPerTick: 0.5,
          sessionLength: 100,
        },
        feedback: { grade: "B", shouldRegenerate: false, items: 2 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await runFullSimulation({
        id: "bp-1",
        mechanics: ["mine"],
        npcs: [],
      });
      expect(result.success).toBe(true);
      expect(result.data?.feedback.grade).toBe("B");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/simulate/game",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns error on server failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Blueprint with id required" }),
      });
      const result = await runFullSimulation({ id: "" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Blueprint with id required");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await runFullSimulation({ id: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection refused");
    });
  });

  describe("getSimulationMetrics", () => {
    it("fetches metrics by gameId", async () => {
      const mockMetrics = {
        blueprintId: "bp-1",
        completionRate: 1,
        dropOffTick: null,
        loopEngagementScore: 100,
        economyStability: 80,
        npcInteractionFrequency: 2,
        mechanicsDiscoveryRate: 1,
        totalEvents: 80,
        averageEventsPerTick: 0.8,
        sessionLength: 100,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockMetrics }),
      });

      const result = await getSimulationMetrics("bp-1");
      expect(result.success).toBe(true);
      expect(result.data?.completionRate).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith("/api/simulate/metrics/bp-1");
    });

    it("returns error when not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "No simulation data" }),
      });
      const result = await getSimulationMetrics("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("No simulation data");
    });
  });
});
