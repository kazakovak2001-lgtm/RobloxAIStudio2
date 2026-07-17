/**
 * Unit tests for economyApi.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeEconomy, simulateEconomy } from "../economyApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("economyApi", () => {
  describe("analyzeEconomy", () => {
    it("sends correct request and returns analysis data", async () => {
      const mockData = {
        model: { currency: "Gold", stability: 75, netFlow: 5.5 },
        simulation: { ticks: 200, finalBalance: 1200, growthRate: 45 },
        report: { healthScore: 70, imbalances: 2, critical: 0 },
        patch: { adjustments: 1, confidence: 0.8 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await analyzeEconomy({
        id: "bp-1",
        economy: { currency: "Gold", sources: ["quest"], sinks: ["shop"] },
      });
      expect(result.success).toBe(true);
      expect(result.data?.model.currency).toBe("Gold");
      expect(result.data?.report.healthScore).toBe(70);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/economy/analyze",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns error on server failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Blueprint required" }),
      });
      const result = await analyzeEconomy({ id: "" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Blueprint required");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Timeout"));
      const result = await analyzeEconomy({ id: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Timeout");
    });
  });

  describe("simulateEconomy", () => {
    it("sends simulation request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ticks: 200 } }),
      });
      const result = await simulateEconomy({ id: "bp-1" });
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/economy/simulate",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns error when simulation fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Economy simulation failed" }),
      });
      const result = await simulateEconomy({ id: "bp-1" });
      expect(result.success).toBe(false);
    });
  });
});
