/**
 * STUDIO-2F-A — backend verification of UI screen receipts.
 *
 * The plugin reports which screen landed where. Without this check the backend
 * accepted the count and hash alone, so a delivery that materialized the right
 * number of screens under the wrong names, or omitted one entirely, verified
 * cleanly. The expected set is computed from the stored artifact content, so
 * the plugin cannot define its own success criteria.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSharedStudioRuntime,
  resetSharedStudioRuntimeForTests,
} from "../studio/v2/StudioRuntime";
import {
  ArtifactStore,
  configureArtifactStorageFactory,
} from "../pipeline/v2/ArtifactStore";
import { UIInstanceTreeBuilder } from "../ui-gen/UIInstanceTreeBuilder";
import type { StudioScreenReceipt } from "../studio/v2/StudioTypes";
import { parseImportReport } from "../routes/studio";

/** ARTIFACT-CONTRACT-2 requires an owning project on every new artifact. */
const ARTIFACT_TEST_PROJECT = "artifact-contract-test-project";

const PROJECT_ID = "proj-receipt-verification";

function uiDesign(): Record<string, unknown> {
  return {
    screens: [
      { name: "MainHUD", type: "hud", elements: [{ id: "score", label: "0" }] },
      {
        name: "MainMenu",
        type: "menu",
        elements: [{ id: "play", type: "TextButton", label: "Play" }],
      },
    ],
  };
}

function uiTreeContent(): Record<string, unknown> {
  const tree = new UIInstanceTreeBuilder().build(uiDesign());
  return { uiDesign: uiDesign(), ...tree };
}

/**
 * Drive a full queue → acknowledge → report cycle and return the outcome, so
 * verification is exercised through the real runtime rather than by calling
 * the private verifier.
 */
async function reportDelivery(
  screens: StudioScreenReceipt[] | undefined,
  options: { omitScreensField?: boolean } = {},
) {
  const runtime = getSharedStudioRuntime();
  const store = new ArtifactStore();
  configureArtifactStorageFactory(() => backingStore);

  const executionId = `exec-${PROJECT_ID}`;
  await store.store(
    executionId,
    "UI_GENERATION",
    "ui_generator",
    uiTreeContent(),
    { projectId: ARTIFACT_TEST_PROJECT },
  );

  const client = runtime.bridge.connect("0.600.0", PROJECT_ID);
  runtime.activateProjectExecution(PROJECT_ID, executionId);

  const queued = await runtime.queueProjectExport(
    client.clientId,
    PROJECT_ID,
    executionId,
  );
  expect(queued.success).toBe(true);

  const delivered = await runtime.drainCommands(client.clientId);
  const command = delivered[0];
  const acknowledged = await runtime.acknowledgeProjectExport(
    client.clientId,
    command.id,
  );
  expect(acknowledged.success).toBe(true);

  // Take the id and hash from the queued snapshot rather than recomputing
  // them, so these tests exercise screen verification rather than accidentally
  // failing the pre-existing hash check.
  const snapshot = command.payload.snapshot as {
    artifacts: Array<{ id: string; hash: string }>;
  };
  const expected = snapshot.artifacts[0];

  return runtime.reportProjectExport(client.clientId, command.id, {
    executionId,
    status: "completed",
    artifacts: [
      {
        artifactId: expected.id,
        hash: expected.hash,
        instancePath: "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION",
        ...(options.omitScreensField ? {} : { screens }),
      },
    ],
    reportedAt: 1,
  });
}

let backingStore: ReturnType<typeof createBackingStore>;

function createBackingStore() {
  const rows = new Map<string, Map<string, unknown>>();
  return {
    get<T>(collection: string, id: string): T | null {
      return (rows.get(collection)?.get(id) as T) ?? null;
    },
    list<T>(collection: string, filter?: (item: T) => boolean): T[] {
      const all = [...(rows.get(collection)?.values() ?? [])] as T[];
      return filter ? all.filter(filter) : all;
    },
    count(collection: string): number {
      return rows.get(collection)?.size ?? 0;
    },
    async setDurable<T>(collection: string, id: string, data: T) {
      if (!rows.has(collection)) rows.set(collection, new Map());
      rows.get(collection)!.set(id, data);
    },
  };
}

