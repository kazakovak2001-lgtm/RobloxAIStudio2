from pathlib import Path
import json

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_exact(
    path: str, old: str, new: str, expected: int | None = None
) -> None:
    text = read(path)
    count = text.count(old)
    if expected is not None and count != expected:
        raise RuntimeError(
            f"{path}: expected {expected} occurrence(s) of {old!r}, found {count}"
        )
    if count == 0:
        if new in text:
            return
        raise RuntimeError(f"{path}: replacement source not found: {old!r}")
    write(path, text.replace(old, new))


replace_exact(
    "server/src/orchestrator/AutonomousPhaseRegistry.ts",
    "this.capability(context)",
    "this.capability()",
    expected=2,
)

ownership_path = ROOT / "config/runtime/runtime-ownership.json"
ownership = json.loads(ownership_path.read_text(encoding="utf-8"))
for entry in ownership["entries"]:
    if entry["id"] == "autonomous-orchestrator":
        entry["responsibility"] = (
            "Preview autonomous lifecycle coordinating registered bounded phase adapters; "
            "not a canonical production execution engine."
        )
        break
else:
    raise RuntimeError("autonomous-orchestrator runtime entry is missing")

if not any(
    entry["id"] == "autonomous-phase-registry" for entry in ownership["entries"]
):
    orchestrator_index = next(
        index
        for index, entry in enumerate(ownership["entries"])
        if entry["id"] == "autonomous-orchestrator"
    )
    ownership["entries"].insert(
        orchestrator_index + 1,
        {
            "id": "autonomous-phase-registry",
            "capability": "autonomous-phase-adapters",
            "path": "server/src/orchestrator/AutonomousPhaseRegistry.ts",
            "classification": "bounded-adapter",
            "owner": "orchestrator",
            "productionUse": "adapter-only",
            "responsibility": (
                "Registry of bounded autonomous phase adapters. It coordinates existing "
                "services but does not own canonical production execution."
            ),
        },
    )
ownership_path.write_text(json.dumps(ownership, indent=2) + "\n", encoding="utf-8")

path = "server/src/__tests__/autonomousPipelineIntegration.test.ts"
text = read(path)
old = '''executionMode: "simulation",
              resultAuthority: "preview-only",
              productionCompleted: false,
              qualityScore: null,
              totalCost: 0,'''
new = '''executionMode: "bounded",
              resultAuthority: "preview-only",
              productionCompleted: false,
              qualityScore: expect.any(Number),
              totalCost: 0,'''
if old not in text and new not in text:
    raise RuntimeError("integration preview expectation block not found")
text = text.replace(old, new)
text = text.replace(
    'it("property: preview step evidence includes zero synthetic usage with explicit source"',
    'it("property: bounded step evidence includes zero billed usage with measured timing"',
)
text = text.replace('source: "synthetic",', 'source: "measured",')
write(path, text)

path = "server/src/__tests__/autonomousPipelinePreservation.test.ts"
text = read(path)
text = text.replace(
    "12 entries (11 phases + simulated terminal node)",
    "12 entries (11 phases + preview terminal node)",
)
text = text.replace('["simulated", "failed"]', '["preview_completed", "failed"]')
text = text.replace(
    '["running", "simulated", "paused", "cancelled", "failed"]',
    '["running", "preview_completed", "paused", "cancelled", "failed"]',
)
text = text.replace(
    "session transitions running → simulated on preview success",
    "session transitions running → preview_completed on bounded preview success",
)
write(path, text)

replace_exact(
    "server/src/__tests__/integration.test.ts",
    'expect(final!.status).toBe("simulated");',
    'expect(final!.status).toBe("preview_completed");',
    expected=1,
)
replace_exact(
    "server/src/__tests__/performance.test.ts",
    'expect(final!.status).toBe("simulated");',
    'expect(final!.status).toBe("preview_completed");',
    expected=1,
)

