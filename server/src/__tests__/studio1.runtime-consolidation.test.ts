import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import {
  getSharedStudioRuntime,
  resetSharedStudioRuntimeForTests,
  StudioRuntime,
} from "../studio/v2/StudioRuntime";

afterEach(() => {
  resetSharedStudioRuntimeForTests();
});

describe("STUDIO-1b shared Studio runtime", () => {
  it("queues and delivers real execution artifacts through one runtime", async () => {
    const runtime = new StudioRuntime({
      storage: new InMemoryStorageProvider(),
    });
    const projectId = "project-studio-runtime";
    const executionId = "exec-studio-runtime";
    const luaOutput = {
      scripts: [
        {
          path: "ServerScriptService/Main.server.lua",
          content: "return { generated = true }",
        },
      ],
    };

    runtime.artifacts.store(
      executionId,
      "LUA_GENERATION",
      "lua_generator",
      luaOutput,
      { projectId },
    );
    runtime.artifacts.store(
      executionId,
      "EXPORT",
      "orchestrator",
      {
        manifest: { scripts: 1 },
      },
      { projectId },
    );

    const client = runtime.bridge.connect("0.650", projectId);
    runtime.sessions.create(client);

    const queued = await runtime.queueProjectExport(
      client.clientId,
      projectId,
      executionId,
    );
    expect(queued.success).toBe(true);
    if (!queued.success) return;

    expect(queued.data.command).not.toBeNull();
    expect(queued.data.noChanges).toBe(false);
    expect(runtime.bridge.getPendingCommandCount(client.clientId)).toBe(1);
    expect(runtime.getProjectSnapshot(projectId)?.artifactCount).toBe(2);
    expect(runtime.sessions.getByClient(client.clientId)).toMatchObject({
      syncCount: 1,
      lastExecutionId: executionId,
      lastArtifactCount: 2,
      verificationStatus: "queued",
    });
    expect(
      runtime.sessions.getByClient(client.clientId)?.lastSyncAt,
    ).toBeUndefined();

    const repeated = await runtime.queueProjectExport(
      client.clientId,
      projectId,
      executionId,
    );
    expect(repeated.success).toBe(true);
    if (!repeated.success) return;
    expect(repeated.data.noChanges).toBe(true);
    expect(repeated.data.command).toBeNull();
    expect(repeated.data.transfer.artifacts).toEqual([]);
    expect(await runtime.getProjectEvidence(projectId)).toMatchObject({
      version: 2,
      syncCount: 2,
      verificationStatus: "queued",
    });
    expect(runtime.bridge.getPendingCommandCount(client.clientId)).toBe(1);

    const commands = await runtime.drainCommands(client.clientId);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "EXPORT_PROJECT",
      clientId: client.clientId,
      payload: {
        projectId,
        executionId,
      },
    });
    const serializedPayload = JSON.stringify(commands[0]?.payload);
    expect(serializedPayload).toContain("return { generated = true }");
    expect(serializedPayload).not.toContain("studio-sync-fallback");
    expect(serializedPayload).not.toContain("placeholder script");
    expect(runtime.bridge.getPendingCommandCount(client.clientId)).toBe(0);
    expect(runtime.sessions.getByClient(client.clientId)).toMatchObject({
      verificationStatus: "delivered",
      lastExecutionId: executionId,
      lastArtifactCount: 2,
    });
    expect(
      runtime.sessions.getByClient(client.clientId)?.lastSyncAt,
    ).toBeUndefined();
  });

  it("rejects disconnected, mismatched, and artifact-free exports", async () => {
    const runtime = new StudioRuntime({
      storage: new InMemoryStorageProvider(),
    });
    const client = runtime.bridge.connect("0.650", "project-a");
    runtime.sessions.create(client);

    expect(
      await runtime.queueProjectExport(
        client.clientId,
        "project-b",
        "exec-missing",
      ),
    ).toMatchObject({ success: false, reason: "project_mismatch" });
    expect(
      await runtime.queueProjectExport(
        client.clientId,
        "project-a",
        "exec-missing",
      ),
    ).toMatchObject({ success: false, reason: "no_artifacts" });

    runtime.bridge.disconnect(client.clientId);
    expect(
      await runtime.queueProjectExport(
        client.clientId,
        "project-a",
        "exec-missing",
      ),
    ).toMatchObject({ success: false, reason: "client_not_found" });
  });

  it("exposes the same sessions and artifacts through the compatibility facade", async () => {
    const manager = new StudioIntegrationManager();
    const runtime = getSharedStudioRuntime();
    const projectId = "project-shared-facade";
    const executionId = "exec-shared-facade";

    manager.connect("studio-shared", projectId);
    runtime.artifacts.store(
      executionId,
      "LUA_GENERATION",
      "lua_generator",
      {
        scripts: [
          {
            path: "ReplicatedStorage/Shared/Config.lua",
            content: "return { shared = true }",
          },
        ],
      },
      { projectId },
    );

    const result = await manager.synchronizeExecution(
      "studio-shared",
      projectId,
      executionId,
    );
    expect(result.success).toBe(true);
    expect(manager.getArtifactCount(executionId)).toBe(1);
    expect(manager.getPendingCommandCount("studio-shared")).toBe(1);
    expect(
      (await runtime.drainCommands("studio-shared"))[0]?.payload,
    ).toMatchObject({
      projectId,
      executionId,
    });
    expect(manager.getSession("studio-shared")).toMatchObject({
      artifactVerified: false,
      verificationStatus: "delivered",
      lastSyncAt: undefined,
    });
  });
});
