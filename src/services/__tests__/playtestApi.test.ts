/**
 * Unit tests for playtestApi.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPlaytest, getPlaytestReport } from "../playtestApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("playtestApi", () => {
  describe("runPlaytest", () => {
    it("sends playtest request and returns report", async () => {
      const mockReport = {
        projectId: "proj-1",
        generatedAt: Date.now(),
        overallScore: 85,
        classification: "production_ready",
        scores: {
          architecture: 90,
          lua: 85,
          assets: 80,
          dependencies: 90,
          gameplay: 80,
          performance: 90,
        },
        systemScores: [],
        issues: [],
        performance: {
          scriptCount: 3,
          assetCount: 2,
          dependencyDepth: 1,
          remoteEventCount: 1,
          estimatedInitTimeMs: 250,
          riskAreas: [],
        },
        recommendations: [],
        summary: "Production Ready (85/100)",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockReport }),
      });

      const result = await runPlaytest({
        projectId: "proj-1",
        scripts: [
          {
            name: "main.lua",
            type: "server",
            path: "SSS/main",
            content: "print('hi')",
            dependencies: [],
          },
        ],
        assets: [],
      });
      expect(result.success).toBe(true);
      expect(result.data?.overallScore).toBe(85);
      expect(result.data?.classification).toBe("production_ready");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/playtest/run",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "projectId is required" }),
      });
      const result = await runPlaytest({
        projectId: "",
        scripts: [],
        assets: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("projectId is required");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection lost"));
      const result = await runPlaytest({
        projectId: "test",
        scripts: [],
        assets: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection lost");
    });
  });

  describe("getPlaytestReport", () => {
    it("fetches existing report", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { projectId: "proj-1", overallScore: 72 },
        }),
      });
      const result = await getPlaytestReport("proj-1");
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("/api/playtest/proj-1");
    });

    it("returns error when not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "No playtest report found" }),
      });
      const result = await getPlaytestReport("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("No playtest report found");
    });
  });
});
