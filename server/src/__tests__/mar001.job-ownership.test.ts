/**
 * MAR-001 — distributed job ownership, and plan access left as it was.
 *
 * Two families, treated differently on purpose.
 *
 * The job routes resolved correctly — they loaded the job and authorized its own
 * project — but a job that did not exist answered "Job not found" while another
 * tenant's fell through to the project control and answered "Project not
 * found". The two bodies told a caller which job ids were real. `POST /retry`
 * is the sharp end: it re-queues work, so a refusal that leaked existence sat
 * next to an operation that spends compute.
 *
 * The plan routes already conceal correctly and are not touched. They get the
 * behavioural evidence they never had and nothing else, because rewriting a
 * correct control to look like the others would be churn with a migration's
 * risk and none of its value.
 */

import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ExecutionJobQueue } from "../distributed/execution/ExecutionJobQueue";
import { ExecutionCoordinator } from "../distributed/execution/ExecutionCoordinator";
import { createProjectRuntime } from "../routes/projects";
import { createDistributedRouter } from "../routes/distributed";
import { createPlanningRouter } from "../routes/planning";

const OWNER = { token: "token-owner", userId: "user-owner" };
const INTRUDER = { token: "token-intruder", userId: "user-intruder" };

let server: Server | undefined;
let queue: ExecutionJobQueue | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  queue = undefined;
});

async function startTenants() {
  const storage = new InMemoryStorageProvider();
  const auth = {
    validateToken: async (token: string) => {
      if (token === OWNER.token) return { userId: OWNER.userId };
      if (token === INTRUDER.token) return { userId: INTRUDER.userId };
      return null;
    },
  };
  const runtime = createProjectRuntime(storage, auth as never);

  const ownerProject = await runtime.projectRepository.createDurable(
    OWNER.userId,
    "Owner project",
    "adventure",
    "Owns the job",
    {},
  );
  const intruderProject = await runtime.projectRepository.createDurable(
    INTRUDER.userId,
    "Intruder project",
    "adventure",
    "The caller's own",
    {},
  );

  queue = new ExecutionJobQueue();
  const coordinator = new ExecutionCoordinator(new AgentRegistry(), queue);

  const liveJob = queue.enqueue({
    intent: "generate the owner's game",
    projectId: ownerProject.id,
  });

  // A second job driven all the way into the dead-letter queue, so retry has
  // something real to act on. Anything less would make the retry assertions
  // pass because nothing could be retried at all.
  const deadJob = queue.enqueue({
    intent: "a job that will fail",
    projectId: ownerProject.id,
    maxAttempts: 1,
  });
  queue.dequeue("worker-1");
  queue.dequeue("worker-1");
  queue.fail(deadJob.jobId, "injected failure");
  queue.fail(liveJob.jobId, "requeue");
  const dead = queue.getDeadLetterQueue();
  if (!dead.some((entry) => entry.job.jobId === deadJob.jobId)) {
    throw new Error("Fixture did not reach the dead-letter queue");
  }

  const app = express();
  app.use(express.json());
  app.use(
    "/api/distributed",
    createDistributedRouter(coordinator, runtime.access),
  );
  // Mounted alongside so the plan family gets the behavioural evidence it never
  // had, without being rewritten. Its control is already resource-derived and
  // already conceals; changing it would be churn carrying a migration's risk.
  app.use(
    "/api/plan",
    createPlanningRouter(new AgentRegistry(), runtime.access),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    base: `http://127.0.0.1:${address.port}/api/distributed`,
    ownerProjectId: ownerProject.id,
    deadJobId: deadJob.jobId,
    liveJobId: liveJob.jobId,
    intruderProjectId: intruderProject.id,
  };
}

function send(base: string, path: string, token: string, method = "GET") {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
}

async function read(response: globalThis.Response) {
  return { status: response.status, body: await response.json() };
}

