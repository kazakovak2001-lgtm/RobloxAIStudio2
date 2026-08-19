/**
 * POSTGRES-COHERENCE-1 — multi-instance coherence for the durable
 * project/generation lifecycle.
 *
 * Drives two independent `PostgresStorageProvider` instances — each with its
 * own process-local cache and its own pooled connection — against the SAME
 * PostgreSQL database, and runs `ProjectGenerationStartCoordinator` /
 * `GenerationOutcomeCoordinator` on each. This is the only way to prove
 * whether a second backend process observes durable state committed by a
 * first one, because a single shared storage object cannot expose a
 * process-local cache going stale.
 *
 * Requires RUN_POSTGRES_E2E=true and a reachable DATABASE_URL. Skipped
 * otherwise, matching core1b.postgres.integration.test.ts.
 */

import { describe, expect, it } from "vitest";
import { PostgresStorageProvider } from "../platform/storage/postgres/PostgresStorageProvider";
import { runMigrations } from "../platform/storage/postgres/migrationRunner";
import {
  ActiveGenerationConflictError,
  GenerationOutcomeCoordinator,
  ProjectGenerationStartCoordinator,
  type GenerationActiveClaim,
} from "../platform/projects/ProjectLifecycleCoordinator";
import type { GenerationExecution } from "../types/blueprint";

const describePostgres =
  process.env.RUN_POSTGRES_E2E === "true" ? describe : describe.skip;

const PROJECTS = "projects";
const EXECUTIONS = "generation_executions";
const HISTORY = "generation_history";
const ACTIVE_CLAIMS = "generation_active_claims";
const START_REQUESTS = "generation_start_requests";

interface StoredProject {
  id: string;
  generationCount: number;
  status: string;
  qualityScore?: number;
  updatedAt?: number;
}

function projectRepo(storage: PostgresStorageProvider) {
  return {
    get: (projectId: string) => storage.get<StoredProject>(PROJECTS, projectId),
    updateDurable: async () => {
      throw new Error(
        "start() must commit the project write inside the durable batch",
      );
    },
  };
}

function coordinatorsFor(storage: PostgresStorageProvider) {
  return {
    start: new ProjectGenerationStartCoordinator(projectRepo(storage), storage),
    outcome: new GenerationOutcomeCoordinator(storage),
  };
}

function baseExecution(
  executionId: string,
  projectId: string,
): GenerationExecution {
  return {
    id: executionId,
    project_id: projectId,
    blueprint_id: `${executionId}-blueprint`,
    user_id: "coherence-test-user",
    status: "running",
    started_at: new Date(0),
    retry_count: 0,
    pipeline_steps: [],
  } as unknown as GenerationExecution;
}

function startMutationsFor(execution: GenerationExecution) {
  return [
    {
      operation: "set" as const,
      collection: EXECUTIONS,
      id: execution.id,
      data: execution,
    },
    {
      operation: "set" as const,
      collection: HISTORY,
      id: execution.id,
      data: {
        id: execution.id,
        projectId: execution.project_id,
        pipelineId: execution.id,
        status: execution.status,
        startedAt: execution.started_at.getTime(),
        stagesCompleted: 0,
        stagesTotal: 0,
        failures: 0,
        tokenUsage: 0,
        aiCost: 0,
      },
    },
  ];
}

