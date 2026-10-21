/**
 * SEC-RT-1B / SEC-REALTIME-TRACE-001 — execution traces must not cross tenants.
 *
 * `trace.event` was broadcast to every connected socket, and the trace model
 * carried no project at all, so there was nothing to scope it by. A payload
 * names the execution, the node, the agent, its evaluation score and its
 * errors. The project was available where the trace starts — `executePlan`
 * already receives it — it simply was not carried through, so this closes the
 * gap by propagating it rather than by looking a project up from an execution
 * id after the fact.
 *
 * The process-wide tracer had a second unfiltered consumer: the SSE stream in
 * the v2 API attached a listener that forwarded every concurrent execution's
 * events into one caller's response.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ExecutionTracer } from "../core/observability/ExecutionTracer";
import { RealtimeServer } from "../socket/index";
import type { ExecutionTraceEvent } from "../core/observability/types";

const PROJECT_A = "project-alpha";
const PROJECT_B = "project-beta";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  ExecutionTracer.resetInstance();
});

async function socketHarness() {
  const tracer = ExecutionTracer.instance();
  const httpServer: HttpServer = createServer();
  const io = new SocketServer(httpServer);
  new RealtimeServer(io);

  // The production wiring from the server entrypoint, kept identical here.
  tracer.addListener((event: ExecutionTraceEvent) => {
    if (!event.projectId) return;
    io.to(`project:${event.projectId}`).emit("trace.event", {
      executionId: event.executionId,
      projectId: event.projectId,
      nodeId: event.nodeId,
      agentId: event.agentId,
      eventType: event.eventType,
      timestamp: event.timestamp,
    });
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  const url = `http://127.0.0.1:${address.port}`;

  const clientA = connect(url, { transports: ["websocket"] });
  const clientB = connect(url, { transports: ["websocket"] });
  await Promise.all(
    [clientA, clientB].map(
      (client) =>
        new Promise<void>((resolve) => client.once("connect", () => resolve())),
    ),
  );

  const join = (client: ClientSocket, projectId: string) =>
    new Promise<void>((resolve) => {
      client.once("project:joined", () => resolve());
      client.emit("project:join", { projectId });
    });
  await join(clientA, PROJECT_A);
  await join(clientB, PROJECT_B);

  cleanup = async () => {
    clientA.close();
    clientB.close();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { tracer, clientA, clientB };
}

function collect(client: ClientSocket, into: string[]): void {
  client.on("trace.event", (payload: { executionId: string }) =>
    into.push(payload.executionId),
  );
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe("SEC-RT-1B trace tenancy", () => {
  it("delivers traces only to the room of the execution's project", async () => {
    const h = await socketHarness();
    const toA: string[] = [];
    const toB: string[] = [];
    collect(h.clientA, toA);
    collect(h.clientB, toB);

    h.tracer.startExecution("exec-a", "plan-a", "goal", 1, PROJECT_A);
    h.tracer.traceNodeStart("exec-a", "node-1", "designer", {});
    await settle();

    expect(toA).toEqual(["exec-a", "exec-a"]);
    // This previously arrived here too.
    expect(toB).toEqual([]);
  });

  it("carries the project onto every event without threading it per call", async () => {
    const tracer = ExecutionTracer.instance();
    const seen: ExecutionTraceEvent[] = [];
    tracer.addListener((event) => seen.push(event));

    tracer.startExecution("exec-c", "plan-c", "goal", 2, PROJECT_A);
    tracer.traceNodeStart("exec-c", "node-1", "designer", {});
    tracer.traceNodeComplete("exec-c", "node-1", "designer", {}, 5, 0.9);

    // traceNodeStart and traceNodeComplete never receive a project themselves;
    // the tracer resolves it from the execution, so a trace method added later
    // cannot forget to carry it.
    expect(seen).toHaveLength(3);
    expect(seen.every((event) => event.projectId === PROJECT_A)).toBe(true);
  });

  it("drops a trace whose execution has no project rather than broadcasting", async () => {
    const h = await socketHarness();
    const toA: string[] = [];
    const toB: string[] = [];
    collect(h.clientA, toA);
    collect(h.clientB, toB);

    // An execution started without a project cannot be addressed to anyone.
    h.tracer.startExecution("exec-unscoped", "plan-x", "goal", 1);
    h.tracer.traceNodeStart("exec-unscoped", "node-1", "designer", {});
    await settle();

    expect(toA).toEqual([]);
    expect(toB).toEqual([]);
  });

  it("restricts a stream consumer to its own execution", async () => {
    const tracer = ExecutionTracer.instance();
    const streamed: string[] = [];

    // The v2 SSE filter, which previously forwarded every execution.
    tracer.addListener((event) => {
      if (event.executionId !== "exec-mine") return;
      if (event.projectId && event.projectId !== PROJECT_A) return;
      streamed.push(event.eventType);
    });

    tracer.startExecution("exec-mine", "plan-mine", "goal", 1, PROJECT_A);
    tracer.startExecution("exec-theirs", "plan-theirs", "goal", 1, PROJECT_B);
    tracer.traceNodeStart("exec-theirs", "node-1", "designer", {});
    tracer.traceNodeStart("exec-mine", "node-1", "designer", {});

    expect(streamed).toEqual(["plan.started", "node.started"]);
  });
});
