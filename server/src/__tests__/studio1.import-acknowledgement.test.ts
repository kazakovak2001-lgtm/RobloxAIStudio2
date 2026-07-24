import { describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { StudioRuntime } from "../studio/v2/StudioRuntime";

function createQueuedExport() {
  const runtime = new StudioRuntime({
    storage: new InMemoryStorageProvider(),
  });
  const projectId = "project-import-ack";
  const executionId = "execution-import-ack";

  runtime.artifacts.store(executionId, "LUA_GENERATION", "lua_generator", {
    scripts: [
      {
        path: "ServerScriptService/Main.server.lua",
        content: "return { imported = true }",
      },
    ],
  });
  runtime.artifacts.store(executionId, "EXPORT", "orchestrator", {
    manifest: { scripts: 1 },
  });

  const client = runtime.bridge.connect("0.650", projectId);
  runtime.sessions.create(client);
  const queued = runtime.queueProjectExport(
    client.clientId,
    projectId,
    executionId,
  );
  expect(queued.success).toBe(true);
  if (!queued.success || !queued.data.command) {
    throw new Error("Expected an EXPORT_PROJECT command");
  }

  const receipts = queued.data.snapshot.artifacts.map((artifact) => ({
    artifactId: artifact.id,
    hash: artifact.hash,
    instancePath: `game/${artifact.name}`,
  }));

  return {
    runtime,
    projectId,
    executionId,
    clientId: client.clientId,
    commandId: queued.data.command.id,
    receipts,
  };
}

describe("STUDIO-1c import acknowledgement", () => {
  it("verifies an import only after polling, acknowledgement, and exact receipts", () => {
    const { runtime, projectId, executionId, clientId, commandId, receipts } =
      createQueuedExport();

    expect(runtime.getCommand(commandId)).toMatchObject({
      status: "sent",
    });
    expect(runtime.getCommand(commandId)?.deliveredAt).toBeUndefined();
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "queued",
    });
    expect(
      runtime.sessions.getByClient(clientId)?.lastSyncAt,
    ).toBeUndefined();

    expect(runtime.drainCommands(clientId)).toHaveLength(1);
    expect(runtime.getCommand(commandId)).toMatchObject({
      status: "sent",
      deliveredAt: expect.any(Number),
    });
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "delivered",
    });
    expect(
      runtime.sessions.getByClient(clientId)?.lastSyncAt,
    ).toBeUndefined();

    const acknowledged = runtime.acknowledgeProjectExport(clientId, commandId);
    expect(acknowledged).toMatchObject({
      success: true,
      verified: false,
      command: { status: "acknowledged" },
    });
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "acknowledged",
    });
    expect(
      runtime.sessions.getByClient(clientId)?.lastSyncAt,
    ).toBeUndefined();

    const completed = runtime.reportProjectExport(clientId, commandId, {
      status: "completed",
      executionId,
      artifacts: receipts,
      reportedAt: Date.now(),
    });
    expect(completed).toMatchObject({
      success: true,
      verified: true,
      command: {
        status: "completed",
        result: {
          status: "completed",
          executionId,
          artifacts: receipts,
        },
      },
    });
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "verified",
      verifiedExecutionId: executionId,
      verifiedArtifactCount: receipts.length,
      lastSyncAt: expect.any(Number),
      lastVerifiedAt: expect.any(Number),
    });

    const events = runtime.bridge.events.getHistory();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "export.started",
          clientId,
          projectId,
          data: expect.objectContaining({ commandId, executionId }),
        }),
        expect.objectContaining({
          type: "export.completed",
          clientId,
          projectId,
          data: expect.objectContaining({
            commandId,
            executionId,
            artifactCount: receipts.length,
          }),
        }),
      ]),
    );
  });

  it("fails verification on a hash mismatch and permits a fresh retry", () => {
    const { runtime, executionId, projectId, clientId, commandId, receipts } =
      createQueuedExport();

    runtime.drainCommands(clientId);
    expect(runtime.acknowledgeProjectExport(clientId, commandId).success).toBe(
      true,
    );

    const mismatched = receipts.map((receipt, index) =>
      index === 0 ? { ...receipt, hash: "incorrect-hash" } : receipt,
    );
    const result = runtime.reportProjectExport(clientId, commandId, {
      status: "completed",
      executionId,
      artifacts: mismatched,
    });

    expect(result).toMatchObject({
      success: false,
      reason: "verification_failed",
      command: { status: "failed" },
    });
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "failed",
      verificationError: expect.stringContaining("hash mismatch"),
    });
    expect(
      runtime.sessions.getByClient(clientId)?.lastSyncAt,
    ).toBeUndefined();
    expect(runtime.bridge.events.getHistory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "export.failed",
          clientId,
          projectId,
        }),
      ]),
    );

    const retry = runtime.queueProjectExport(clientId, projectId, executionId);
    expect(retry.success).toBe(true);
    if (!retry.success) return;
    expect(retry.data.noChanges).toBe(false);
    expect(retry.data.command?.id).not.toBe(commandId);
    expect(runtime.bridge.getPendingCommandCount(clientId)).toBe(1);
  });

  it("records an explicit plugin import failure without verification", () => {
    const { runtime, executionId, clientId, commandId } = createQueuedExport();

    runtime.drainCommands(clientId);
    runtime.acknowledgeProjectExport(clientId, commandId);
    const result = runtime.reportProjectExport(clientId, commandId, {
      status: "failed",
      executionId,
      artifacts: [],
      error: "Roblox instance creation failed",
    });

    expect(result).toMatchObject({
      success: true,
      verified: false,
      command: {
        status: "failed",
        error: "Roblox instance creation failed",
      },
    });
    expect(runtime.sessions.getByClient(clientId)).toMatchObject({
      verificationStatus: "failed",
      verificationError: "Roblox instance creation failed",
    });
    expect(
      runtime.sessions.getByClient(clientId)?.lastSyncAt,
    ).toBeUndefined();
  });

  it("rejects wrong clients and invalid lifecycle ordering", () => {
    const { runtime, executionId, projectId, clientId, commandId, receipts } =
      createQueuedExport();
    const otherClient = runtime.bridge.connect("0.650", projectId);
    runtime.sessions.create(otherClient);

    expect(
      runtime.acknowledgeProjectExport(otherClient.clientId, commandId),
    ).toMatchObject({ success: false, reason: "client_mismatch" });
    expect(runtime.acknowledgeProjectExport(clientId, commandId)).toMatchObject(
      {
        success: false,
        reason: "not_delivered",
      },
    );

    runtime.drainCommands(clientId);
    expect(
      runtime.reportProjectExport(clientId, commandId, {
        status: "completed",
        executionId,
        artifacts: receipts,
      }),
    ).toMatchObject({ success: false, reason: "invalid_status" });

    expect(runtime.acknowledgeProjectExport(clientId, commandId).success).toBe(
      true,
    );
    expect(runtime.acknowledgeProjectExport(clientId, commandId)).toMatchObject(
      {
        success: true,
        command: { status: "acknowledged" },
      },
    );
  });
});
