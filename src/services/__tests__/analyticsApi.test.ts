/**
 * Unit tests for analyticsApi.ts
 * Tests API call behavior, error handling, and data mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSystemHealth,
  getAgentSummaries,
  getFailurePatterns,
  getOptimizationSuggestions,
  triggerAnalyticsCycle,
} from "../analyticsApi";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analyticsApi", () => {
  describe("getSystemHealth", () => {
    it("returns system health data on success", async () => {
      const mockData = {
        overallScore: 85,
        agentHealth: 90,
        pipelineHealth: 80,
        memoryHealth: 75,
        failureRate: 0.05,
        averageExecutionScore: 88,
        activePatterns: 3,
        suggestions: 2,
        timestamp: Date.now(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await getSystemHealth();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith("/api/analytics/system");
    });

    it("returns error on HTTP failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal error" }),
      });

      const result = await getSystemHealth();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Internal error");
    });

    it("returns error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network unreachable"));

      const result = await getSystemHealth();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Network unreachable");
    });
  });

  describe("getAgentSummaries", () => {
    it("returns agent data on success", async () => {
      const mockData = {
        count: 2,
        agents: [
          {
            agent: "CodeGenerator",
            totalExecutions: 50,
            successRate: 0.94,
            averageScore: 85,
            averageDurationMs: 1200,
            minScore: 60,
            maxScore: 100,
            failureCount: 3,
            trend: "improving" as const,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await getAgentSummaries();
      expect(result.success).toBe(true);
      expect(result.data?.agents).toHaveLength(1);
      expect(result.data?.agents[0].agent).toBe("CodeGenerator");
    });
  });

  describe("getFailurePatterns", () => {
    it("passes severity filter as query param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { count: 0, patterns: [] } }),
      });

      await getFailurePatterns("critical");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/analytics/patterns?severity=critical",
      );
    });

    it("omits query param when no severity specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { count: 0, patterns: [] } }),
      });

      await getFailurePatterns();
      expect(mockFetch).toHaveBeenCalledWith("/api/analytics/patterns");
    });
  });

  describe("getOptimizationSuggestions", () => {
    it("returns suggestions on success", async () => {
      const mockData = {
        count: 1,
        suggestions: [
          {
            id: "sug-1",
            type: "parallelize",
            priority: "high" as const,
            description: "Parallelize agent execution",
            expectedImprovement: "30% faster",
            affectedNodes: ["node-1"],
            confidence: 0.85,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await getOptimizationSuggestions();
      expect(result.success).toBe(true);
      expect(result.data?.suggestions[0].priority).toBe("high");
      expect(result.data?.suggestions[0].confidence).toBe(0.85);
    });
  });

  describe("triggerAnalyticsCycle", () => {
    it("sends POST request and returns cycle results", async () => {
      const mockData = {
        ingested: 10,
        agentsAnalyzed: 5,
        patternsDetected: 2,
        signalsGenerated: 3,
        suggestionsCreated: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const result = await triggerAnalyticsCycle();
      expect(result.success).toBe(true);
      expect(result.data?.ingested).toBe(10);
      expect(mockFetch).toHaveBeenCalledWith("/api/analytics/cycle", {
        method: "POST",
      });
    });
  });
});
