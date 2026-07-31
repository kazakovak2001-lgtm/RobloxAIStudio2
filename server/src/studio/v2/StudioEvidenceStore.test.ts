import { describe, expect, it } from "vitest";
import { StorageStudioEvidenceStore } from "../../platform/storage/OperationalStoreComposition";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../../platform/storage/StorageProvider";
import type { StudioOperationalEvidence } from "./StudioEvidenceStore";
import { StudioRuntime } from "./StudioRuntime";

function evidence(commandId: string, version = 1): StudioOperationalEvidence {
  return {
    command: {
      id: commandId,
      type: "EXPORT_PROJECT",
      payload: {
        projectId: "project-studio-evidence",
        executionId: "execution-studio-evidence",
      },
      timestamp: 100,
      status: "sent",
      clientId: "studio-evidence",
    },
    projectId: "project-studio-evidence",
    executionId: "execution-studio-evidence",
    artifactCount: 2,
    snapshotSignature: "artifact-a:hash-a|artifact-b:hash-b",
    version,
    syncCount: 1,
    verificationStatus: "queued",
    lastQueuedAt: 100,
  };
}

class RejectingStorage extends InMemoryStorageProvider {
  override async applyDurableBatch(
    _mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    throw new DurableStorageError("database unavailable", "transaction");
  }
}

describe("Studio operational evidence store", () => {
  it("recreates command and project evidence without reference leakage", async () => {
    const storage = new InMemoryStorageProvider();
    const first = new StorageStudioEvidenceStore(storage);
    const queued = evidence("command-recreated");

    expect(await first.saveTransition(queued, "queued")).toBe(true);
    queued.command.status = "failed";

    const recreated = new StorageStudioEvidenceStore(storage);
    expect(recreated.getCommand("command-recreated")).toMatchObject({
      command: { status: "sent" },
      verificationStatus: "queued",
      version: 1,
    });
    const read = recreated.getLatestByProject("project-studio-evidence");
    if (!read) throw new Error("Expected project evidence");
    read.command.status = "failed";
    expect(
      recreated.getLatestByProject("project-studio-evidence")?.command.status,
    ).toBe("sent");
  });

  it("has one cross-process winner for a project lifecycle version", async () => {
    const storage = new InMemoryStorageProvider();
    const first = new StorageStudioEvidenceStore(storage);
    const second = new StorageStudioEvidenceStore(storage);

    const [firstWon, secondWon] = await Promise.all([
      first.saveTransition(evidence("command-first"), "queued:first"),
      second.saveTransition(evidence("command-second"), "queued:second"),
    ]);

    expect([firstWon, secondWon].filter(Boolean)).toHaveLength(1);
    expect(second.getLatestByProject("project-studio-evidence")?.version).toBe(
      1,
    );
    expect(
      await first.saveTransition(evidence("command-repeat"), "repeat"),
    ).toBe(false);
  });

  it("terminalizes once without overwriting the winner timestamp", async () => {
    const storage = new InMemoryStorageProvider();
    const first = new StorageStudioEvidenceStore(storage);
    const second = new StorageStudioEvidenceStore(storage);
    const acknowledged = evidence("command-terminal");
    acknowledged.command.status = "acknowledged";
    acknowledged.verificationStatus = "acknowledged";
    expect(await first.saveTransition(acknowledged, "acknowledged")).toBe(true);
    await second.refresh();

    const completed = structuredClone(acknowledged);
    completed.version = 2;
    completed.command.status = "completed";
    completed.command.completedAt = 200;
    completed.verificationStatus = "verified";
    const failed = structuredClone(acknowledged);
    failed.version = 2;
    failed.command.status = "failed";
    failed.command.completedAt = 300;
    failed.verificationStatus = "failed";
    failed.verificationError = "import failed";

    const results = await Promise.all([
      first.saveTransition(completed, "terminal:completed"),
      second.saveTransition(failed, "terminal:failed"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await Promise.all([first.refresh(), second.refresh()]);
    const winner = first.getCommand("command-terminal");
    expect(winner?.command.completedAt).toBe(results[0] ? 200 : 300);
    expect(
      await second.saveTransition(
        {
          ...failed,
          version: 2,
          command: { ...failed.command, completedAt: 400 },
        },
        "terminal:retry",
      ),
    ).toBe(false);
    expect(first.getCommand("command-terminal")?.command.completedAt).toBe(
      results[0] ? 200 : 300,
    );
  });

  it("does not publish rejected durable evidence", async () => {
    const storage = new RejectingStorage();
    const store = new StorageStudioEvidenceStore(storage);

    await expect(
      store.saveTransition(evidence("command-rejected"), "queued"),
    ).rejects.toBeInstanceOf(DurableStorageError);
    expect(store.getCommand("command-rejected")).toBeNull();
    expect(store.getLatestByProject("project-studio-evidence")).toBeNull();
  });

  it("restores verified project evidence without restoring live handles", async () => {
    const storage = new InMemoryStorageProvider();
    const first = new StudioRuntime({
      storage,
      evidence: new StorageStudioEvidenceStore(storage),
    });
    await first.artifacts.store(
      "execution-runtime-restart",
      "LUA_GENERATION",
      "lua_generator",
      { scripts: [{ path: "Main.server.lua", content: "return true" }] },
    );
    const client = first.bridge.connect("0.650", "project-runtime-restart");
    first.sessions.create(client);
    const queued = await first.queueProjectExport(
      client.clientId,
      "project-runtime-restart",
      "execution-runtime-restart",
    );
    if (!queued.success || !queued.data.command) {
      throw new Error("Expected a queued Studio command");
    }
    const commandId = queued.data.command.id;
    const receipts = queued.data.snapshot.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      hash: artifact.hash,
    }));
    await first.drainCommands(client.clientId);
    await first.acknowledgeProjectExport(client.clientId, commandId);
    await first.reportProjectExport(client.clientId, commandId, {
      status: "completed",
      executionId: "execution-runtime-restart",
      artifacts: receipts,
    });

    const recreated = new StudioRuntime({
      storage,
      evidence: new StorageStudioEvidenceStore(storage),
    });
    expect(recreated.bridge.getConnectedClients()).toEqual([]);
    expect(recreated.sessions.getActiveSessions()).toEqual([]);
    expect(
      await recreated.getProjectEvidence("project-runtime-restart"),
    ).toMatchObject({
      command: { id: commandId, status: "completed" },
      verificationStatus: "verified",
      verifiedExecutionId: "execution-runtime-restart",
      verifiedArtifactCount: receipts.length,
      version: 4,
    });

    const reconnected = recreated.bridge.connect(
      "0.651",
      "project-runtime-restart",
    );
    recreated.sessions.create(reconnected);
    await recreated.reconcileClient(
      reconnected.clientId,
      "project-runtime-restart",
    );
    expect(recreated.sessions.getByClient(reconnected.clientId)).toMatchObject({
      verificationStatus: "verified",
      verifiedExecutionId: "execution-runtime-restart",
    });
  });
});
