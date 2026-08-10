/**
 * Studio Integration Tests — Validates the complete Studio Bridge, Protocol, and Sync layer.
 * Uses in-process mocking since a real Roblox Studio instance is not available in CI.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { StudioBridge } from "../studio/v2/StudioBridge";
import { StudioSessionManager } from "../studio/v2/StudioSession";
import { ProtocolDispatcher } from "../studio/v2/protocol/ProtocolDispatcher";
import { ProtocolValidator } from "../studio/v2/protocol/ProtocolValidator";
import {
  createMessage,
  PROTOCOL_VERSION,
} from "../studio/v2/protocol/StudioProtocol";
import { ProjectSyncManager } from "../studio/v2/sync/ProjectSyncManager";
import { ArtifactStore } from "../pipeline/v2/ArtifactStore";
import { LuaGenerationEngine } from "../generation/lua";
import { ExperienceAssembler } from "../generation/experience";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

describe("Studio Integration", () => {
  let bridge: StudioBridge;
  let sessions: StudioSessionManager;
  let dispatcher: ProtocolDispatcher;
  let validator: ProtocolValidator;

  beforeEach(() => {
    bridge = new StudioBridge();
    sessions = new StudioSessionManager();
    dispatcher = new ProtocolDispatcher();
    validator = new ProtocolValidator();
  });

  describe("Connection Lifecycle", () => {
    it("connects a Studio client and creates a session", () => {
      const client = bridge.connect("2024.1.0", "test-project");
      const session = sessions.create(client);

      expect(client.clientId).toBeTruthy();
      expect(client.status).toBe("connected");
      expect(session.sessionId).toBeTruthy();
      expect(session.status).toBe("active");
    });

    it("heartbeat keeps session alive", () => {
      const client = bridge.connect("2024.1.0");
      sessions.create(client);

      const ok = bridge.heartbeat(client.clientId);
      const sessionOk = sessions.recordActivity(client.clientId);

      expect(ok).toBe(true);
      expect(sessionOk).toBe(true);
    });

    it("disconnect closes session", () => {
      const client = bridge.connect("2024.1.0");
      sessions.create(client);

      bridge.disconnect(client.clientId);
      sessions.close(client.clientId);

      expect(bridge.getClient(client.clientId)!.status).toBe("disconnected");
      // After close, getByClient returns null (session removed from active tracking)
      const session = sessions.getByClient(client.clientId);
      expect(session === null || session.status === "closed").toBe(true);
    });

    it("session expires after timeout", () => {
      const client = bridge.connect("2024.1.0");
      const session = sessions.create(client);

      // Simulate time passing beyond timeout
      session.lastActivity = Date.now() - 120_000; // 2 minutes ago

      const expired = sessions.checkTimeouts();
      expect(expired.length).toBe(1);
      expect(sessions.getByClient(client.clientId)!.status).toBe("expired");
    });

    it("multiple clients connect independently", () => {
      const c1 = bridge.connect("2024.1.0", "proj-1");
      const c2 = bridge.connect("2024.2.0", "proj-2");

      expect(bridge.getConnectedClients()).toHaveLength(2);
      expect(c1.clientId).not.toBe(c2.clientId);
    });

    it("reconnect creates new session", () => {
      const c1 = bridge.connect("2024.1.0", "proj-1");
      sessions.create(c1);
      bridge.disconnect(c1.clientId);
      sessions.close(c1.clientId);

      const c2 = bridge.connect("2024.1.0", "proj-1");
      const s2 = sessions.create(c2);

      expect(c2.clientId).not.toBe(c1.clientId);
      expect(s2.status).toBe("active");
    });
  });

  describe("Protocol Messages", () => {
    it("PING returns PONG", async () => {
      const msg = createMessage("session-1", "PING", "ping", {});
      const response = await dispatcher.dispatch(msg);

      expect(response.status).toBe("ok");
      expect(response.payload.pong).toBe(true);
    });

    it("HELLO validates protocol version", async () => {
      const msg = createMessage("session-1", "HELLO", "hello", {
        pluginVersion: "2.1.0",
        studioVersion: "2024.1.0",
        protocolVersion: PROTOCOL_VERSION,
      });
      const response = await dispatcher.dispatch(msg);

      expect(response.status).toBe("ok");
      expect(response.payload.compatible).toBe(true);
    });

    it("HELLO rejects incompatible protocol", async () => {
      const msg = createMessage("session-1", "HELLO", "hello", {
        pluginVersion: "1.0.0",
        studioVersion: "2024.1.0",
        protocolVersion: "99.0.0",
      });
      const response = await dispatcher.dispatch(msg);

      expect(response.status).toBe("error");
      expect(response.error).toContain("Incompatible");
    });

    it("STATUS returns server info", async () => {
      const msg = createMessage("session-1", "STATUS", "status", {});
      const response = await dispatcher.dispatch(msg);

      expect(response.status).toBe("ok");
      expect(response.payload.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(response.payload.supportedCommands).toBeTruthy();
    });

    it("rejects expired messages", () => {
      const msg = createMessage("session-1", "PING", "ping", {});
      msg.timestamp = Date.now() - 60_000; // 1 minute old

      const error = validator.validate(msg);
      expect(error).toContain("expired");
    });

    it("rejects unknown message type", () => {
      const msg = createMessage(
        "session-1",
        "INVALID_TYPE" as never,
        "test",
        {},
      );
      const error = validator.validate(msg);
      expect(error).toContain("Unknown message type");
    });

    it("rejects oversized payload", () => {
      const msg = createMessage("session-1", "PING", "ping", {});
      msg.payload = { data: "x".repeat(2_000_000) };

      const error = validator.validate(msg);
      expect(error).toContain("too large");
    });

    it("detects duplicate messageIds", async () => {
      const msg = createMessage("session-1", "PING", "ping", {});
      await dispatcher.dispatch(msg);
      const response = await dispatcher.dispatch(msg); // Same ID

      expect(response.status).toBe("error");
      expect(response.error).toContain("Duplicate");
    });
  });

  describe("Project Synchronization", () => {
    it("returns empty snapshot for project with no artifacts", () => {
      const store = new ArtifactStore();
      const syncManager = new ProjectSyncManager(store);

      const snapshot = syncManager.getProjectSnapshot("empty-project");
      expect(snapshot).not.toBeNull();
      expect(snapshot!.artifactCount).toBe(0);
      expect(snapshot!.version).toBeTruthy();
    });

    it("returns snapshot with artifacts after generation", async () => {
      const store = new ArtifactStore();
      await store.store(
        "pipe-1",
        "REQUIREMENTS",
        "requirements",
        {
          data: "test",
        },
        { projectId: ARTIFACT_TEST_PROJECT },
      );
      await store.store(
        "pipe-1",
        "GAME_DESIGN",
        "game_designer",
        {
          design: "rpg",
        },
        { projectId: ARTIFACT_TEST_PROJECT },
      );

      const syncManager = new ProjectSyncManager(store);
      const snapshot = syncManager.getProjectSnapshot("pipe-1");

      expect(snapshot!.artifactCount).toBe(2);
      expect(snapshot!.artifacts).toHaveLength(2);
      expect(snapshot!.artifacts[0].hash).toBeTruthy();
    });

    it("transfers artifacts with content", async () => {
      const store = new ArtifactStore();
      const art1 = await store.store(
        "pipe-1",
        "LUA_GENERATION",
        "lua_generator",
        {
          script: "print('hello')",
        },
        { projectId: ARTIFACT_TEST_PROJECT },
      );

      const syncManager = new ProjectSyncManager(store);
      const transfer = syncManager.getTransferManager().transfer([art1.id]);

      expect(transfer.artifacts).toHaveLength(1);
      expect(transfer.artifacts[0].content).toEqual({
        script: "print('hello')",
      });
      expect(transfer.missing).toHaveLength(0);
    });

    it("reports missing artifacts in transfer", () => {
      const store = new ArtifactStore();
      const syncManager = new ProjectSyncManager(store);
      const transfer = syncManager
        .getTransferManager()
        .transfer(["nonexistent-id"]);

      expect(transfer.artifacts).toHaveLength(0);
      expect(transfer.missing).toContain("nonexistent-id");
    });
  });

  describe("Full Generation → Sync Flow", () => {
    it("generates scripts and syncs to studio", async () => {
      // Step 1: Generate Lua scripts
      const luaEngine = new LuaGenerationEngine();
      const result = luaEngine.generateFullPackage(
        "studio-test",
        "RPG Game",
        "rpg",
      );
      expect(result.totalScripts).toBeGreaterThanOrEqual(8);

      // Step 2: Assemble experience
      const assembler = new ExperienceAssembler();
      const assembly = assembler.assemble(result);
      expect(assembly.success).toBe(true);
      expect(assembly.manifest.hierarchy.length).toBeGreaterThan(0);

      // Step 3: Store artifacts for sync
      const store = new ArtifactStore();
      for (const artifact of result.artifacts) {
        await store.store(
          "studio-pipe",
          artifact.scriptType as never,
          "lua_generator",
          {
            name: artifact.name,
            content: artifact.content,
            path: artifact.path,
          },
          { projectId: ARTIFACT_TEST_PROJECT },
        );
      }

      // Step 4: Sync to Studio (simulated plugin)
      const syncManager = new ProjectSyncManager(store);
      const snapshot = syncManager.getProjectSnapshot("studio-pipe");
      expect(snapshot!.artifactCount).toBe(result.totalScripts);

      // Step 5: Transfer all artifacts
      const ids = snapshot!.artifacts.map((a) => a.id);
      const transfer = syncManager.getTransferManager().transfer(ids);
      expect(transfer.artifacts.length).toBe(result.totalScripts);
      expect(transfer.payloadExceeded).toBe(false);
    });

    it("Studio plugin receives correct hierarchy structure", () => {
      const luaEngine = new LuaGenerationEngine();
      const result = luaEngine.generateFullPackage(
        "hierarchy-test",
        "Game",
        "adventure",
      );
      const assembler = new ExperienceAssembler();
      const assembly = assembler.assemble(result);

      // Verify Roblox services are present
      const serviceNames = assembly.manifest.hierarchy.map((h) => h.name);
      expect(serviceNames).toContain("ServerScriptService");
      expect(serviceNames).toContain("ReplicatedStorage");

      // Verify scripts are in correct services
      const serverScripts =
        assembly.manifest.hierarchy.find(
          (h) => h.name === "ServerScriptService",
        )?.children ?? [];
      expect(serverScripts.length).toBeGreaterThan(0);
      expect(
        serverScripts.every(
          (s) => s.type === "Script" || s.type === "ModuleScript",
        ),
      ).toBe(true);
    });
  });

  describe("Event Flow", () => {
    it("bridge emits connect/disconnect events", () => {
      const events: string[] = [];
      bridge.events.on((e) => events.push(e.type));

      const client = bridge.connect("2024.1.0");
      bridge.disconnect(client.clientId);

      expect(events).toContain("studio.connected");
      expect(events).toContain("studio.disconnected");
    });

    it("events contain correct clientId", () => {
      let lastEvent: unknown = null;
      bridge.events.on((e) => {
        lastEvent = e;
      });

      const client = bridge.connect("2024.1.0", "test-proj");

      expect((lastEvent as { clientId: string }).clientId).toBe(
        client.clientId,
      );
    });
  });
});
