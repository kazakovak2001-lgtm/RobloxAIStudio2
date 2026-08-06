import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioRuntime } from "../../studio/v2/StudioRuntime";
import { createStudioRouter } from "../studio";

describe("Studio sync REST and protocol integration", () => {
  let runtime: StudioRuntime;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    runtime = new StudioRuntime();
    const access = {
      hasProjectAccess: async () => true,
      requireProjectAccess: async () => true,
    } as never;
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    app.use("/api/studio", createStudioRouter(runtime, access));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}/api/studio`;
  });

  afterEach(async () => {
    runtime.stopTimeoutMonitor();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const protocol = (type: string, payload: Record<string, unknown>) =>
    post("/protocol/message", {
      protocolVersion: "1.0.0",
      messageId: `message-${type}-${Math.random()}`,
      sessionId: "session-sync-integration",
      type,
      command: type.toLowerCase(),
      timestamp: Date.now(),
      direction: "client_to_server",
      payload,
    });

  it("returns project snapshots and secure project-scoped status", async () => {
    const artifact = await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "print('a')",
    );

    const snapshotResponse = await post("/sync/project", {
      projectId: "project-a",
    });
    expect(snapshotResponse.status).toBe(200);
    await expect(snapshotResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        projectId: "project-a",
        artifactCount: 1,
        artifacts: [{ id: artifact.id }],
      },
    });

    const statusResponse = await fetch(
      `${baseUrl}/sync/status?projectId=project-a`,
    );
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      success: true,
      data: { projectId: "project-a" },
    });

    const unscopedStatus = await fetch(`${baseUrl}/sync/status`);
    expect(unscopedStatus.status).toBe(400);
  });

  it("returns 400 and 404 for invalid or unavailable project snapshots", async () => {
    expect((await post("/sync/project", {})).status).toBe(400);
    expect(
      (await post("/sync/project", { projectId: "missing-project" })).status,
    ).toBe(404);
  });

  it("transfers only artifacts belonging to the authorized project", async () => {
    const own = await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "print('own')",
    );
    const foreign = await runtime.artifacts.store(
      "project-b",
      "LUA_GENERATION",
      null,
      "print('foreign')",
    );

    const response = await post("/sync/artifacts", {
      projectId: "project-a",
      artifactIds: [own.id, foreign.id, "unknown-id"],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        artifacts: [{ id: own.id }],
        missing: expect.arrayContaining([foreign.id, "unknown-id"]),
      },
    });
  });

  it("returns 400 for empty artifact IDs and 413 for oversized transfer", async () => {
    expect(
      (
        await post("/sync/artifacts", {
          projectId: "project-a",
          artifactIds: [],
        })
      ).status,
    ).toBe(400);

    const large = await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "x".repeat(1_048_576),
    );
    const oversized = await post("/sync/artifacts", {
      projectId: "project-a",
      artifactIds: [large.id],
    });
    expect(oversized.status).toBe(413);
  });

  it("dispatches all four project-bound sync protocol messages", async () => {
    const artifact = await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "print('before')",
    );

    const getProject = await protocol("GET_PROJECT", {
      projectId: "project-a",
    });
    await expect(getProject.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { artifactCount: 1 } },
    });

    const getArtifacts = await protocol("GET_ARTIFACTS", {
      projectId: "project-a",
      artifactIds: [artifact.id],
    });
    await expect(getArtifacts.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { artifacts: [{ id: artifact.id }] } },
    });

    const change = {
      changeId: "change-protocol",
      artifactId: artifact.id,
      artifactType: "lua",
      changeType: "update",
      content: "print('after')",
      timestamp: artifact.createdAt + 1,
    };
    const validate = await protocol("VALIDATE", {
      projectId: "project-a",
      changes: [change],
    });
    await expect(validate.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { valid: true, validatedCount: 1 } },
    });

    const sync = await protocol("SYNC_REQUEST", {
      projectId: "project-a",
      changes: [change],
    });
    await expect(sync.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { status: "applied" } },
    });
  });

  it("resolves a distinct active execution before the first export", async () => {
    const projectId = "project-distinct";
    const executionId = "execution-distinct";
    runtime.activateProjectExecution(projectId, executionId);
    const artifact = await runtime.artifacts.store(
      executionId,
      "LUA_GENERATION",
      null,
      "print('before export')",
    );

    const snapshot = await post("/sync/project", { projectId });
    expect(snapshot.status).toBe(200);
    await expect(snapshot.json()).resolves.toMatchObject({
      success: true,
      data: {
        projectId: executionId,
        artifacts: [{ id: artifact.id }],
      },
    });

    const change = {
      changeId: "change-before-export",
      artifactId: artifact.id,
      artifactType: "lua",
      changeType: "update",
      content: "print('updated before export')",
      timestamp: artifact.createdAt + 1,
    };
    const validation = await protocol("VALIDATE", {
      projectId,
      changes: [change],
    });
    await expect(validation.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { valid: true } },
    });

    const sync = await protocol("SYNC_REQUEST", {
      projectId,
      changes: [change],
    });
    await expect(sync.json()).resolves.toMatchObject({
      success: true,
      data: { status: "ok", payload: { status: "applied" } },
    });
  });

  it("rejects malformed sync changes before runtime delegation", async () => {
    await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "print('before')",
    );

    for (const type of ["VALIDATE", "SYNC_REQUEST"]) {
      const response = await protocol(type, {
        projectId: "project-a",
        changes: [{ changeId: "incomplete-change" }],
      });
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        data: {
          status: "error",
          error: expect.stringMatching(/artifactId/),
        },
      });
    }
  });

  it("fails closed for unsupported create/delete mutations", async () => {
    const artifact = await runtime.artifacts.store(
      "project-a",
      "LUA_GENERATION",
      null,
      "print('before')",
    );
    const response = await protocol("SYNC_REQUEST", {
      projectId: "project-a",
      changes: [
        {
          changeId: "delete-unsupported",
          artifactId: artifact.id,
          artifactType: "lua",
          changeType: "delete",
          content: null,
          timestamp: artifact.createdAt + 1,
        },
      ],
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        status: "error",
        payload: {
          status: "error",
          errors: [expect.stringMatching(/not supported/)],
        },
      },
    });
    expect(runtime.artifacts.getById(artifact.id)).not.toBeNull();
  });
});
