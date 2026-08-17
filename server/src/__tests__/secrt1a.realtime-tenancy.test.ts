/**
 * SEC-RT-1A / SEC-REALTIME-GLOBAL-001 — realtime events must not cross tenants.
 *
 * Thirteen evaluation, memory and planning emissions used `io.emit`, which
 * delivers to every connected socket, even though they sat in the same switch
 * as the project-room emitter and had the same project in scope. A client
 * subscribed to one project therefore received another project's evaluation
 * scores, memory decisions and planning steps. Filtering them out in the
 * browser is not a boundary: by then the payload has already been delivered.
 *
 * This drives the real bridge over real Socket.IO connections and asserts what
 * a foreign client actually receives, rather than asserting strings in the
 * bridge source.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";
import { createProjectRuntime } from "../routes/projects";
import { RealtimeServer } from "../socket/index";
import { registerPipelineEventBridge } from "../socket/pipelineEventBridge";
import { PipelineEventEmitter } from "../socket/streaming";
import type { PipelineEvent } from "../types/pipeline-events";

const PROJECT_A = "project-alpha";
const PROJECT_B = "project-beta";

interface Harness {
  events: PipelineEventEmitter;
  clientA: ClientSocket;
  clientB: ClientSocket;
  close: () => Promise<void>;
}

let active: Harness | undefined;

afterEach(async () => {
  await active?.close();
  active = undefined;
});

async function joined(socket: ClientSocket, projectId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("project:joined", () => resolve());
    socket.once("project:error", (error: unknown) =>
      reject(new Error(`join refused: ${JSON.stringify(error)}`)),
    );
    socket.emit("project:join", { projectId });
  });
}

async function harness(): Promise<Harness> {
  const storage = new InMemoryStorageProvider();
  const runtime = createProjectRuntime(storage);
  const events = new PipelineEventEmitter();

  const httpServer: HttpServer = createServer();
  const io = new SocketServer(httpServer);
  new RealtimeServer(io);
  registerPipelineEventBridge(
    io,
    events,
    runtime.projectRepository,
    runtime.generationHistory,
  );

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
  await Promise.all([
    new Promise<void>((resolve) => clientA.once("connect", () => resolve())),
    new Promise<void>((resolve) => clientB.once("connect", () => resolve())),
  ]);
  await joined(clientA, PROJECT_A);
  await joined(clientB, PROJECT_B);

  const built: Harness = {
    events,
    clientA,
    clientB,
    close: async () => {
      clientA.close();
      clientB.close();
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
  active = built;
  return built;
}

/** Collects every event name a client receives until the deadline. */
function record(socket: ClientSocket, received: string[]): void {
  socket.onAny((eventName: string) => received.push(eventName));
}

function event(type: string, projectId?: string): PipelineEvent {
  return {
    type: type as PipelineEvent["type"],
    pipelineId: "pipeline-1",
    projectId,
    stepId: "step-1",
    data: { qualityScore: 91, agentType: "designer" },
    timestamp: new Date(0),
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe("SEC-RT-1A realtime tenancy", () => {
  const leakProne = [
    "evaluation.started",
    "evaluation.completed",
    "evaluation.failed",
    "memory.created",
    "memory.updated",
    "memory.snapshot",
    "memory.decision",
    "planning.created",
    "planning.updated",
    "planning.step.selected",
    "planning.replanned",
    "planning.completed",
    "planning.failed",
  ];

  it("delivers each event only to the room of its own project", async () => {
    const h = await harness();
    const toA: string[] = [];
    const toB: string[] = [];
    record(h.clientA, toA);
    record(h.clientB, toB);

    for (const type of leakProne) {
      await h.events.emit(event(type, PROJECT_A));
    }
    await settle();

    // Every one of these previously reached both clients.
    expect(toA).toEqual(leakProne);
    expect(toB).toEqual([]);
  });

  it("does not deliver another project's pipeline lifecycle events", async () => {
    const h = await harness();
    const toB: string[] = [];
    record(h.clientB, toB);

    await h.events.emit(event("pipeline.started", PROJECT_A));
    await h.events.emit(event("step.started", PROJECT_A));
    await settle();

    expect(toB).toEqual([]);
  });

  it("drops an event that carries no project rather than broadcasting it", async () => {
    const h = await harness();
    const toA: string[] = [];
    const toB: string[] = [];
    record(h.clientA, toA);
    record(h.clientB, toB);

    // The previous fallback sent this to every connected socket.
    await h.events.emit(event("evaluation.completed", undefined));
    await h.events.emit(event("pipeline.started", undefined));
    await settle();

    expect(toA).toEqual([]);
    expect(toB).toEqual([]);
  });
});