describe("MAR-001 job existence is not disclosed", () => {
  it("answers identically for another tenant's job and a missing one", async () => {
    const { base, deadJobId } = await startTenants();

    const foreign = await read(
      await send(base, `/job/${deadJobId}`, INTRUDER.token),
    );
    const missing = await read(
      await send(base, "/job/job-that-does-not-exist", INTRUDER.token),
    );

    // Before this slice: "Project not found" against "Job not found".
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("answers identically when retrying either", async () => {
    const { base, deadJobId } = await startTenants();

    const foreign = await read(
      await send(base, `/retry/${deadJobId}`, INTRUDER.token, "POST"),
    );
    const missing = await read(
      await send(base, "/retry/no-such-job", INTRUDER.token, "POST"),
    );

    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("does not re-queue the job it refuses", async () => {
    const { base, deadJobId } = await startTenants();

    await send(base, `/retry/${deadJobId}`, INTRUDER.token, "POST");

    // Retrying spends compute. A refusal that re-queued the job anyway would
    // satisfy every status assertion above and hand an intruder a way to make
    // another tenant's work run again.
    const stillDead = queue
      ?.getDeadLetterQueue()
      .some((entry) => entry.job.jobId === deadJobId);
    expect(stillDead).toBe(true);
  });

  it("answers a refused job once", async () => {
    const { base, deadJobId } = await startTenants();
    const errors: unknown[] = [];
    const capture = (error: unknown) => errors.push(error);
    process.on("uncaughtException", capture);
    process.on("unhandledRejection", capture);

    try {
      await send(base, `/job/${deadJobId}`, INTRUDER.token);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off("uncaughtException", capture);
      process.off("unhandledRejection", capture);
    }

    // The route used to write its own 404 after the access check had already
    // answered, so every denied request threw ERR_HTTP_HEADERS_SENT and the
    // refusal surfaced as an unhandled error.
    expect(errors).toEqual([]);
  });

  it("says nothing of the job it refuses", async () => {
    const { base, deadJobId } = await startTenants();

    const foreign = await read(
      await send(base, `/job/${deadJobId}`, INTRUDER.token),
    );

    expect(JSON.stringify(foreign.body)).not.toContain("a job that will fail");
    expect(foreign.body).toEqual({ success: false, error: "Job not found" });
  });

  it("shows the caller only their own dead letters", async () => {
    const { base } = await startTenants();

    const intruder = await read(
      await send(base, "/dead-letter", INTRUDER.token),
    );
    const owner = await read(await send(base, "/dead-letter", OWNER.token));

    expect((intruder.body as { data: { count: number } }).data.count).toBe(0);
    expect(
      (owner.body as { data: { count: number } }).data.count,
    ).toBeGreaterThan(0);
  });

  it("still lets the owner read and retry their own job", async () => {
    const { base, deadJobId } = await startTenants();

    // Without this the refusals above would also hold if the routes were broken
    // for everyone.
    expect((await send(base, `/job/${deadJobId}`, OWNER.token)).status).toBe(
      200,
    );

    const retried = await read(
      await send(base, `/retry/${deadJobId}`, OWNER.token, "POST"),
    );
    expect(retried.status).toBe(200);
    expect(
      queue?.getDeadLetterQueue().some((e) => e.job.jobId === deadJobId),
    ).toBe(false);
  });
});

describe("MAR-001 plan access, verified rather than migrated", () => {
  async function seedPlan(origin: string, projectId: string) {
    const response = await fetch(`${origin}/api/plan/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OWNER.token}`,
      },
      body: JSON.stringify({ projectId, intent: "Generate a Roblox game" }),
    });
    if (response.status !== 200) {
      throw new Error(`Fixture could not create a plan: ${response.status}`);
    }
    const body = (await response.json()) as { data: { planId: string } };
    return body.data.planId;
  }

  it("answers identically for another tenant's plan and a missing one", async () => {
    const { origin, ownerProjectId } = await startTenants();
    const planId = await seedPlan(origin, ownerProjectId);

    const foreign = await read(
      await fetch(`${origin}/api/plan/${planId}`, {
        headers: { authorization: `Bearer ${INTRUDER.token}` },
      }),
    );
    const missing = await read(
      await fetch(`${origin}/api/plan/plan-that-does-not-exist`, {
        headers: { authorization: `Bearer ${INTRUDER.token}` },
      }),
    );

    // Already true before this slice. Recorded because a binding nobody has
    // exercised is a claim, and the matrix distinguishes the two.
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
  });

  it("does not execute another tenant's plan", async () => {
    const { origin, ownerProjectId } = await startTenants();
    const planId = await seedPlan(origin, ownerProjectId);

    const response = await read(
      await fetch(`${origin}/api/plan/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${INTRUDER.token}`,
        },
        body: JSON.stringify({ planId }),
      }),
    );

    // Executing a plan runs agents and spends provider budget, so the refusal
    // has to come before any of it.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: "Plan not found" });
  });

  it("still lets the owner read their own plan", async () => {
    const { origin, ownerProjectId } = await startTenants();
    const planId = await seedPlan(origin, ownerProjectId);

    const owned = await read(
      await fetch(`${origin}/api/plan/${planId}`, {
        headers: { authorization: `Bearer ${OWNER.token}` },
      }),
    );
    expect(owned.status).toBe(200);
  });
});
