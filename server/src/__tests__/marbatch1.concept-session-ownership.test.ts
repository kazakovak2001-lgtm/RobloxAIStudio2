/**
 * SEC-MAR001-REMAINING-GAPS-001 (session-owned-concept).
 *
 * `/api/concept/experience/generate` runs a pipeline keyed by conceptId in
 * the slot `PipelineEngine` calls `projectId`. Every other `:pipelineId` /
 * `:artifactId` route in this router ran that id through
 * `concealProjectAccess`, which checked it against the SaaS project
 * repository — the wrong store, since a concept's owner lives in
 * `conceptOwners`, keyed by user, not in `projectRepository`, keyed by
 * project. Nothing canonical protected these operations for another tenant.
 *
 * These tests drive the real router end to end: create a concept, run its
 * pipeline, then prove a second user is refused every pipeline-scoped
 * operation while the owner is still admitted.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createConceptRouter } from "../routes/concept";
import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { GenerationHistoryRepository } from "../projects/repository/generationHistory.repository";
import type { ProjectAccessControl } from "../routes/projects";

const OWNER = { token: "token-owner", userId: "user-owner" };
const OTHER = { token: "token-other", userId: "user-other" };

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
});

function fakeAgentRegistry(): AgentRegistry {
  return {
    executeAgent: async () => ({ success: true, output: {} }),
  } as unknown as AgentRegistry;
}

function fakeGenerationHistory(): GenerationHistoryRepository {
  return {
    record: async () => {},
    getByProject: () => [],
    getByPipeline: () => null,
    getAll: () => [],
  };
}

function fakeAccess(): ProjectAccessControl {
  const tokenToUser = (req: express.Request): string | null => {
    const auth = req.headers.authorization;
    if (!auth) return null;
    const token = auth.replace("Bearer ", "");
    if (token === OWNER.token) return OWNER.userId;
    if (token === OTHER.token) return OTHER.userId;
    return null;
  };
  return {
    getRequestUserId: async (req) => tokenToUser(req),
    requireAuthenticatedUser: async (req, res) => {
      const userId = tokenToUser(req);
      if (userId) return userId;
      res
        .status(401)
        .json({ success: false, error: "Authentication required" });
      return null;
    },
    // No SaaS project will ever match a conceptId, so a control that reaches
    // this path for a concept-run pipeline denies it — proving the fix must
    // route concept-owned pipelines through conceptOwners instead.
    requireProjectAccess: async (_req, res) => {
      res.status(404).json({ success: false, error: "Pipeline not found" });
      return false;
    },
    hasProjectAccess: async () => false,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const router = createConceptRouter(
    fakeAgentRegistry(),
    fakeGenerationHistory(),
    fakeAccess(),
  );
  app.use("/api/concept", router);
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function asUser(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function createOwnedPipeline(base: string) {
  const generate = await asUser(
    base,
    OWNER.token,
    "POST",
    "/api/concept/generate",
    {
      gameDescription: "A cozy farming adventure with friends",
    },
  );
  const conceptId = (generate.body as { data: { conceptId: string } }).data
    .conceptId;

  const run = await asUser(
    base,
    OWNER.token,
    "POST",
    "/api/concept/experience/generate",
    { conceptId },
  );
  const pipelineId = (run.body as { data: { pipelineId: string } }).data
    .pipelineId;
  return pipelineId;
}

describe("SEC-MAR001-REMAINING-GAPS-001 session-owned-concept pipelines", () => {
  it("refuses another user's status/pause/resume/cancel/retry/artifacts on a concept-run pipeline", async () => {
    const base = await startServer();
    const pipelineId = await createOwnedPipeline(base);

    const status = await asUser(
      base,
      OTHER.token,
      "GET",
      `/api/concept/experience/status/${pipelineId}`,
    );
    expect(status.status).toBe(404);

    const pause = await asUser(
      base,
      OTHER.token,
      "POST",
      `/api/concept/experience/${pipelineId}/pause`,
    );
    expect(pause.status).toBe(404);

    const cancel = await asUser(
      base,
      OTHER.token,
      "POST",
      `/api/concept/experience/${pipelineId}/cancel`,
    );
    expect(cancel.status).toBe(404);

    const retry = await asUser(
      base,
      OTHER.token,
      "POST",
      `/api/concept/experience/${pipelineId}/retry`,
    );
    expect(retry.status).toBe(404);

    const artifacts = await asUser(
      base,
      OTHER.token,
      "GET",
      `/api/concept/experience/${pipelineId}/artifacts`,
    );
    expect(artifacts.status).toBe(404);

    const review = await asUser(
      base,
      OTHER.token,
      "GET",
      `/api/concept/experience/${pipelineId}/review`,
    );
    expect(review.status).toBe(404);
  });

  it("still admits the owner to the same operations", async () => {
    const base = await startServer();
    const pipelineId = await createOwnedPipeline(base);

    const status = await asUser(
      base,
      OWNER.token,
      "GET",
      `/api/concept/experience/status/${pipelineId}`,
    );
    expect(status.status).toBe(200);

    const artifacts = await asUser(
      base,
      OWNER.token,
      "GET",
      `/api/concept/experience/${pipelineId}/artifacts`,
    );
    expect(artifacts.status).toBe(200);
  });

  it("excludes a concept-run pipeline from a foreign caller's history", async () => {
    const base = await startServer();
    await createOwnedPipeline(base);

    const history = await asUser(
      base,
      OTHER.token,
      "GET",
      "/api/concept/experience/history",
    );
    expect(history.status).toBe(200);
    expect(
      (history.body as { data: Array<{ pipelineId: string }> }).data,
    ).toEqual([]);
  });
});
