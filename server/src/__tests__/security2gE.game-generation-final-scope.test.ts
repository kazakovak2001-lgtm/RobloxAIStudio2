import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("server/src/routes/game-generation.ts", "utf8");
const streaming = fs.readFileSync("server/src/socket/streaming.ts", "utf8");
const matrix = JSON.parse(
  fs.readFileSync("config/security/authorization-matrix.json", "utf8"),
) as {
  operations: Array<{
    source: string;
    operation: string;
    classification: string;
    principal: string;
    capability: string;
    resourceScope: string;
  }>;
};

describe("SECURITY-2G-E final game generation scope", () => {
  it("requires project ownership before registering the SSE client", () => {
    const handler = route.slice(route.indexOf('router.get("/generation/stream"'));
    expect(handler).toContain('error: "projectId is required"');
    expect(handler).toContain("access.requireProjectAccess(req, res, projectId)");
    expect(handler.indexOf("requireProjectAccess")).toBeLessThan(
      handler.indexOf("registerClient"),
    );
    expect(handler).toContain("registerClient(clientId, projectId, res)");
  });

  it("scopes streaming clients and broadcasts by project", () => {
    expect(streaming).toContain(
      "new Map<string, { response: Response; projectId: string }>()",
    );
    expect(streaming).toContain(
      "registerClient(clientId: string, projectId: string, res: Response)",
    );
    expect(streaming).toContain("const projectId = filterProjectId ?? event.projectId");
    expect(streaming).toContain("if (!projectId) return");
    expect(streaming).toContain("if (client.projectId === projectId)");
  });

  it("requires a generation operator before returning global cache stats", () => {
    const handler = route.slice(route.indexOf('router.get("/system/cache-stats"'));
    expect(route).toContain("GENERATION_OPERATOR_USER_IDS");
    expect(handler).toContain("requireGenerationOperator(req, res)");
    expect(handler.indexOf("requireGenerationOperator")).toBeLessThan(
      handler.indexOf("getCacheStats"),
    );
  });

  it("classifies both remaining operations with complete evidence", () => {
    const stream = matrix.operations.find(
      (item) =>
        item.source === "server/src/routes/game-generation.ts" &&
        item.operation === "GET /generation/stream",
    );
    expect(stream).toMatchObject({
      classification: "project-owner",
      principal: "user-session",
      capability: "project.generation.stream.read",
      resourceScope: "query-project",
    });

    const cache = matrix.operations.find(
      (item) =>
        item.source === "server/src/routes/game-generation.ts" &&
        item.operation === "GET /system/cache-stats",
    );
    expect(cache).toMatchObject({
      classification: "generation-operator",
      principal: "user-session",
      capability: "system.generation.cache-stats.read",
      resourceScope: "global-generation-cache",
    });

    expect(
      matrix.operations.filter((item) => item.classification === "unclassified"),
    ).toHaveLength(0);
  });
});
