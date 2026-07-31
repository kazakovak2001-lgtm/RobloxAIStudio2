import { describe, expect, it } from "vitest";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import {
  AutonomousPhaseRegistry,
  createAutonomousPhaseContext,
} from "./AutonomousPhaseRegistry";
import type { OrchestratorSession } from "./OrchestratorTypes";

async function waitForTerminal(
  session: OrchestratorSession,
): Promise<OrchestratorSession> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (session.status !== "running" && session.status !== "paused") {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Session did not terminate: ${session.id}`);
}

describe("Autonomous bounded phase contracts", () => {
  it("reports capability truth after bounded execution", async () => {
    const orchestrator = new AutonomousOrchestrator();
    const session = await orchestrator.run(
      "Build an RPG with quests, inventory, and combat",
      "capability-project",
    );

    await waitForTerminal(session);

    expect(session.status).toBe("preview_completed");
    expect(session.phases.some((phase) => phase.status === "simulated")).toBe(
      false,
    );
    expect(
      session.phases.find((phase) => phase.phase === "preview_completed"),
    ).toMatchObject({
      status: "completed",
      executionMode: "bounded",
      evidence: "heuristic",
      capability: "degraded",
      service: "AutonomousOrchestrator",
      output: {
        productionCompleted: false,
        resultAuthority: "preview-only",
        verifiedStudioArtifacts: 0,
      },
    });

    const capabilities = orchestrator.getCapabilities(session.id);
    expect(capabilities).not.toBeNull();
    expect(capabilities?.lua_generation).toMatchObject({
      status: "available",
      evidence: "verified",
      service: "generation/lua/LuaGenerationEngine",
      cancellable: false,
    });
    expect(capabilities?.playtest).toMatchObject({
      status: "degraded",
      evidence: "heuristic",
      service: "PlaytestEngine",
      cancellable: false,
    });
    expect(capabilities?.repair).toMatchObject({
      status: "unavailable",
      service: "RepairEngine",
    });
    expect(capabilities?.studio_sync).toMatchObject({
      status: "unavailable",
      service: "StudioBridgeServer",
    });
  });

  it("recovers from a process-local checkpoint and completes the preview again", async () => {
    const orchestrator = new AutonomousOrchestrator();
    const session = await orchestrator.run(
      "Create a simulator with currency, upgrades, and rebirth",
      "recovery-project",
    );

    await waitForTerminal(session);
    expect(session.status).toBe("preview_completed");
    expect(session.checkpoints.length).toBeGreaterThan(3);

    const checkpoint =
      session.checkpoints.find(
        (candidate) => candidate.phase === "blueprint",
      ) ?? session.checkpoints[0];
    expect(checkpoint).toBeDefined();

    const checkpointIds = session.checkpoints.map((item) => item.id);
    expect(new Set(checkpointIds).size).toBe(checkpointIds.length);
    expect(checkpoint.phase).toBe("blueprint");

    expect(await orchestrator.recover(session.id, checkpoint.id)).toBe(true);
    expect(
      session.phases.find((phase) => phase.phase === checkpoint.phase)?.status,
    ).toBe("completed");
    await waitForTerminal(session);

    expect(session.status).toBe("preview_completed");
    expect(session.recoveryCount).toBe(1);
    expect(
      session.phases.find((phase) => phase.phase === "lua_generation")?.status,
    ).toBe("completed");
    expect(
      session.phases.find((phase) => phase.phase === "studio_sync")?.status,
    ).toBe("skipped");
  });

  it("returns a partial capability map for a partial registry", () => {
    const registry = new AutonomousPhaseRegistry([]);
    const capabilities = registry.listCapabilities(
      createAutonomousPhaseContext("partial-project", "Build an obby"),
    );

    expect(capabilities).toEqual({});
    expect(capabilities.lua_generation).toBeUndefined();
  });

  it("throws a portable AbortError at phase boundaries", async () => {
    const registry = new AutonomousPhaseRegistry();
    const adapter = registry.get("lua_generation");
    const controller = new AbortController();
    controller.abort("test cancellation");

    expect(adapter).toBeDefined();
    await expect(
      adapter?.execute(
        createAutonomousPhaseContext("abort-project", "Build an RPG"),
        controller.signal,
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "Autonomous phase cancelled",
    });
  });
});
