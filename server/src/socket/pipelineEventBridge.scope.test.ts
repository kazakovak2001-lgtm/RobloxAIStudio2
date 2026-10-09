import type { Server as SocketServer } from "socket.io";
import { describe, expect, it } from "vitest";
import {
  registerPipelineEventBridge,
  type PipelineBridgeRunRecord,
} from "./pipelineEventBridge";
import { PipelineEventEmitter } from "./streaming";

/**
 * SEC-BRIDGE-HISTORY-SCOPE-001. The bridge finds the run record by pipelineId
 * alone. A failure event must only mark a record that belongs to the event's
 * own project failed — never another project's record that happens to share
 * the routing key.
 */
function harness(recordProjectId: string) {
  const record: PipelineBridgeRunRecord = {
    pipelineId: "pipeline-shared",
    projectId: recordProjectId,
    status: "running",
    startedAt: 1_000,
    stagesCompleted: 1,
    stagesTotal: 4,
    failures: 0,
  };
  const written: PipelineBridgeRunRecord[] = [];
  const emitted: string[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string) => {
        emitted.push(`${room}:${event}`);
      },
    }),
  } as unknown as SocketServer;
  const events = new PipelineEventEmitter();
  registerPipelineEventBridge(
    io,
    events,
    { updateDurable: async () => null },
    {
      getByPipeline: (pipelineId) =>
        pipelineId === record.pipelineId ? record : null,
      record: async (entry) => {
        written.push(entry);
      },
    },
  );
  return { events, written, emitted };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SEC-BRIDGE-HISTORY-SCOPE-001 pipeline bridge history scope", () => {
  it("marks the run failed when the record belongs to the event's project", async () => {
    const { events, written } = harness("project-a");
    await events.emitPipelineFailed("pipeline-shared", "boom", "project-a");
    await settle();

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      projectId: "project-a",
      status: "failed",
    });
  });

  it("leaves another project's record untouched when the pipelineId collides", async () => {
    const { events, written, emitted } = harness("project-b");
    await events.emitPipelineFailed("pipeline-shared", "boom", "project-a");
    await settle();

    expect(written).toEqual([]);
    // The event itself is still delivered, and only to its own project.
    expect(emitted).toEqual(["project:project-a:pipeline.failed"]);
  });
});
