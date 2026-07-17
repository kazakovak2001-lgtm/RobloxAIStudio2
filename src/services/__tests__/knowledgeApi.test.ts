/**
 * Unit tests for knowledgeApi.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getPatterns,
  getPrompts,
  searchKnowledge,
  getRecommendations,
} from "../knowledgeApi";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("knowledgeApi", () => {
  describe("getPatterns", () => {
    it("fetches all patterns without filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: "p1", type: "quest", name: "Quest System" }],
        }),
      });
      const result = await getPatterns();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith("/api/knowledge/patterns");
    });

    it("passes type filter as query param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
      await getPatterns("combat");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/patterns?type=combat",
      );
    });

    it("handles errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));
      const result = await getPatterns();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Network failure");
    });
  });

  describe("getPrompts", () => {
    it("fetches prompts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ id: "pr1" }], stats: {} }),
      });
      const result = await getPrompts();
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("/api/knowledge/prompts");
    });

    it("passes agent filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
      await getPrompts("CodeGenerator");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/prompts?agent=CodeGenerator",
      );
    });
  });

  describe("searchKnowledge", () => {
    it("builds query params correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
      await searchKnowledge("tycoon", ["mining", "pets"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/search?genre=tycoon&systems=mining%2Cpets",
      );
    });
  });

  describe("getRecommendations", () => {
    it("fetches recommendations for genre", async () => {
      const mockData = {
        similarProjects: [],
        recommendedPatterns: [],
        bestPrompts: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });
      const result = await getRecommendations("adventure");
      expect(result.success).toBe(true);
      expect(result.data?.similarProjects).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/recommend?genre=adventure",
      );
    });
  });
});
