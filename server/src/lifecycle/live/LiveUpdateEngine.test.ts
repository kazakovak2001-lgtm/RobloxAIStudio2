import { afterEach, describe, expect, it } from "vitest";
import { LiveUpdateEngine, type LivePatch } from "./LiveUpdateEngine";
import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";

function patch(target: string, action: LivePatch["action"], value: unknown) {
  return {
    id: `p-${target}`,
    target,
    action,
    value,
    reason: "test",
    timestamp: new Date(0),
  } satisfies LivePatch;
}

// The route hands the engine a JSON-parsed request body, so the blueprint and
// patches here are built the same way rather than as object literals.
function fromJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

const blueprint = () =>
  fromJson<RobloxGameBlueprint>(
    '{"id":"p1","economy":{"sources":[{"amount":5}]},"npcs":[{"behavior":"idle"},{"behavior":"walk"}]}',
  );

const probe = () =>
  ({}) as Record<string, unknown> & { polluted?: unknown; polluted2?: unknown };

describe("SEC-LIFECYCLE-PROTO-001 LiveUpdateEngine prototype pollution", () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted;
    delete (Object.prototype as Record<string, unknown>).polluted2;
  });

  it.each([
    "__proto__.polluted",
    "constructor.prototype.polluted",
    "__proto__[0].polluted",
    "npcs.__proto__.polluted",
    "economy.constructor.prototype.polluted",
  ])("refuses %s and leaves Object.prototype untouched", (target) => {
    const engine = new LiveUpdateEngine();
    const patches = fromJson<LivePatch[]>(
      JSON.stringify([patch(target, "set", "yes")]),
    );

    const result = engine.applyPatches(blueprint(), patches);

    expect(probe().polluted).toBeUndefined();
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("refuses a JSON body whose patch names __proto__ as the final field", () => {
    const engine = new LiveUpdateEngine();
    const result = engine.applyPatches(blueprint(), [
      patch("economy.__proto__", "set", { polluted2: true }),
    ]);

    expect(probe().polluted2).toBeUndefined();
    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it("does not follow inherited properties while navigating", () => {
    const engine = new LiveUpdateEngine();
    const result = engine.applyPatches(blueprint(), [
      patch("toString.name", "set", "x"),
      patch("hasOwnProperty.polluted", "set", "x"),
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
    expect(probe().polluted).toBeUndefined();
  });

  it("rejects a non-string target as an error instead of throwing out", () => {
    const engine = new LiveUpdateEngine();
    const result = engine.applyPatches(blueprint(), [
      { ...patch("x", "set", 1), target: 42 as unknown as string },
    ]);

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});

describe("LiveUpdateEngine legitimate patches", () => {
  it("applies set, increment, append and remove on own blueprint paths", () => {
    const engine = new LiveUpdateEngine();
    const original = blueprint();

    const result = engine.applyPatches(original, [
      patch("economy.sources[0].amount", "increment", 3),
      patch("npcs[1].behavior", "set", "patrol"),
      patch("economy.sources", "append", { amount: 1 }),
      patch("npcs[0]", "remove", null),
      patch("economy.newField", "set", 7),
    ]);

    expect(result.applied).toBe(5);
    expect(result.errors).toEqual([]);
    const out = result.resultingBlueprint as unknown as {
      economy: { sources: { amount: number }[]; newField: number };
      npcs: { behavior: string }[];
    };
    expect(out.economy.sources).toEqual([{ amount: 8 }, { amount: 1 }]);
    expect(out.economy.newField).toBe(7);
    expect(out.npcs).toEqual([{ behavior: "patrol" }]);
    // The input blueprint is cloned, never mutated.
    expect(original).toEqual(blueprint());
  });

  it("skips paths that do not exist instead of creating intermediate objects", () => {
    const engine = new LiveUpdateEngine();
    const result = engine.applyPatches(blueprint(), [
      patch("missing.child", "set", 1),
      patch("npcs[9].behavior", "set", "x"),
      patch("economy.sources[0].amount.deeper", "set", 1),
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.errors).toEqual([]);
  });
});
