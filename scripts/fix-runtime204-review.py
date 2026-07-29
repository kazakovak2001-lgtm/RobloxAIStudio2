from pathlib import Path

SOURCE_PATH = Path("server/src/orchestrator/AutonomousOrchestrator.ts")
TEST_PATH = Path("server/src/orchestrator/AutonomousOrchestrator.test.ts")

source = SOURCE_PATH.read_text()

replacements = [
    (
        """export class AutonomousOrchestrator {
  private sessions: Map<string, OrchestratorSession> = new Map();
  private events?: PipelineEventEmitter;""",
        """export class AutonomousOrchestrator {
  private sessions: Map<string, OrchestratorSession> = new Map();
  private activeRuns: Map<string, Promise<void>> = new Map();
  private events?: PipelineEventEmitter;""",
    ),
    (
        """    void this.executePhases(session);
    return session;""",
        """    this.startExecution(session);
    return session;""",
    ),
    (
        """    const next = session.phases.find(
      (phase) => phase.status === "pending" && phase.phase !== "simulated",
    );""",
        """    const next = session.phases.find(
      (phase) =>
        phase.phase !== "simulated" &&
        (phase.status === "pending" || phase.status === "running"),
    );""",
    ),
    (
        """    if (next) {
      session.currentPhase = next.phase;
      void this.executePhases(session);
    } else {""",
        """    if (next) {
      session.currentPhase = next.phase;
      this.startExecution(session);
    } else {""",
    ),
    (
        """  private async executePhases(session: OrchestratorSession): Promise<void> {
    for (const node of session.phases) {""",
        """  private startExecution(session: OrchestratorSession): void {
    if (this.activeRuns.has(session.id)) return;

    const run = this.executePhases(session).finally(() => {
      if (this.activeRuns.get(session.id) !== run) return;
      this.activeRuns.delete(session.id);

      if (session.status === "running" && this.hasRemainingWork(session)) {
        this.startExecution(session);
      }
    });

    this.activeRuns.set(session.id, run);
  }

  private async executePhases(session: OrchestratorSession): Promise<void> {
    for (const node of session.phases) {""",
    ),
    (
        """      try {
        const result = await this.executePhase(session, node.phase);
        node.status = result.status;""",
        """      try {
        const result = await this.executePhase(session, node.phase);
        if (session.status !== "running") {
          node.status = "pending";
          return;
        }

        node.status = result.status;""",
    ),
    (
        """      } catch (error) {
        this.failPhase(session, node, stepId, agentName, error);
        break;
      }""",
        """      } catch (error) {
        if (session.status !== "running") {
          node.status = "pending";
          return;
        }

        this.failPhase(session, node, stepId, agentName, error);
        break;
      }""",
    ),
    (
        """    if (session.status === "running") {
      const remaining = session.phases.some(
        (phase) =>
          phase.phase !== "simulated" &&
          (phase.status === "pending" || phase.status === "running"),
      );
      if (!remaining) this.finishPreview(session);
    }
  }

  private async executePhase(""",
        """    if (session.status === "running" && !this.hasRemainingWork(session)) {
      this.finishPreview(session);
    }
  }

  private hasRemainingWork(session: OrchestratorSession): boolean {
    return session.phases.some(
      (phase) =>
        phase.phase !== "simulated" &&
        (phase.status === "pending" || phase.status === "running"),
    );
  }

  private async executePhase(""",
    ),
    (
        """        cost: { ...session.cost },""",
        """        cost: {
          ...session.cost,
          perPhase: { ...session.cost.perPhase },
        },""",
    ),
]

if "private activeRuns:" not in source:
    for old, new in replacements:
        if source.count(old) != 1:
            raise SystemExit(f"Expected one source marker, found {source.count(old)}: {old[:80]!r}")
        source = source.replace(old, new, 1)
    SOURCE_PATH.write_text(source)

tests = TEST_PATH.read_text()
tests = tests.replace(
    "for (let attempt = 0; attempt < 100; attempt += 1)",
    "for (let attempt = 0; attempt < 1000; attempt += 1)",
    1,
)

race_test_name = "serializes rapid pause and resume without duplicate phase evidence"
if race_test_name not in tests:
    insertion = r'''

  it("serializes rapid pause and resume without duplicate phase evidence", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events, {
      simulationDelayMs: 25,
    });
    const session = orchestrator.run(
      "Build a cooperative obby with safe pause and resume",
      "project-race",
    );

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (session.phases.some((phase) => phase.status === "running")) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(orchestrator.pause(session.id)).toBe(true);
    expect(orchestrator.resume(session.id)).toBe(true);
    await waitForTerminal(session);

    const terminalEvents = published.filter(
      (event) => event.type === "pipeline.preview.completed",
    );
    expect(terminalEvents).toHaveLength(1);

    const phaseStarts = published.filter(
      (event) => event.type === "step.started",
    );
    const startedStepIds = phaseStarts.map((event) => event.stepId);
    expect(new Set(startedStepIds).size).toBe(startedStepIds.length);

    const phaseTerminalEvents = published.filter(
      (event) =>
        event.type === "step.completed" || event.type === "step.simulated",
    );
    const terminalStepIds = phaseTerminalEvents.map((event) => event.stepId);
    expect(new Set(terminalStepIds).size).toBe(terminalStepIds.length);
    expect(session.checkpoints).toHaveLength(phaseTerminalEvents.length);
    expect(Object.keys(session.cost.perPhase)).toHaveLength(
      phaseTerminalEvents.length,
    );
  });

  it("keeps checkpoint cost snapshots isolated from later phase costs", async () => {
    const orchestrator = new AutonomousOrchestrator(undefined, {
      simulationDelayMs: 0,
    });
    const session = orchestrator.run(
      "Build a deterministic tycoon preview",
      "project-checkpoint",
    );

    await waitForTerminal(session);

    const firstCheckpoint = session.checkpoints[0];
    const snapshotCost = firstCheckpoint.snapshot.cost as {
      perPhase: Record<string, unknown>;
    };

    expect(snapshotCost.perPhase).not.toBe(session.cost.perPhase);
    expect(Object.keys(snapshotCost.perPhase)).toEqual(["genre_detection"]);
    expect(Object.keys(session.cost.perPhase).length).toBeGreaterThan(1);
  });
'''
    closing = "\n});\n"
    if not tests.endswith(closing):
        raise SystemExit("Expected test suite closing marker")
    tests = tests[: -len(closing)] + insertion + closing

TEST_PATH.write_text(tests)
