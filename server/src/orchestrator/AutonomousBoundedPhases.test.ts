import { describe, expect, it } from "vitest";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
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
    const session = orchestrator.run(
      "Build an RPG with quests, inventory, and combat",
      "capability-project",
    );

    await waitForTerminal(session);

    const capabilities = orchestrator.getCapabilities(session.id);
    expect(capabilities).not.toBeNull();
    expect(capabilities?.lua_generation).toMatchObject({
      status: "available",
      evidence: "verified",
      service: "generation/lua/LuaGenerationEngine",
    });
    expect(capabilities?.playtest).toMatchObject({
      status: "degraded",
      evidence: "heuristic",
      service: "PlaytestEngine",
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
    const session = orchestrator.run(
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

    expect(orchestrator.recover(session.id, checkpoint.timestamp)).toBe(true);
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
});
