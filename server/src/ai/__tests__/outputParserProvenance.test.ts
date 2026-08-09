/**
 * PROVIDER-1B — fallback provenance at the parser boundary.
 *
 * "The LLM was called" is not "the LLM authored the artifact". Deterministic
 * fallback content enters here in two ways, and before this slice neither was
 * visible to the caller, so an execution built entirely from canned values
 * could still be recorded as `ai_mode: "ai"`.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { LLMOutputParser } from "../outputParser";

const REQUIRED = ["uiDesign"];
const FALLBACK = { uiDesign: { canned: true }, extra: "canned" };

afterEach(() => {
  vi.restoreAllMocks();
});

function parse(raw: string) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return LLMOutputParser.parseWithProvenance(raw, REQUIRED, FALLBACK, "Test");
}

describe("parseWithProvenance", () => {
  it("reports none when the model supplied every required key", () => {
    const result = parse('{"uiDesign":{"screens":[]}}');

    expect(result.fallbackUsage).toBe("none");
    expect(result.fallbackKeys).toEqual([]);
    expect(result.data.uiDesign).toEqual({ screens: [] });
  });

  it("reports none for a model response wrapped in prose and fences", () => {
    const result = parse('Sure!\n```json\n{"uiDesign":{"screens":[]}}\n```');

    expect(result.fallbackUsage).toBe("none");
  });

  /**
   * The dangerous case. The response cannot be parsed, so the entire canned
   * fallback is substituted — which means every required key is present and
   * the old `validateKeys` check saw nothing wrong.
   */
  it("reports full when the response could not be parsed at all", () => {
    const result = parse("I'm sorry, I can't help with that.");

    expect(result.fallbackUsage).toBe("full");
    expect(result.data.uiDesign).toEqual({ canned: true });
    expect(result.fallbackKeys).toEqual(Object.keys(FALLBACK));
  });

  it("reports partial when a required key was repaired from the fallback", () => {
    const result = parse('{"somethingElse":1}');

    expect(result.fallbackUsage).toBe("partial");
    expect(result.fallbackKeys).toEqual(["uiDesign"]);
    // The model's own key survives alongside the repaired one.
    expect(result.data.somethingElse).toBe(1);
    expect(result.data.uiDesign).toEqual({ canned: true });
  });

  it("treats a top-level array as model content, not fallback", () => {
    const result = LLMOutputParser.parseWithProvenance(
      "[1,2,3]",
      [],
      FALLBACK,
      "Test",
    );

    expect(result.fallbackUsage).toBe("none");
    expect(result.data.items).toEqual([1, 2, 3]);
  });

  it("keeps parseAndValidate behaviour unchanged for existing callers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      LLMOutputParser.parseAndValidate(
        '{"somethingElse":1}',
        REQUIRED,
        FALLBACK,
        "Test",
      ),
    ).toEqual(parse('{"somethingElse":1}').data);
  });

  /**
   * Documents why provenance has to be tracked structurally rather than
   * derived after the fact: once merged, a canned value is indistinguishable
   * from a generated one by inspection alone.
   */
  it("cannot be inferred from the content, which is why it is metadata", () => {
    const repaired = parse('{"somethingElse":1}');
    const authored = parse('{"uiDesign":{"canned":true}}');

    expect(repaired.data.uiDesign).toEqual(authored.data.uiDesign);
    expect(repaired.fallbackUsage).not.toBe(authored.fallbackUsage);
  });
});
