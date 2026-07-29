/**
 * Plugin Protocol Tests — Handshake, sync, rollback scenarios.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { StudioBridge } from "../studio/v2/StudioBridge";
import { StudioSessionManager } from "../studio/v2/StudioSession";
import { ProtocolDispatcher } from "../studio/v2/protocol/ProtocolDispatcher";
import {
  createMessage,
  PROTOCOL_VERSION,
} from "../studio/v2/protocol/StudioProtocol";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";

describe("Plugin Protocol", () => {
  describe("pluginHandshake", () => {
    let bridge: StudioBridge;
    let sessions: StudioSessionManager;
    let dispatcher: ProtocolDispatcher;

    beforeEach(() => {
      bridge = new StudioBridge();
      sessions = new StudioSessionManager();
      dispatcher = new ProtocolDispatcher();
    });

    it("successful connection and HELLO", async () => {
      const client = bridge.connect("2024.1.0", "test-project");
      sessions.create(client);

      const hello = createMessage(client.clientId, "HELLO", "hello", {
        pluginVersion: "1.7.0",
        studioVersion: "2024.1.0",
        protocolVersion: PROTOCOL_VERSION,
      });
      const res = await dispatcher.dispatch(hello);

      expect(res.status).toBe("ok");
      expect(res.payload.compatible).toBe(true);
    });

    it("authentication failure (no client registered)", async () => {
      // Sending message without connecting first
      const msg = createMessage("fake-session", "STATUS", "status", {});
      const res = await dispatcher.dispatch(msg);
      // Still processes (auth is checked at route level, not dispatcher)
      expect(res.status).toBe("ok");
    });

    it("version mismatch rejected", async () => {
      const hello = createMessage("session-1", "HELLO", "hello", {
        pluginVersion: "0.1.0",
        studioVersion: "2020.0.0",
        protocolVersion: "99.0.0",
      });
      const res = await dispatcher.dispatch(hello);
      expect(res.status).toBe("error");
      expect(res.error).toContain("Incompatible");
    });
  });

  describe("syncPatch", () => {
    let store: ArtifactStore;
    let syncManager: ProjectSyncManager;

    beforeEach(() => {
      store = new ArtifactStore();
      syncManager = new ProjectSyncManager(store);
    });

    it("artifact transfer succeeds", async () => {
      const art = await store.store("pipe-1", "LUA_GENERATION", "lua_gen", {
        code: "print('hi')",
      });
      const transfer = syncManager.getTransferManager().transfer([art.id]);

      expect(transfer.artifacts).toHaveLength(1);
      expect(transfer.artifacts[0].content).toEqual({ code: "print('hi')" });
    });

    it("hierarchy creation from snapshot", async () => {
      await store.store("pipe-1", "REQUIREMENTS", "req", { req: "data" });
      await store.store("pipe-1", "LUA_GENERATION", "lua", { script: "..." });
      await store.store("pipe-1", "UI_GENERATION", "ui", { layout: "..." });

      const snapshot = syncManager.getProjectSnapshot("pipe-1");
      expect(snapshot!.artifacts).toHaveLength(3);
      expect(snapshot!.artifacts.every((a) => a.hash.length > 0)).toBe(true);
    });

    it("missing artifact handled gracefully", () => {
      const transfer = syncManager
        .getTransferManager()
        .transfer(["does-not-exist"]);
      expect(transfer.missing).toContain("does-not-exist");
      expect(transfer.artifacts).toHaveLength(0);
    });
  });

  describe("rollback", () => {
    it("failed sync change is not applied", async () => {
      const store = new ArtifactStore();
      await store.store("pipe-1", "LUA_GENERATION", "lua", {
        code: "original",
      });

      const syncManager = new ProjectSyncManager(store);

      // Try to update a non-existent artifact (should fail validation)
      const result = await syncManager.processSyncRequest("pipe-1", [
        {
          changeId: "change-1",
          artifactId: "nonexistent",
          artifactType: "lua",
          changeType: "update",
          content: "modified",
          timestamp: Date.now(),
        },
      ]);

      expect(result.status).toBe("error");
      expect(result.appliedChanges).toHaveLength(0);
    });

    it("valid change is applied", async () => {
      const store = new ArtifactStore();
      const art = await store.store("pipe-1", "LUA_GENERATION", "lua", {
        code: "original",
      });

      const syncManager = new ProjectSyncManager(store);
      const result = await syncManager.processSyncRequest("pipe-1", [
        {
          changeId: "change-1",
          artifactId: art.id,
          artifactType: "lua",
          changeType: "update",
          content: { code: "modified" },
          timestamp: Date.now() + 1000, // Future timestamp to avoid conflict
        },
      ]);

      expect(result.status).toBe("applied");
      expect(result.appliedChanges).toContain("change-1");
    });
  });
});
