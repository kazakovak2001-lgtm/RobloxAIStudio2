/**
 * PIPELINE-TRUTH-1 — completion means the canonical outcome, not the DAG.
 *
 * GEN-LIFECYCLE-SPLIT-001: `pipeline.completed` is emitted by the plan executor
 * when the agent DAG finishes, which is before artifacts are recorded, before
 * validation and before the package is committed. The event bridge used to mark
 * the project `ready` at that moment, with a hardcoded quality score of 100, so
 * a run whose recorder or validation then failed left the project claiming a
 * finished, perfect generation while its durable execution said failed.
 *
 * GEN-FAILURE-EVIDENCE-001: the failure path committed without pipeline steps,
 * and the coordinator falls back to the record's existing steps — the empty
 * array written at start. A run that failed after six agents therefore reported
 * nothing completed, nothing failed and nothing known.
 */

import { describe, expect, it } from "vitest";
import { GenerationOutcomeCoordinator } from "../platform/projects/ProjectLifecycleCoordinator";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import type { GenerationExecution } from "../types/blueprint";

const PROJECT = "project-alpha";
const EXECUTION = "exec-1";

function seed() {
  const storage = new InMemoryStorageProvider();
  storage.set("projects", PROJECT, {
    id: PROJECT,
    status: "generating",
    generationCount: 1,
    qualityScore: 0,
  });
  storage.set("generation_executions", EXECUTION, {
    id: EXECUTION,
    blueprint_id: "blueprint-1",
    project_id: PROJECT,
    user_id: "owner",
    started_at: new Date(0),
    status: "running",
    retry_count: 0,
    pipeline_steps: [],
  } satisfies GenerationExecution);
  return { storage, coordinator: new GenerationOutcomeCoordinator(storage) };
}

/** Six agents ran, then the recorder failed. */
const STEPS_AFTER_PARTIAL_RUN: GenerationExecution["pipeline_steps"] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    agent: `agent-${index}`,
    status: "completed" as const,
  })),
  { agent: "recorder", status: "failed" as const, error: "recorder exploded" },
];

describe("PIPELINE-TRUTH-1 completion boundary", () => {
  it("reports nothing when a failure commits without its steps", async () => {
    const { storage, coordinator } = seed();

    // This is the trap the service-side change exists to avoid. The coordinator
    // falls back to the record's existing steps when an update omits them, and
    // at start those are the empty array — so a failure that forgets to pass
    // what ran erases it. Pinned here because the fallback is easy to reach by
    // accident and its result looks like a run that never did anything.
    await coordinator.commit(EXECUTION, {
      status: "failed",
      completed_at: new Date(10),
      error_message: "artifact recording failed",
    });

    expect(
      storage.get<GenerationExecution>("generation_executions", EXECUTION)
        ?.pipeline_steps,
    ).toEqual([]);
    expect(
      storage.get<{ stagesCompleted: number }>("generation_history", EXECUTION),
    ).toMatchObject({ stagesCompleted: 0, failures: 0, stagesTotal: 0 });
  });

  it("derives the project's quality from steps that ran, not from a constant", async () => {
    const { storage, coordinator } = seed();

    await coordinator.commit(EXECUTION, {
      status: "completed",
      completed_at: new Date(10),
      pipeline_steps: [
        {
          agent: "builder",
          status: "completed",
          evaluation: {
            qualityScore: 80,
            status: "passed",
            issueCount: 0,
            durationMs: 1,
          },
        },
        {
          agent: "validator",
          status: "completed",
          evaluation: {
            qualityScore: 60,
            status: "warning",
            issueCount: 1,
            durationMs: 1,
          },
        },
      ],
    });

    const project = storage.get<{ status: string; qualityScore: number }>(
      "projects",
      PROJECT,
    );
    expect(project?.status).toBe("ready");
    // The bridge used to write 100 here regardless of what happened.
    expect(project?.qualityScore).toBe(70);
  });

  it("does not mark a project ready when the canonical outcome failed", async () => {
    const { storage, coordinator } = seed();

    await coordinator.commit(EXECUTION, {
      status: "failed",
      completed_at: new Date(10),
      error_message: "artifact recording failed",
      pipeline_steps: STEPS_AFTER_PARTIAL_RUN,
    });

    // This is the split the finding is about: the DAG succeeded, the canonical
    // generation did not, and the project must reflect the latter.
    expect(storage.get<{ status: string }>("projects", PROJECT)?.status).toBe(
      "draft",
    );
  });

  it("keeps the steps that ran when the run fails after them", async () => {
    const { storage, coordinator } = seed();

    await coordinator.commit(EXECUTION, {
      status: "failed",
      completed_at: new Date(10),
      error_message: "artifact recording failed",
      pipeline_steps: STEPS_AFTER_PARTIAL_RUN,
    });

    const execution = storage.get<GenerationExecution>(
      "generation_executions",
      EXECUTION,
    );
    expect(execution?.pipeline_steps).toHaveLength(7);

    // The refreshed client used to see zero of each of these.
    const history = storage.get<{
      stagesCompleted: number;
      failures: number;
      stagesTotal: number;
    }>("generation_history", EXECUTION);
    expect(history).toMatchObject({
      stagesCompleted: 6,
      failures: 1,
      stagesTotal: 7,
    });
  });

  it("records nothing rather than guessing when no step was ever derived", async () => {
    const { storage, coordinator } = seed();

    await coordinator.commit(EXECUTION, {
      status: "failed",
      completed_at: new Date(10),
      error_message: "failed before planning produced a graph",
      pipeline_steps: [],
    });

    // An empty record is honest here: nothing ran, so nothing is claimed.
    expect(
      storage.get<{ stagesTotal: number }>("generation_history", EXECUTION),
    ).toMatchObject({ stagesCompleted: 0, failures: 0, stagesTotal: 0 });
  });
});
