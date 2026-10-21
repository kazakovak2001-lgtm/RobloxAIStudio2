/**
 * LLM-PARSER-1 / LLM-PARSER-001 — find the JSON, leave the prose.
 *
 * Extraction sliced from the first bracket to the end of the string and parsed
 * that. Any trailing commentary therefore destroyed a response whose JSON was
 * perfectly good, which is one of the ways canonical Lua generation failed to
 * produce a package even when the model had answered correctly.
 *
 * Scanning to the matching bracket fixes that, and the interesting cases are
 * the ones where a naive scan would get it wrong: braces inside strings, which
 * generated Luau is full of; escaped quotes; several objects in one response;
 * and a response cut off mid-object, which must fail rather than parse a
 * fragment.
 */

import { describe, expect, it } from "vitest";
import { LLMOutputParser } from "../ai/outputParser";

describe("LLM-PARSER-1 balanced JSON extraction", () => {
  it("ignores prose after the object", () => {
    const raw = '{"valid":"json"}\nHere is an explanation of what I did.';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ valid: "json" });
  });

  it("ignores prose before the object", () => {
    const raw = 'Sure! Here is the result:\n{"valid":"json"}';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ valid: "json" });
  });

  it("ignores prose on both sides", () => {
    const raw = 'Thinking...\n{"a":1}\nLet me know if you want changes.';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ a: 1 });
  });

  it("keeps nested structures intact", () => {
    const raw = 'x {"outer":{"inner":{"deep":[1,2,{"deeper":true}]}}} y';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({
      outer: { inner: { deep: [1, 2, { deeper: true }] } },
    });
  });

  it("does not count braces inside strings", () => {
    // Generated Luau arrives inside JSON strings and is full of braces. A scan
    // that counted them would close the object in the wrong place.
    const raw =
      '{"scripts":[{"path":"Server.lua","content":"local t = {} for i=1,3 do t[i] = {id=i} end"}]} trailing words';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({
      scripts: [
        {
          path: "Server.lua",
          content: "local t = {} for i=1,3 do t[i] = {id=i} end",
        },
      ],
    });
  });

  it("handles escaped quotes inside strings", () => {
    const raw = '{"code":"print(\\"hello }\\")"} and some prose';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({
      code: 'print("hello }")',
    });
  });

  it("takes the first complete object when several are present", () => {
    const raw = '{"first":1}\n{"second":2}';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ first: 1 });
  });

  it("refuses a response cut off before its closing brace", () => {
    // A truncated response is not a partial success. Parsing a fragment would
    // hand downstream a design the model never finished stating.
    const raw = '{"scripts":[{"path":"Server.lua","content":"local x = 1"';

    expect(LLMOutputParser.extractJSON(raw)).toBeNull();
  });

  it("still prefers a fenced block", () => {
    const raw = 'Here you go:\n```json\n{"fenced":true}\n```\nAnything else?';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ fenced: true });
  });

  it("falls through to the scan when the fence holds nothing parseable", () => {
    const raw = '```\nnot json at all\n```\n{"actual":"payload"}';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ actual: "payload" });
  });

  it("extracts a top-level array with prose around it", () => {
    const raw = 'Results:\n[{"id":1},{"id":2}]\nThat is all.';

    expect(LLMOutputParser.extractJSON(raw)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("skips a malformed leading object and finds the good one", () => {
    // The first bracket does not always start the answer.
    const raw = '{not: valid} then {"good":"one"}';

    expect(LLMOutputParser.extractJSON(raw)).toEqual({ good: "one" });
  });

  it("returns null when there is no JSON at all", () => {
    expect(LLMOutputParser.extractJSON("I could not do that.")).toBeNull();
    expect(LLMOutputParser.extractJSON("")).toBeNull();
  });
});
