import { LLMOutputParser } from "../server/src/ai/outputParser";

const fallback = { gameplay: { mechanics: [] } };

const c1 = LLMOutputParser.parseAndValidate(
  '{"gameplay":{"mechanics":[]}}',
  ["gameplay"],
  fallback,
  "test",
);
console.log("Case 1 (pure JSON):", "gameplay" in c1 ? "PASS" : "FAIL");

const c2 = LLMOutputParser.parseAndValidate(
  '```json\n{"gameplay":{"mechanics":[]}}\n```',
  ["gameplay"],
  fallback,
  "test",
);
console.log("Case 2 (markdown):", "gameplay" in c2 ? "PASS" : "FAIL");

const c3 = LLMOutputParser.parseAndValidate(
  '{"gameplaySystems":{"mining":{}}}',
  ["gameplay"],
  fallback,
  "test",
);
console.log(
  "Case 3 (alias):",
  "gameplay" in c3 ? "PASS" : "FAIL",
  JSON.stringify(c3.gameplay),
);

const c4 = LLMOutputParser.parseAndValidate(
  "not json",
  ["gameplay"],
  fallback,
  "test",
);
console.log("Case 4 (invalid):", "gameplay" in c4 ? "PASS (fallback)" : "FAIL");
