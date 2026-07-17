/**
 * Unit tests for aiEngine.ts — generateLuaCode, runAgentPipeline, getActiveProvider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateLuaCode,
  runAgentPipeline,
  getActiveProvider,
} from "../aiEngine";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aiEngine", () => {
  describe("generateLuaCode", () => {
    it("sends correct request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            projectId: "ai-studio-session",
            gameName: "Mining Sim",
            genre: "adventure",
            scripts: [],
            totalScripts: 0,
            totalSizeBytes: 0,
            generationTimeMs: 100,
            validationPassed: true,
          },
        }),
      });

      await generateLuaCode({ prompt: "Mining Sim", genre: "adventure" });

      expect(mockFetch).toHaveBeenCalledWith("/api/lua/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gameName).toBe("Mining Sim");
      expect(body.genre).toBe("adventure");
      expect(body.projectId).toBe("ai-studio-session");
    });

    it("returns generated scripts on success", async () => {
      const mockScripts = [
        {
          name: "main.lua",
          path: "ServerScriptService/main.lua",
          content: "print('hello')",
          size: 14,
          type: "server",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            projectId: "test",
            gameName: "Test",
            genre: "adventure",
            scripts: mockScripts,
            totalScripts: 1,
            totalSizeBytes: 14,
            generationTimeMs: 250,
            validationPassed: true,
          },
        }),
      });

      const result = await generateLuaCode({ prompt: "Test" });
      expect(result.success).toBe(true);
      expect(result.data?.scripts).toHaveLength(1);
      expect(result.data?.scripts[0].content).toBe("print('hello')");
      expect(result.data?.validationPassed).toBe(true);
    });

    it("returns error on server failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "projectId and gameName required" }),
      });

      const result = await generateLuaCode({ prompt: "" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("projectId and gameName required");
    });

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

      const result = await generateLuaCode({ prompt: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to fetch");
    });

    it("uses custom projectId when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            scripts: [],
            totalScripts: 0,
            totalSizeBytes: 0,
            generationTimeMs: 0,
            validationPassed: true,
            projectId: "custom-id",
            gameName: "Test",
            genre: "adventure",
          },
        }),
      });

      await generateLuaCode({ prompt: "Test", projectId: "custom-id" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.projectId).toBe("custom-id");
    });
  });

  describe("getActiveProvider", () => {
    it("returns provider name on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ llm: "openai" }),
      });

      const result = await getActiveProvider();
      expect(result).toBe("openai");
    });

    it("returns 'stub' when llm is null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ llm: null }),
      });

      const result = await getActiveProvider();
      expect(result).toBe("stub");
    });

    it("returns 'unavailable' on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getActiveProvider();
      expect(result).toBe("unavailable");
    });
  });

  describe("runAgentPipeline", () => {
    it("returns pipelineId on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { pipelineId: "pipe-123", status: "running" },
        }),
      });

      const result = await runAgentPipeline("proj-1");
      expect(result.success).toBe(true);
      expect(result.pipelineId).toBe("pipe-123");
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Project not found" }),
      });

      const result = await runAgentPipeline("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Project not found");
    });
  });
});
