import { describe, it, expect } from "vitest";
import { StudioBridge } from "../StudioBridge";
import { CommandRegistry } from "../commands/CommandRegistry";
import { ManifestBuilder } from "../manifest/ProjectManifest";
import type { StudioEventData } from "../StudioTypes";

describe("StudioBridge", () => {
  it("connects a client", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0", "proj-1");
    expect(client.clientId).toMatch(/^studio-/);
    expect(client.status).toBe("connected");
    expect(bridge.clientCount).toBe(1);
  });

  it("disconnects a client", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0");
    bridge.disconnect(client.clientId);
    expect(bridge.getClient(client.clientId)!.status).toBe("disconnected");
  });

  it("handles heartbeat", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0");
    expect(bridge.heartbeat(client.clientId)).toBe(true);
    expect(bridge.heartbeat("unknown")).toBe(false);
  });

  it("emits connection events", () => {
    const bridge = new StudioBridge();
    const events: StudioEventData[] = [];
    bridge.events.on((e) => events.push(e));
    bridge.connect("0.600.0");
    bridge.disconnect(bridge.getConnectedClients()[0].clientId);
    expect(events.some((e) => e.type === "studio.connected")).toBe(true);
    expect(events.some((e) => e.type === "studio.disconnected")).toBe(true);
  });
});

describe("CommandRegistry", () => {
  it("executes a command for connected client", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0");
    const registry = new CommandRegistry(bridge);
    const cmd = registry.execute(client.clientId, "CREATE_SCRIPT", {
      name: "Main",
      content: "print(1)",
    });
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe("CREATE_SCRIPT");
    expect(cmd!.status).toBe("sent");
  });

  it("returns null for disconnected client", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0");
    bridge.disconnect(client.clientId);
    const registry = new CommandRegistry(bridge);
    expect(registry.execute(client.clientId, "CREATE_SCRIPT", {})).toBeNull();
  });

  it("client receives commands via polling", () => {
    const bridge = new StudioBridge();
    const client = bridge.connect("0.600.0");
    const registry = new CommandRegistry(bridge);
    registry.execute(client.clientId, "CREATE_PROJECT", { name: "Test" });
    registry.execute(client.clientId, "CREATE_SCRIPT", { name: "A" });
    const commands = bridge.getCommands(client.clientId);
    expect(commands.length).toBe(2);
    // Queue is drained after poll
    expect(bridge.getCommands(client.clientId).length).toBe(0);
  });
});

describe("ManifestBuilder", () => {
  it("builds a manifest", () => {
    const manifest = new ManifestBuilder("proj-1", "Super Obby")
      .addScript("MainLoop", "ServerScriptService/MainLoop.lua", "server")
      .addScript("Client", "StarterPlayerScripts/Client.lua", "client")
      .addAsset("Map", "model", "Workspace/Map")
      .addFolder("ServerScriptService")
      .addFolder("ReplicatedStorage")
      .build();
    expect(manifest.projectId).toBe("proj-1");
    expect(manifest.gameName).toBe("Super Obby");
    expect(manifest.scripts.length).toBe(2);
    expect(manifest.assets.length).toBe(1);
    expect(manifest.folders.length).toBe(2);
    expect(manifest.generatedBy).toBe("RobloxAiStudio");
  });

  it("builds from pipeline output", () => {
    const manifest = ManifestBuilder.fromPipelineOutput("p1", "Game", {
      lua_generator: {
        server: [{ name: "Main" }],
        client: [{ name: "UI" }],
        shared: [{ name: "Utils" }],
      },
    });
    expect(manifest.scripts.length).toBe(3);
    expect(manifest.scripts[0].type).toBe("server");
    expect(manifest.scripts[2].type).toBe("module");
  });
});