write(
    "server/src/orchestrator/AutonomousOrchestrator.test.ts",
    '''import { describe, expect, it } from "vitest";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../types/pipeline-events";
import { AutonomousOrchestrator } from "./AutonomousOrchestrator";
import type { OrchestratorSession } from "./OrchestratorTypes";

async function waitForTerminal(
  session: OrchestratorSession,
): Promise<OrchestratorSession> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (session.status !== "running" && session.status !== "paused") {
      await Promise.resolve();
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Orchestrator session did not terminate: ${session.id}`);
}

describe("AutonomousOrchestrator bounded preview truthfulness", () => {
  it("executes bounded phase services and emits preview completion", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events);
    const session = orchestrator.run(
      "Create a cooperative obby with checkpoints",
      "project-preview",
    );

    await waitForTerminal(session);

    expect(session.executionMode).toBe("bounded");
    expect(session.resultAuthority).toBe("preview-only");
    expect(session.status).toBe("preview_completed");
    expect(session.currentPhase).toBe("preview_completed");
    expect(session.qualityScore).toEqual(expect.any(Number));
    expect(session.qualityScore).toBeGreaterThanOrEqual(0);
    expect(session.qualityScore).toBeLessThanOrEqual(100);
    expect(session.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });

    const genre = session.phases.find(
      (phase) => phase.phase === "genre_detection",
    );
    expect(genre).toMatchObject({
      status: "completed",
      evidence: "heuristic",
      service: "PromptGenreHeuristic",
    });

    const lua = session.phases.find((phase) => phase.phase === "lua_generation");
    expect(lua).toMatchObject({
      status: "completed",
      evidence: "verified",
      capability: "available",
      service: "generation/lua/LuaGenerationEngine",
    });

    const playtest = session.phases.find((phase) => phase.phase === "playtest");
    expect(playtest).toMatchObject({
      status: "completed",
      evidence: "heuristic",
      capability: "degraded",
      service: "PlaytestEngine",
    });
    expect(playtest?.output).toMatchObject({
      overallScore: expect.any(Number),
      runtimeExecuted: false,
    });

    const repair = session.phases.find((phase) => phase.phase === "repair");
    expect(repair).toMatchObject({
      status: "skipped",
      capability: "unavailable",
      service: "RepairEngine",
    });
    expect(repair?.skippedReason).toContain("simulates score improvement");

    const studioSync = session.phases.find(
      (phase) => phase.phase === "studio_sync",
    );
    expect(studioSync).toMatchObject({
      status: "skipped",
      capability: "unavailable",
      service: "StudioBridgeServer",
    });
    expect(studioSync?.skippedReason).toContain("authenticated Studio session");

    expect(published.some((event) => event.type === "step.completed")).toBe(true);
    expect(published.some((event) => event.type === "step.skipped")).toBe(true);
    expect(
      published.some((event) => event.type === "pipeline.preview.completed"),
    ).toBe(true);
    expect(published.some((event) => event.type === "pipeline.completed")).toBe(
      false,
    );

    const previewCompletion = published.find(
      (event) => event.type === "pipeline.preview.completed",
    );
    expect(previewCompletion?.data).toMatchObject({
      executionMode: "bounded",
      resultAuthority: "preview-only",
      productionCompleted: false,
      qualityScore: expect.any(Number),
      totalCost: 0,
      unavailablePhases: 2,
    });
  });

  it("produces deterministic non-billable bounded evidence", async () => {
    const orchestrator = new AutonomousOrchestrator();

    const first = orchestrator.run("Build a horror survival game", "project-a");
    const second = orchestrator.run("Build a horror survival game", "project-b");

    await Promise.all([waitForTerminal(first), waitForTerminal(second)]);

    expect(first.genre).toBe("survival");
    expect(second.genre).toBe(first.genre);
    expect(first.qualityScore).toBe(second.qualityScore);
    expect(first.qualityScore).toEqual(expect.any(Number));
    expect(first.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });
    expect(second.cost).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      source: "measured",
    });
  });
});
''',
)

write(
    "server/src/orchestrator/AutonomousBoundedPhases.test.ts",
    '''import { describe, expect, it } from "vitest";
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
      session.checkpoints.find((candidate) => candidate.phase === "blueprint") ??
      session.checkpoints[0];
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
''',
)
