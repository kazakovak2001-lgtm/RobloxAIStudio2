from pathlib import Path

SOURCE_PATH = Path("server/src/orchestrator/AutonomousOrchestrator.ts")
TEST_PATH = Path("server/src/orchestrator/AutonomousOrchestrator.test.ts")

source = SOURCE_PATH.read_text()

old_fields = '''  private readonly controllers = new Map<string, AbortController>();
  private readonly activeExecutions = new Set<string>();
  private readonly events?: PipelineEventEmitter;'''
new_fields = '''  private readonly controllers = new Map<string, AbortController>();
  private readonly activeExecutions = new Set<string>();
  private readonly restartRequests = new Set<string>();
  private readonly events?: PipelineEventEmitter;'''
if source.count(old_fields) != 1:
    raise SystemExit(f"Expected one active execution field marker, found {source.count(old_fields)}")
source = source.replace(old_fields, new_fields, 1)

execution_call = "    void this.executePhases(session);"
if source.count(execution_call) != 3:
    raise SystemExit(f"Expected three execution call sites, found {source.count(execution_call)}")
source = source.replace(execution_call, "    this.startExecution(session);")

execute_marker = '''  private async executePhases(session: OrchestratorSession): Promise<void> {
    if (this.activeExecutions.has(session.id)) return;'''
start_execution = '''  private startExecution(session: OrchestratorSession): void {
    if (this.activeExecutions.has(session.id)) {
      this.restartRequests.add(session.id);
      return;
    }

    void this.executePhases(session);
  }

  private async executePhases(session: OrchestratorSession): Promise<void> {
    if (this.activeExecutions.has(session.id)) return;'''
if source.count(execute_marker) != 1:
    raise SystemExit(f"Expected one executePhases marker, found {source.count(execute_marker)}")
source = source.replace(execute_marker, start_execution, 1)

old_finally = '''    } finally {
      this.activeExecutions.delete(session.id);
    }
  }'''
new_finally = '''    } finally {
      this.activeExecutions.delete(session.id);
      const restartRequested = this.restartRequests.delete(session.id);
      if (
        session.status === "running" &&
        (restartRequested || this.nextPendingNode(session))
      ) {
        this.startExecution(session);
      }
    }
  }'''
if source.count(old_finally) != 1:
    raise SystemExit(f"Expected one executePhases finally block, found {source.count(old_finally)}")
source = source.replace(old_finally, new_finally, 1)

SOURCE_PATH.write_text(source)

tests = TEST_PATH.read_text()
tests = tests.replace(
    "for (let attempt = 0; attempt < 200; attempt += 1)",
    "for (let attempt = 0; attempt < 1000; attempt += 1)",
    1,
)

race_test_name = "resumes an interrupted bounded run without duplicate terminal evidence"
if race_test_name not in tests:
    insertion = r'''

  it("resumes an interrupted bounded run without duplicate terminal evidence", async () => {
    const events = new PipelineEventEmitter();
    const published: PipelineEvent[] = [];
    events.onEvent(async (event) => {
      published.push(event);
    });

    const orchestrator = new AutonomousOrchestrator(events);
    const session = orchestrator.run(
      "Build a cooperative obby with safe pause and resume",
      "project-race",
    );

    expect(orchestrator.pause(session.id)).toBe(true);
    expect(orchestrator.resume(session.id)).toBe(true);
    await waitForTerminal(session);

    expect(session.status).toBe("preview_completed");
    expect(
      published.filter((event) => event.type === "pipeline.preview.completed"),
    ).toHaveLength(1);

    const phaseTerminalEvents = published.filter(
      (event) =>
        event.type === "step.completed" || event.type === "step.skipped",
    );
    const terminalStepIds = phaseTerminalEvents.map((event) => event.stepId);
    expect(new Set(terminalStepIds).size).toBe(terminalStepIds.length);
    expect(session.checkpoints).toHaveLength(phaseTerminalEvents.length);
    expect(Object.keys(session.cost.perPhase)).toHaveLength(
      phaseTerminalEvents.length,
    );
  });

  it("keeps bounded checkpoint cost snapshots isolated", async () => {
    const orchestrator = new AutonomousOrchestrator();
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
