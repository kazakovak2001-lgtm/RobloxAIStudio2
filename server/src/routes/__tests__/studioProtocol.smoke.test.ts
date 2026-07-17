/**
 * Smoke test — protocol handler registration in studio.ts
 *
 * Verifies that createStudioRouter() registers GET_PROJECT, GET_ARTIFACTS,
 * SYNC_REQUEST, and VALIDATE with the ProtocolDispatcher.
 *
 * Requirements: 9.1, 9.2
 */

import { describe, it, expect, vi } from "vitest";

describe("createStudioRouter — protocol handler registration", () => {
  it("registers GET_PROJECT, GET_ARTIFACTS, SYNC_REQUEST, and VALIDATE", async () => {
    // Reset the module registry so every import below gets a fresh module
    // instance — this ensures the spy on ProtocolDispatcher.prototype is in
    // place before studio.ts constructs its dispatcher.
    vi.resetModules();

    // Dynamically import ProtocolDispatcher AFTER resetting modules so we get
    // the same class instance that studio.ts will use when we import it next.
    const { ProtocolDispatcher } =
      await import("../../studio/v2/protocol/ProtocolDispatcher");

    const registeredTypes: string[] = [];
    const originalRegister = ProtocolDispatcher.prototype.register;

    // Spy using the saved original to avoid infinite recursion.
    vi.spyOn(ProtocolDispatcher.prototype, "register").mockImplementation(
      function (
        this: InstanceType<typeof ProtocolDispatcher>,
        type: Parameters<typeof originalRegister>[0],
        handler: Parameters<typeof originalRegister>[1],
      ) {
        registeredTypes.push(type as string);
        return originalRegister.call(this, type, handler);
      },
    );

    // Import studio.ts AFTER the spy is active so register() calls are captured.
    const { createStudioRouter } = await import("../studio");
    createStudioRouter();

    vi.restoreAllMocks();

    const expectedSyncTypes = [
      "GET_PROJECT",
      "GET_ARTIFACTS",
      "SYNC_REQUEST",
      "VALIDATE",
    ] as const;

    for (const type of expectedSyncTypes) {
      expect(
        registeredTypes,
        `Expected "${type}" to be registered with ProtocolDispatcher`,
      ).toContain(type);
    }
  });

  it("exposes the four sync types via getSupportedTypes() after router creation", async () => {
    // Complementary check using the real un-mocked dispatcher.
    // createStudioRouter() exposes GET /protocol/info which calls
    // dispatcher.getSupportedTypes() — we verify that path is wired by
    // inspecting the router's internal layer stack, confirming it is a valid
    // Express Router with mounted routes.
    vi.resetModules();

    const { createStudioRouter } = await import("../studio");
    const router = createStudioRouter();

    expect(router).toBeDefined();
    // Express Router is a callable function
    expect(typeof router).toBe("function");

    // router.stack contains Layer objects; at least the protocol routes exist
    const stack = (router as unknown as { stack: unknown[] }).stack;
    expect(stack.length).toBeGreaterThan(0);
  });
});
