from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected_min: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count < expected_min:
        raise SystemExit(f"Expected at least {expected_min} matches in {path}, found {count}")
    file.write_text(text.replace(old, new))


orchestrator = "server/src/orchestrator/AutonomousOrchestrator.ts"
replace_once(
    orchestrator,
    '''      phases: PHASE_ORDER.map((phase) => ({
        id: `node-${phase}`,
        phase,
        status: "pending",
        executionMode: "simulation",
      })),
''',
    '''      phases: [
        ...PHASE_ORDER.map((phase) => ({
          id: `node-${phase}`,
          phase,
          status: "pending" as const,
          executionMode: "simulation" as const,
        })),
        {
          id: "node-simulated",
          phase: "simulated",
          status: "pending",
          executionMode: "simulation",
          evidence: "synthetic",
        },
      ],
''',
)
replace_once(
    orchestrator,
    '''    for (const node of session.phases) {
      if (
''',
    '''    for (const node of session.phases) {
      if (node.phase === "simulated") continue;
      if (
''',
)
replace_once(
    orchestrator,
    '''    session.finishedAt = Date.now();

    const simulatedPhases = session.phases.filter(
''',
    '''    session.finishedAt = Date.now();

    const terminalNode = session.phases.find(
      (phase) => phase.phase === "simulated",
    );
    if (terminalNode) {
      terminalNode.status = "simulated";
      terminalNode.executionMode = "simulation";
      terminalNode.evidence = "synthetic";
      terminalNode.startedAt = session.finishedAt;
      terminalNode.completedAt = session.finishedAt;
      terminalNode.durationMs = 0;
      terminalNode.output = {
        productionCompleted: false,
        resultAuthority: session.resultAuthority,
      };
    }

    const simulatedPhases = session.phases.filter(
''',
)

integration = "server/src/__tests__/autonomousPipelineIntegration.test.ts"
replace_once(
    integration,
    'it("property: full autonomous run emits pipeline.started, step events for each phase, and pipeline.completed with quality score and cost", async () => {',
    'it("property: full autonomous preview emits truthful phase evidence without production completion", async () => {',
)
replace_once(
    integration,
    '''          // Verify step.completed events were emitted
          const stepCompleted = events.filter(
            (e) => e.type === "step.completed",
          );
          expect(stepCompleted.length).toBeGreaterThan(0);

          // Verify pipeline terminal event emitted
          const pipelineCompleted = events.filter(
            (e) => e.type === "pipeline.completed",
          );
          const pipelineFailed = events.filter(
            (e) => e.type === "pipeline.failed",
          );
          expect(pipelineCompleted.length + pipelineFailed.length).toBe(1);

          // If completed, verify quality score and cost are present
          if (pipelineCompleted.length === 1) {
            const data = pipelineCompleted[0].data as Record<string, unknown>;
            expect(data).toBeDefined();
            // outputs field contains qualityScore, genre, totalCost
            const outputs = data.outputs as Record<string, unknown>;
            expect(outputs).toBeDefined();
            expect(typeof outputs.qualityScore).toBe("number");
            expect(typeof outputs.totalCost).toBe("number");
          }
''',
    '''          const stepEvidence = events.filter(
            (e) =>
              e.type === "step.completed" || e.type === "step.simulated",
          );
          expect(stepEvidence.length).toBeGreaterThan(0);

          const previewCompleted = events.filter(
            (e) => e.type === "pipeline.preview.completed",
          );
          const productionCompleted = events.filter(
            (e) => e.type === "pipeline.completed",
          );
          const pipelineFailed = events.filter(
            (e) => e.type === "pipeline.failed",
          );
          expect(previewCompleted.length + pipelineFailed.length).toBe(1);
          expect(productionCompleted.length).toBe(0);

          if (previewCompleted.length === 1) {
            const data = previewCompleted[0].data as Record<string, unknown>;
            expect(data).toMatchObject({
              executionMode: "simulation",
              resultAuthority: "preview-only",
              productionCompleted: false,
              qualityScore: null,
              totalCost: 0,
            });
          }
''',
)
replace_once(
    integration,
    'it("property: step.completed events include cost field with { tokens, cost, timeMs } structure", async () => {',
    'it("property: preview step evidence includes zero synthetic usage with explicit source", async () => {',
)
replace_once(
    integration,
    '''          // Get step.completed events
          const stepCompleted = events.filter(
            (e) => e.type === "step.completed",
          );
          expect(stepCompleted.length).toBeGreaterThan(0);

          // Verify cost data structure in each step.completed
          for (const evt of stepCompleted) {
            const data = evt.data as Record<string, unknown>;
            expect(data.output).toBeDefined();
            const output = data.output as Record<string, unknown>;
            expect(output.cost).toBeDefined();

            const costData = output.cost as Record<string, unknown>;
            expect(typeof costData.tokens).toBe("number");
            expect(typeof costData.cost).toBe("number");
            expect(typeof costData.timeMs).toBe("number");
            expect(costData.tokens).toBeGreaterThan(0);
            expect(costData.cost).toBeGreaterThan(0);
            expect(costData.timeMs).toBeGreaterThanOrEqual(0);
          }
''',
    '''          const stepEvidence = events.filter(
            (e) =>
              e.type === "step.completed" || e.type === "step.simulated",
          );
          expect(stepEvidence.length).toBeGreaterThan(0);

          for (const evt of stepEvidence) {
            const data = evt.data as Record<string, unknown>;
            expect(data.output).toBeDefined();
            const output = data.output as Record<string, unknown>;
            expect(output.cost).toBeDefined();

            const costData = output.cost as Record<string, unknown>;
            expect(costData).toMatchObject({
              tokens: 0,
              cost: 0,
              source: "synthetic",
            });
            expect(typeof costData.timeMs).toBe("number");
            expect(costData.timeMs).toBeGreaterThanOrEqual(0);
          }
''',
)

preservation = "server/src/__tests__/autonomousPipelinePreservation.test.ts"
replace_all(
    preservation,
    "session phases array contains 12 entries (11 phases + completed node)",
    "session phases array contains 12 entries (11 phases + simulated terminal node)",
)
replace_all(preservation, '["completed", "failed"]', '["simulated", "failed"]', 2)
replace_all(
    preservation,
    '["running", "completed", "paused", "cancelled", "failed"]',
    '["running", "simulated", "paused", "cancelled", "failed"]',
)
replace_all(
    preservation,
    "session transitions running → completed on success",
    "session transitions running → simulated on preview success",
)
replace_once(
    "server/src/__tests__/integration.test.ts",
    'expect(final!.status).toBe("completed");',
    'expect(final!.status).toBe("simulated");',
)
replace_once(
    "server/src/__tests__/performance.test.ts",
    'expect(final!.status).toBe("completed");',
    'expect(final!.status).toBe("simulated");',
)
