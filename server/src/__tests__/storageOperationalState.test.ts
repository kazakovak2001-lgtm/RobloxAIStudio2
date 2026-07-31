import { describe, expect, it } from "vitest";
import { StorageOperationalState } from "../platform/storage/StorageOperationalState";

describe("StorageOperationalState", () => {
  it("reports available while connected without failures", () => {
    const state = new StorageOperationalState();

    expect(
      state.snapshot({
        connected: true,
        closed: false,
        durability: "durable",
        pendingMutations: 0,
      }),
    ).toEqual({
      availability: "available",
      durability: "durable",
      pendingMutations: 0,
    });
  });

  it("keeps infrastructure failure degraded even when connectivity probe succeeds", () => {
    const state = new StorageOperationalState();
    state.markFailure(
      "durable-mutation",
      "transaction",
      "2026-07-31T10:00:00.000Z",
    );

    expect(
      state.snapshot({
        connected: true,
        closed: false,
        durability: "durable",
        pendingMutations: 1,
      }),
    ).toEqual({
      availability: "degraded",
      durability: "durable",
      pendingMutations: 1,
      lastFailureAt: "2026-07-31T10:00:00.000Z",
      failureCategory: "durable-mutation",
      failureOperation: "transaction",
    });
  });

  it("clears degradation only after explicit recovery", () => {
    const state = new StorageOperationalState();
    state.markFailure(
      "connectivity",
      undefined,
      "2026-07-31T10:00:00.000Z",
    );
    state.markRecovery("2026-07-31T10:01:00.000Z");

    expect(
      state.snapshot({
        connected: true,
        closed: false,
        durability: "durable",
        pendingMutations: 0,
      }),
    ).toEqual({
      availability: "available",
      durability: "durable",
      pendingMutations: 0,
      lastRecoveryAt: "2026-07-31T10:01:00.000Z",
    });
  });

  it("reports closed providers unavailable regardless of prior recovery", () => {
    const state = new StorageOperationalState();
    state.markFailure("initialization", undefined, "2026-07-31T10:00:00.000Z");
    state.markRecovery("2026-07-31T10:01:00.000Z");

    expect(
      state.snapshot({
        connected: false,
        closed: true,
        durability: "durable",
        pendingMutations: 0,
      }).availability,
    ).toBe("unavailable");
  });
});