describePostgres("POSTGRES-COHERENCE-1 — generation lifecycle", () => {
  it("keeps project/generation state coherent across two backend instances", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for the PostgreSQL E2E test");
    }

    await runMigrations();
    const instanceA = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });
    const instanceB = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });

    try {
      await Promise.all([instanceA.ready(), instanceB.ready()]);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const projectId = `coherence-project-${suffix}`;

      // A project that already exists before either instance's request
      // arrives — the realistic case, not one created moments earlier by a
      // sibling instance.
      await instanceA.setDurable<StoredProject>(PROJECTS, projectId, {
        id: projectId,
        generationCount: 0,
        status: "draft",
      });
      await instanceB.refresh([PROJECTS]);

      const coordA = coordinatorsFor(instanceA);
      const coordB = coordinatorsFor(instanceB);

      // ── Case 1 + start admission ────────────────────────────────────
      // A starts a generation. B must be refused a conflicting claim
      // without ever having refreshed manually — the coordinator's own
      // durable read has to catch it up.
      const execA = baseExecution(`exec-a-${suffix}`, projectId);
      const startRequestKey = `start-request-${suffix}`;
      await coordA.start.start(
        projectId,
        async () => ({ execution: execA }),
        ({ execution }) => startMutationsFor(execution),
        ({ execution }) => execution.id,
        undefined,
        {
          key: startRequestKey,
          principal: "coherence-test-user",
          fingerprint: "fingerprint-a",
          replay: async (executionId: string) => ({
            execution: { ...execA, id: executionId },
          }),
        },
      );

      // Case: A acquires the claim; B cannot acquire a conflicting one —
      // and the conflict error must name the real winner, not `undefined`,
      // which only holds if B's read of the claim is fresh.
      const conflictingExec = baseExecution(
        `exec-b-conflict-${suffix}`,
        projectId,
      );
      await expect(
        coordB.start.start(
          projectId,
          async () => ({ execution: conflictingExec }),
          ({ execution }) => startMutationsFor(execution),
          ({ execution }) => execution.id,
        ),
      ).rejects.toThrow(ActiveGenerationConflictError);

      try {
        await coordB.start.start(
          projectId,
          async () => ({ execution: conflictingExec }),
          ({ execution }) => startMutationsFor(execution),
          ({ execution }) => execution.id,
        );
        throw new Error("expected ActiveGenerationConflictError");
      } catch (error) {
        expect(error).toBeInstanceOf(ActiveGenerationConflictError);
        expect((error as ActiveGenerationConflictError).activeExecutionId).toBe(
          execA.id,
        );
      }

      // ── Case: idempotency replay started on A is recognized on B ────
      // Same idempotency key, same project/principal/fingerprint, landing
      // on the instance that never made the original request — must
      // replay, not conflict.
      const replayResult = await coordB.start.start(
        projectId,
        async () => {
          throw new Error("prepare must not run again on replay");
        },
        () => {
          throw new Error("buildStartEvidence must not run again on replay");
        },
        () => {
          throw new Error("resolveExecutionId must not run again on replay");
        },
        undefined,
        {
          key: startRequestKey,
          principal: "coherence-test-user",
          fingerprint: "fingerprint-a",
          replay: async (executionId: string) => ({
            execution: { ...execA, id: executionId },
          }),
        },
      );
      expect(replayResult.execution.id).toBe(execA.id);

      // ── Case: B observes the terminal outcome committed by A ────────
      const completedExecA: GenerationExecution = {
        ...execA,
        status: "completed",
        completed_at: new Date(1_000),
        pipeline_steps: [],
      } as unknown as GenerationExecution;
      await instanceA.setDurable(EXECUTIONS, execA.id, {
        ...execA,
        started_at: execA.started_at,
      });
      const committed = await coordA.outcome.commit(execA.id, completedExecA);
      expect(committed?.status).toBe("completed");

      // B never called refresh directly. Its process-local cache still has
      // the pre-commit project row (generationCount 1, status generating)
      // until something reads through it — proving the coordinator path
      // (not a raw `get`) is what has to resolve the true state: start a
      // fresh generation on B and confirm the count is built from A's
      // committed value, not B's stale local one.
      const execB = baseExecution(`exec-b-${suffix}`, projectId);
      const secondStart = await coordB.start.start(
        projectId,
        async () => ({ execution: execB }),
        ({ execution }) => startMutationsFor(execution),
        ({ execution }) => execution.id,
      );
      expect(secondStart.execution.id).toBe(execB.id);

      await instanceA.refresh([PROJECTS]);
      const projectOnARefreshed = instanceA.get<StoredProject>(
        PROJECTS,
        projectId,
      );
      // generationCount must be 2 (A's start, then B's start), never
      // reverted to 1 by a start computed off B's stale pre-commit copy.
      expect(projectOnARefreshed?.generationCount).toBe(2);
      expect(projectOnARefreshed?.status).toBe("generating");

      // ── Case: delete/update on A is not resurrected from B's stale
      // process-local cache. B releases its own claim by completing
      // execB; the claim record must actually be gone in Postgres, not
      // just locally on B.
      const completedExecB: GenerationExecution = {
        ...execB,
        status: "completed",
        completed_at: new Date(2_000),
        pipeline_steps: [],
      } as unknown as GenerationExecution;
      await instanceB.setDurable(EXECUTIONS, execB.id, execB);
      await coordB.outcome.commit(execB.id, completedExecB);
      await instanceA.refresh([ACTIVE_CLAIMS]);
      expect(
        instanceA.get<GenerationActiveClaim>(ACTIVE_CLAIMS, projectId),
      ).toBeNull();

      // ── Case: restart proves persisted state remains canonical ──────
      await instanceA.close();
      const reopened = new PostgresStorageProvider({
        connectionString: databaseUrl,
        strict: true,
      });
      try {
        await reopened.ready();
        const persistedProject = reopened.get<StoredProject>(
          PROJECTS,
          projectId,
        );
        expect(persistedProject?.status).toBe("ready");
        expect(persistedProject?.generationCount).toBe(2);
        expect(
          reopened.get<GenerationActiveClaim>(ACTIVE_CLAIMS, projectId),
        ).toBeNull();
      } finally {
        await reopened.close();
      }
    } finally {
      await Promise.all([
        instanceA.close().catch(() => undefined),
        instanceB.close().catch(() => undefined),
      ]);
    }
  });

  it("gives exactly one authoritative winner for a concurrent start race", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for the PostgreSQL E2E test");
    }

    await runMigrations();
    const instanceA = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });
    const instanceB = new PostgresStorageProvider({
      connectionString: databaseUrl,
      strict: true,
    });

    try {
      await Promise.all([instanceA.ready(), instanceB.ready()]);
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const projectId = `coherence-race-${suffix}`;

      await instanceA.setDurable<StoredProject>(PROJECTS, projectId, {
        id: projectId,
        generationCount: 0,
        status: "draft",
      });
      await instanceB.refresh([PROJECTS]);

      const coordA = coordinatorsFor(instanceA);
      const coordB = coordinatorsFor(instanceB);
      const execA = baseExecution(`exec-race-a-${suffix}`, projectId);
      const execB = baseExecution(`exec-race-b-${suffix}`, projectId);

      const results = await Promise.allSettled([
        coordA.start.start(
          projectId,
          async () => ({ execution: execA }),
          ({ execution }) => startMutationsFor(execution),
          ({ execution }) => execution.id,
        ),
        coordB.start.start(
          projectId,
          async () => ({ execution: execB }),
          ({ execution }) => startMutationsFor(execution),
          ({ execution }) => execution.id,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ActiveGenerationConflictError,
      );

      await instanceA.refresh([EXECUTIONS, ACTIVE_CLAIMS, PROJECTS]);
      const executions = instanceA.list<GenerationExecution>(
        EXECUTIONS,
        (e) => e.project_id === projectId,
      );
      // Exactly one execution durably committed — the loser's prepare
      // result never became a durable record.
      expect(executions).toHaveLength(1);
      const claim = instanceA.get<GenerationActiveClaim>(
        ACTIVE_CLAIMS,
        projectId,
      );
      expect(claim?.executionId).toBe(executions[0]?.id);
      const project = instanceA.get<StoredProject>(PROJECTS, projectId);
      expect(project?.generationCount).toBe(1);
    } finally {
      await Promise.all([
        instanceA.close().catch(() => undefined),
        instanceB.close().catch(() => undefined),
      ]);
    }
  });
});