/**
 * Review found the first version of this feature was dead on arrival:
 * `parseImportReport` rebuilds every receipt field by field, so it dropped
 * `screens`, and each real UI export would have arrived carrying none and been
 * rejected. The runtime tests missed it because they call
 * `reportProjectExport` directly, below the transport boundary. Both the REST
 * endpoint and the `COMMAND_RESULT` protocol handler funnel through this
 * parser, so testing it covers both transports.
 */
describe("STUDIO-2F-A screen receipts survive the transport parser", () => {
  const receipt = (screens?: unknown) => ({
    status: "completed",
    executionId: "exec-1",
    artifacts: [
      {
        artifactId: "artifact-1",
        hash: "abc",
        instancePath: "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION",
        ...(screens === undefined ? {} : { screens }),
      },
    ],
  });

  it("preserves screenName and instancePath pairs verbatim", () => {
    const parsed = parseImportReport(
      receipt([
        {
          screenName: "MainHUD",
          instancePath:
            "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
        },
      ]),
    );

    expect(parsed.error).toBeUndefined();
    expect(parsed.data?.artifacts[0].screens).toEqual([
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
    ]);
  });

  it("leaves screens absent when the plugin reported none", () => {
    const parsed = parseImportReport(receipt());

    expect(parsed.error).toBeUndefined();
    expect(parsed.data?.artifacts[0].screens).toBeUndefined();
  });

  it.each([
    ["a non-array screens field", "not-an-array", /screens must be an array/],
    ["a non-object entry", ["nope"], /screen receipt must be an object/],
    [
      "an entry without screenName",
      [{ instancePath: "a" }],
      /requires screenName/,
    ],
    [
      "an entry without instancePath",
      [{ screenName: "MainHUD" }],
      /requires instancePath/,
    ],
  ])("rejects %s", (_label, screens, expected) => {
    expect(parseImportReport(receipt(screens)).error).toMatch(expected);
  });
});

describe("STUDIO-2F-A screen receipt verification", () => {
  beforeEach(() => {
    backingStore = createBackingStore();
  });

  afterEach(() => {
    resetSharedStudioRuntimeForTests();
  });

  it("verifies a delivery reporting every screen at its expected path", async () => {
    const result = await reportDelivery([
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
      {
        screenName: "MainMenu",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainMenu",
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
  });

  it("rejects a UI delivery that reports no screens at all", async () => {
    const result = await reportDelivery(undefined, { omitScreensField: true });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/reported no screen receipts/);
  });

  it("rejects a missing screen", async () => {
    const result = await reportDelivery([
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/missing a receipt for screen MainMenu/);
  });

  it("rejects an extra screen the artifact never contained", async () => {
    const result = await reportDelivery([
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
      {
        screenName: "MainMenu",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainMenu",
      },
      {
        screenName: "Sneaky",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.Sneaky",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/unexpected screen Sneaky/);
  });

  it("rejects a duplicate screen receipt", async () => {
    const result = await reportDelivery([
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
      {
        screenName: "MainHUD",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainHUD",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/duplicate screen receipt MainHUD/);
  });

  /**
   * The path is computed by the backend, not echoed from the receipt. A screen
   * landing somewhere else — StarterGui, say — must not verify.
   */
  it("rejects a screen materialized at the wrong path", async () => {
    const result = await reportDelivery([
      {
        screenName: "MainHUD",
        instancePath: "StarterGui.MainHUD",
      },
      {
        screenName: "MainMenu",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainMenu",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/instead of/);
  });

  it("rejects a malformed screen receipt entry", async () => {
    const result = await reportDelivery([
      { screenName: "MainHUD" } as unknown as StudioScreenReceipt,
      {
        screenName: "MainMenu",
        instancePath:
          "ReplicatedStorage.AIStudioArtifacts.UI_GENERATION.MainMenu",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/malformed screen receipt/);
  });
});
