/**
 * SERIALIZATION-1 / SERIALIZATION-001 — structure must survive into the prompt.
 *
 * Five agents summarised structures with `String(item?.name ?? item)`. When an
 * item had a name that worked; when it did not, the fallback stringified the
 * object and the prompt received the literal text `[object Object]`.
 *
 * That is a loss of the thing the pipeline had just built. The downstream model
 * was told a mechanic, a system or a module existed and given nothing about it,
 * at exactly the point the structure was supposed to be used — including in the
 * prompt that generates the Lua.
 */

import { describe, expect, it } from "vitest";
import { describeForPrompt, summariseForPrompt } from "../ai/promptValues";

describe("SERIALIZATION-1 describing a value", () => {
  it("prefers a name when there is one", () => {
    expect(describeForPrompt({ name: "Storm Generator", power: 9 })).toBe(
      "Storm Generator",
    );
  });

  it("carries the content when there is no name", () => {
    const described = describeForPrompt({ kind: "collect", target: 3 });

    // The case that used to become [object Object]. What matters is that the
    // information survives, not merely that the placeholder is gone.
    expect(described).not.toContain("[object Object]");
    expect(described).toContain("collect");
    expect(described).toContain("3");
  });

  it("never renders the placeholder for any object shape", () => {
    const shapes: unknown[] = [
      {},
      { name: "" },
      { name: 42 },
      { nested: { deep: { value: 1 } } },
      [{ a: 1 }, { b: 2 }],
    ];

    for (const shape of shapes) {
      expect(describeForPrompt(shape) ?? "").not.toContain("[object Object]");
    }
  });

  it("says nothing rather than something meaningless", () => {
    expect(describeForPrompt(null)).toBeNull();
    expect(describeForPrompt(undefined)).toBeNull();
    expect(describeForPrompt("   ")).toBeNull();
    expect(describeForPrompt({})).toBeNull();
  });

  it("survives a circular structure without throwing", () => {
    const circular: Record<string, unknown> = { name: undefined };
    circular.self = circular;

    expect(() => describeForPrompt(circular)).not.toThrow();
    expect(describeForPrompt(circular)).toBeNull();
  });

  it("bounds a very large value", () => {
    const huge = { blob: "x".repeat(10000) };

    const described = describeForPrompt(huge) ?? "";
    expect(described.length).toBeLessThan(500);
    expect(described.endsWith("…")).toBe(true);
  });
});

describe("SERIALIZATION-1 summarising a list", () => {
  it("keeps every item's information", () => {
    const summary = summariseForPrompt([
      { name: "Collect cores" },
      { kind: "hazard", damage: 10 },
      "Escape the storm",
    ]);

    expect(summary).toContain("Collect cores");
    expect(summary).toContain("hazard");
    expect(summary).toContain("Escape the storm");
    expect(summary).not.toContain("[object Object]");
  });

  it("drops empty entries instead of rendering blanks", () => {
    expect(summariseForPrompt([{ name: "Real" }, null, {}, "  "])).toBe("Real");
  });

  it("returns the placeholder for an empty list", () => {
    expect(summariseForPrompt([], "none")).toBe("none");
    expect(summariseForPrompt([null, {}], "core systems")).toBe("core systems");
  });

  it("accepts a single value as well as a list", () => {
    expect(summariseForPrompt({ name: "Solo" })).toBe("Solo");
  });
});

describe("SERIALIZATION-1 agent prompt construction", () => {
  it("no agent still stringifies an object into a prompt", async () => {
    const fs = await import("node:fs/promises");
    const dir = new URL("../agents/implementations/", import.meta.url);
    const files = await fs.readdir(dir);

    const offenders: string[] = [];
    for (const file of files.filter((entry) => entry.endsWith(".ts"))) {
      const source = await fs.readFile(new URL(file, dir), "utf8");
      // The exact fallback that produced the placeholder: stringify the item
      // itself when it has no name.
      if (/String\(\s*\w+\?\.name \?\? \w+\s*\)/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
